"""
Self-Healing Diagnostic Loop for AuditFlow.

When a Docker build or execution fails, this module engages a ReAct
(Reason + Act) loop powered by Azure OpenAI GPT-4o to autonomously
diagnose and repair the container environment.

Design
------
The :class:`SelfHealingLoop` is given a *toolbox* — four Python-backed
functions that GPT-4o can invoke via Azure OpenAI function calling:

* ``execute_bash_command``   — run an arbitrary shell command inside a
                               live diagnostic container and return its
                               combined STDOUT + STDERR.
* ``read_file_content``      — cat a specific file path inside the
                               container.
* ``list_directory_contents``— ls a directory path inside the container.
* ``update_dockerfile``      — overwrite the in-memory Dockerfile with a
                               corrected version.

The loop runs for at most :data:`_MAX_HEAL_ITERATIONS` rounds.  Each
round consists of:

1. A GPT-4o chat completion call that may produce one or more tool calls.
2. Local execution of every tool call.
3. Tool results appended to the message history.
4. Repeat.

The loop terminates early when GPT-4o emits the text ``READY_TO_RETRY``
(fix applied, caller should rebuild) or ``CANNOT_FIX:`` (problem is
intractable).

Exponential back-off with full jitter is applied to every Azure OpenAI
call so that transient 429 RateLimitErrors are handled without manual
intervention.
"""

from __future__ import annotations

import json
import logging
import random
import shlex
import time
from typing import Any, Optional

import docker
from docker.errors import APIError, DockerException
from openai import AzureOpenAI, RateLimitError

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tuning constants
# ---------------------------------------------------------------------------

#: Maximum number of tool-call rounds before the loop gives up.
_MAX_HEAL_ITERATIONS: int = 3

#: Hard cap on tool output returned to GPT-4o (characters).
#: Keeps context windows manageable; truncated output is annotated.
_MAX_TOOL_OUTPUT_CHARS: int = 4_000

#: Hard cap on the error log passed to GPT-4o in the first user message.
_MAX_ERROR_LOG_CHARS: int = 6_000

#: Exponential back-off multiplier for 429 retries.
_BACKOFF_BASE: float = 2.0

#: Ceiling for the computed sleep interval (seconds).
_BACKOFF_MAX: float = 60.0

#: Number of 429 retry attempts before re-raising.
_BACKOFF_MAX_RETRIES: int = 6

# ---------------------------------------------------------------------------
# Tool schema — passed verbatim to the Azure OpenAI API
# ---------------------------------------------------------------------------

_TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "execute_bash_command",
            "description": (
                "Run a shell command inside the live Docker diagnostic container "
                "and return the combined STDOUT + STDERR. Use this to investigate "
                "the environment: check the Python version, list installed packages, "
                "verify file existence, or probe why a command failed."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": (
                            "Shell command to run, e.g. "
                            "'python --version', "
                            "'pip list | grep torch', "
                            "'ls /workspace/repo', "
                            "'python -c \"import numpy\"'."
                        ),
                    }
                },
                "required": ["command"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_file_content",
            "description": (
                "Return the full text content of a file inside the container "
                "(e.g. /workspace/repo/README.md, "
                "/workspace/repo/requirements.txt, "
                "/workspace/repo/setup.py). "
                "Use this to understand what the repository expects."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Absolute path to the file inside the container.",
                    }
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_directory_contents",
            "description": (
                "List files and sub-directories at a given path inside the "
                "container. Useful for discovering the repo layout, locating "
                "the correct entry-point script, or confirming a directory exists."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Absolute path to the directory inside the container.",
                    }
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_dockerfile",
            "description": (
                "Overwrite the current Dockerfile with corrected content. "
                "Call this exactly once after you have diagnosed the root cause "
                "and determined the minimal fix (wrong entry-point, missing apt "
                "package, bad pip install, etc.). "
                "After calling this tool, your very next response MUST be "
                "the exact string: READY_TO_RETRY"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "new_content": {
                        "type": "string",
                        "description": "Complete replacement Dockerfile (all lines, no truncation).",
                    }
                },
                "required": ["new_content"],
            },
        },
    },
]

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT: str = """\
You are a Senior Infrastructure Auditor and Docker specialist embedded \
inside AuditFlow, an autonomous ML research paper reproducibility system.

Your sole task: diagnose a Docker build or execution failure and apply \
the minimal Dockerfile fix so the build/run can succeed on retry.

You have access to a live diagnostic container that mirrors the failed \
environment. Use your tools to investigate before modifying anything.

STRICT OPERATING RULES — follow exactly:
1. NEVER output conversational text, apologies, or markdown explanations.
2. ONLY make tool calls OR emit one of the two terminal signals below.
3. Investigate root cause first; do not guess. Common causes:
   - Wrong entry-point path (script in a sub-directory, different filename)
   - Missing pip dependency not inferred from the paper
   - Missing system package (apt-get) needed by a C extension
   - Python version incompatibility (e.g. repo requires 3.11, image uses 3.10)
   - Bad CMD syntax or WORKDIR mismatch
4. Call update_dockerfile exactly once when you know the fix. After that,
   your NEXT response must be ONLY the text: READY_TO_RETRY
5. If the failure is fundamentally unfixable (private repo, broken code,
   auth required), respond ONLY with: CANNOT_FIX: <one-line reason>

You have at most 3 tool-call rounds. Use them efficiently.\
"""


# ---------------------------------------------------------------------------
# Main class
# ---------------------------------------------------------------------------

class SelfHealingLoop:
    """
    GPT-4o-powered ReAct loop that diagnoses and repairs a failing Docker
    build or run environment.

    Parameters
    ----------
    oai_client:
        An initialised :class:`openai.AzureOpenAI` instance.
    deployment:
        The Azure OpenAI deployment name (e.g. ``"gpt-4o"``).
    docker_client:
        An initialised Docker SDK client (``docker.from_env()``).
    base_image:
        Fallback image used as the diagnostic container when the Docker
        build itself never completed — i.e. there is no image to
        introspect.  Defaults to ``"python:3.10-slim"``.
    """

    def __init__(
        self,
        oai_client: AzureOpenAI,
        deployment: str,
        docker_client: "docker.DockerClient",
        base_image: str = "python:3.10-slim",
    ) -> None:
        self._oai = oai_client
        self._deployment = deployment
        self._docker = docker_client
        self._base_image = base_image

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run(
        self,
        *,
        error_logs: str,
        dockerfile_text: str,
        image_tag: Optional[str] = None,
    ) -> tuple[str, bool]:
        """
        Engage the ReAct diagnostic loop for a failed Docker operation.

        Parameters
        ----------
        error_logs:
            Combined STDOUT/STDERR from the failed build or container run.
            Truncated to :data:`_MAX_ERROR_LOG_CHARS` before being sent to
            the model to avoid token-limit issues.
        dockerfile_text:
            The Dockerfile content that produced the failure.  GPT-4o may
            replace this via the ``update_dockerfile`` tool.
        image_tag:
            Tag of the successfully-built image (``None`` when the Docker
            *build* itself failed and no image was created).  When provided,
            the diagnostic container is started from this image so GPT-4o
            can inspect the cloned repository and its installed packages.
            When ``None``, the diagnostic container starts from
            :attr:`base_image` (a vanilla Python slim image).

        Returns
        -------
        (updated_dockerfile, ready_to_retry):
            ``updated_dockerfile``  — the (possibly modified) Dockerfile
            string.  Identical to the input when the loop made no changes.

            ``ready_to_retry`` — ``True`` when GPT-4o signalled
            ``READY_TO_RETRY``, indicating the caller should attempt a
            fresh ``docker build`` + ``docker run`` with the returned
            Dockerfile.  ``False`` in all other cases (``CANNOT_FIX``,
            loop exhausted, or infrastructure errors).
        """
        diag_container = self._start_diagnostic_container(image_tag)
        if diag_container is None:
            logger.warning(
                "[healer] could not start diagnostic container — "
                "skipping GPT-4o ReAct loop."
            )
            return dockerfile_text, False

        current_dockerfile = dockerfile_text
        truncated_logs = error_logs[:_MAX_ERROR_LOG_CHARS]
        if len(error_logs) > _MAX_ERROR_LOG_CHARS:
            truncated_logs += (
                f"\n... [truncated — "
                f"{len(error_logs) - _MAX_ERROR_LOG_CHARS} chars omitted]"
            )

        messages: list[dict] = [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "AuditFlow detected a Docker failure. Diagnose and fix it.\n\n"
                    f"=== ERROR LOG ===\n{truncated_logs}\n\n"
                    f"=== CURRENT DOCKERFILE ===\n{dockerfile_text}"
                ),
            },
        ]

        try:
            for iteration in range(_MAX_HEAL_ITERATIONS):
                logger.info(
                    "[healer] ReAct iteration %d/%d",
                    iteration + 1, _MAX_HEAL_ITERATIONS,
                )

                response = self._call_llm_with_backoff(messages)
                msg = response.choices[0].message
                content_text = (msg.content or "").strip()

                # ── Terminal signals ──────────────────────────────────────
                if "READY_TO_RETRY" in content_text:
                    logger.info(
                        "[healer] GPT-4o signalled READY_TO_RETRY after "
                        "%d iteration(s).",
                        iteration + 1,
                    )
                    return current_dockerfile, True

                if "CANNOT_FIX" in content_text:
                    logger.warning(
                        "[healer] GPT-4o signalled CANNOT_FIX: %.200s",
                        content_text,
                    )
                    return current_dockerfile, False

                # ── No tool calls and no terminal signal ──────────────────
                if not msg.tool_calls:
                    logger.warning(
                        "[healer] GPT-4o produced no tool calls on iteration %d "
                        "and no terminal signal — aborting loop.",
                        iteration + 1,
                    )
                    break

                # ── Append assistant turn (tool_calls included) ───────────
                messages.append(
                    self._serialise_assistant_message(msg, content_text)
                )

                # ── Execute every tool call in this turn ──────────────────
                for tc in msg.tool_calls:
                    tool_result, updated_df = self._dispatch_tool(
                        tc, diag_container, current_dockerfile
                    )
                    if updated_df is not None:
                        current_dockerfile = updated_df
                        logger.info(
                            "[healer] Dockerfile updated by GPT-4o "
                            "(tool_call_id=%s).",
                            tc.id,
                        )
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tc.id,
                            "content": tool_result,
                        }
                    )

        finally:
            self._teardown_diagnostic_container(diag_container)

        logger.warning(
            "[healer] loop exhausted %d iterations without a terminal signal.",
            _MAX_HEAL_ITERATIONS,
        )
        return current_dockerfile, False

    # ------------------------------------------------------------------
    # Tool dispatch
    # ------------------------------------------------------------------

    def _dispatch_tool(
        self,
        tool_call: Any,
        container: "docker.models.containers.Container",
        current_dockerfile: str,
    ) -> tuple[str, Optional[str]]:
        """
        Route a single GPT-4o tool call to the appropriate Python handler.

        Returns
        -------
        (result_text, new_dockerfile_or_None):
            ``result_text`` — the string fed back into the GPT-4o context as
            the tool's response.
            ``new_dockerfile_or_None`` — a replacement Dockerfile when the
            tool was ``update_dockerfile``, otherwise ``None``.
        """
        name = tool_call.function.name
        try:
            args = json.loads(tool_call.function.arguments or "{}")
        except json.JSONDecodeError as exc:
            return f"[error] could not parse arguments for {name}: {exc}", None

        logger.info(
            "[healer] dispatching tool=%r args=%s",
            name,
            str(args)[:200],
        )

        if name == "execute_bash_command":
            cmd = args.get("command", "")
            return self._exec_in_container(container, cmd), None

        if name == "read_file_content":
            path = args.get("path", "")
            return self._exec_in_container(
                container, f"cat {shlex.quote(path)}"
            ), None

        if name == "list_directory_contents":
            path = args.get("path", "")
            return self._exec_in_container(
                container, f"ls -la {shlex.quote(path)}"
            ), None

        if name == "update_dockerfile":
            new_content = args.get("new_content", "")
            if not new_content.strip():
                return (
                    "[error] update_dockerfile was called with empty content "
                    "— change ignored.",
                    None,
                )
            return "[auditflow] Dockerfile updated successfully.", new_content

        return f"[error] unknown tool name: {name!r}", None

    # ------------------------------------------------------------------
    # Diagnostic container lifecycle
    # ------------------------------------------------------------------

    def _start_diagnostic_container(
        self,
        image_tag: Optional[str],
    ) -> Optional["docker.models.containers.Container"]:
        """
        Start a long-lived diagnostic container that stays alive for the
        duration of the ReAct loop.

        When ``image_tag`` is provided the container is created from the
        already-built image (so GPT-4o can inspect the cloned repo and
        its installed packages).  When ``image_tag`` is ``None`` (build
        failure) the container is created from :attr:`_base_image`.

        The container's entrypoint is overridden to ``sleep 300`` so it
        remains idle and exec-able regardless of what the image's default
        CMD is.
        """
        image = image_tag if image_tag else self._base_image
        try:
            container = self._docker.containers.run(
                image=image,
                entrypoint=["sh"],
                command=["-c", "sleep 300"],
                detach=True,
                remove=False,
                mem_limit="512m",
                network_disabled=False,
            )
            logger.info(
                "[healer] diagnostic container %s started from image=%r",
                container.short_id,
                image,
            )
            return container
        except (APIError, DockerException) as exc:
            logger.error(
                "[healer] failed to start diagnostic container from %r: %s",
                image,
                exc,
            )
            return None

    def _teardown_diagnostic_container(
        self,
        container: "docker.models.containers.Container",
    ) -> None:
        """Stop and forcibly remove the diagnostic container."""
        try:
            container.stop(timeout=5)
        except DockerException:
            pass
        try:
            container.remove(force=True)
        except DockerException:
            pass

    # ------------------------------------------------------------------
    # Container exec helper
    # ------------------------------------------------------------------

    def _exec_in_container(
        self,
        container: "docker.models.containers.Container",
        command: str,
    ) -> str:
        """
        Run ``command`` inside ``container`` via ``exec_run`` and return
        the combined output, clipped to :data:`_MAX_TOOL_OUTPUT_CHARS`.
        """
        if not command.strip():
            return "[error] empty command received"

        try:
            result = container.exec_run(
                cmd=["sh", "-c", command],
                stdout=True,
                stderr=True,
            )
            raw = (result.output or b"").decode("utf-8", errors="replace").strip()
            if not raw:
                return f"(exit_code={result.exit_code}, no output)"
            clipped = raw[:_MAX_TOOL_OUTPUT_CHARS]
            if len(raw) > _MAX_TOOL_OUTPUT_CHARS:
                clipped += (
                    f"\n... [truncated — "
                    f"{len(raw) - _MAX_TOOL_OUTPUT_CHARS} chars omitted]"
                )
            return clipped
        except (APIError, DockerException) as exc:
            return f"[error] exec_run failed: {exc}"

    # ------------------------------------------------------------------
    # Azure OpenAI call with exponential back-off + full jitter
    # ------------------------------------------------------------------

    def _call_llm_with_backoff(self, messages: list[dict]) -> Any:
        """
        Call the Azure OpenAI chat completions endpoint.

        Retries on :class:`openai.RateLimitError` (HTTP 429) using
        exponential back-off with full jitter::

            sleep = uniform(0, min(cap, base * 2 ** attempt))

        Raises
        ------
        RateLimitError
            After :data:`_BACKOFF_MAX_RETRIES` unsuccessful attempts.
        Exception
            Any non-rate-limit error is re-raised immediately.
        """
        for attempt in range(_BACKOFF_MAX_RETRIES + 1):
            try:
                return self._oai.chat.completions.create(
                    model=self._deployment,
                    messages=messages,
                    tools=_TOOLS,
                    tool_choice="auto",
                    temperature=0,
                )
            except RateLimitError as exc:
                if attempt >= _BACKOFF_MAX_RETRIES:
                    logger.error(
                        "[healer] 429 RateLimitError not resolved after "
                        "%d retries — re-raising.",
                        _BACKOFF_MAX_RETRIES,
                    )
                    raise

                cap = min(_BACKOFF_MAX, _BACKOFF_BASE ** attempt)
                sleep_time = random.uniform(0, cap)  # full jitter
                logger.warning(
                    "[healer] 429 RateLimitError (attempt %d/%d) — "
                    "sleeping %.1fs. %s",
                    attempt + 1,
                    _BACKOFF_MAX_RETRIES,
                    sleep_time,
                    exc,
                )
                time.sleep(sleep_time)

        # Unreachable — the loop always either returns or raises.
        raise RuntimeError("[healer] _call_llm_with_backoff exhausted unexpectedly")  # pragma: no cover

    # ------------------------------------------------------------------
    # Internal serialisation helper
    # ------------------------------------------------------------------

    @staticmethod
    def _serialise_assistant_message(msg: Any, content_text: str) -> dict:
        """
        Convert an OpenAI :class:`ChatCompletionMessage` (which may
        contain :class:`ChatCompletionMessageToolCall` objects) into a
        plain dict suitable for appending to the messages list.

        The OpenAI Python SDK's message objects are not directly JSON-
        serialisable, so we extract the fields we need manually.
        """
        return {
            "role": "assistant",
            "content": content_text or None,
            "tool_calls": [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    },
                }
                for tc in (msg.tool_calls or [])
            ],
        }
