"""
Recursive Diagnostic Agent for AuditFlow.

This module replaces AuditFlow's previous hard-coded error handling
(entry-point heuristics, single-shot Dockerfile patches) with a true
**Recursive Agentic Loop**:

    Observe -> Think -> Act -> Observe -> Think -> Act -> ...

The :class:`DiagnosticAgent` owns the entire diagnose / patch / rebuild /
verify cycle.  It is given a Docker failure (build error, non-zero exit
code, SDK exception) plus a live diagnostic container, and is allowed to
autonomously:

* introspect the filesystem and read source files,
* run probe commands inside the live container,
* mutate the Dockerfile / environment variables,
* rebuild and re-run the project,
* and iterate until either the project runs to completion or the agent
  signals it cannot make further progress.

Architecture
------------

The agent uses Azure OpenAI GPT-4o with **function calling**.  Five
tools are exposed:

* ``inspect_filesystem(path)``           - ``find`` / ``ls -R`` based
  enumeration of the cloned repository.
* ``read_file(path)``                    - cat a file inside the
  diagnostic container (READMEs, ``setup.py``, ``.py`` modules).
* ``execute_diagnostic_command(command)``- run an arbitrary probe in the
  diagnostic container (``pip list``, ``python -c "import sys"``, ...).
* ``modify_infrastructure(...)``         - patch the Dockerfile and/or
  environment variables, then automatically rebuild and re-run.  The
  result of the rebuild is fed back into the loop as a fresh observation.
* ``submit_final_audit()``               - terminate the loop with the
  current best-known build/run outcome.  Should only be called when the
  most recent run finished with exit code 0.

State management
----------------

Every call to ``modify_infrastructure`` is recorded in
:class:`DiagnosticAgent.attempted_fixes` together with the agent's stated
hypothesis and a coarse strategy category (``pip_package``,
``apt_package``, ``pythonpath``, ``python_version``, ``entry_point``,
``workdir``, ``env_var``, ``other``).  When the same strategy category
fails twice the next observation injected into the conversation contains
an explicit instruction:

    "Your previous {category} hypotheses have failed 2 times.  You MUST
    formulate a fundamentally different hypothesis."

This prevents the classic LLM loop where the model keeps trying minor
variations of the same broken idea.

Reasoning log
-------------

Every iteration the agent records a :class:`ReasoningStep` with the
phase (think / act / observe), tool name, arguments, observation, and a
human-readable summary.  The full log is returned alongside the final
result so the caller can render it in the UI ("Hypothesis: missing apt
package libgl1 -> Action: apt-get install libgl1 -> Observation: import
succeeded").
"""

from __future__ import annotations

import io
import json
import logging
import random
import re
import shlex
import tarfile
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

import docker
from docker.errors import APIError, BuildError, DockerException
from openai import AzureOpenAI, RateLimitError

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tuning constants
# ---------------------------------------------------------------------------

#: Maximum number of LLM tool-call rounds before the agent gives up.
#: Sized so that a typical sequence (3-4 inspections, 1-2 rebuilds, 1-2
#: post-rebuild inspections, recovery rebuild, terminate) fits comfortably.
_MAX_AGENT_ITERATIONS: int = 12

#: Maximum number of full rebuild + run cycles the agent can trigger.
#: Each ``modify_infrastructure`` call costs one rebuild attempt.
_MAX_REBUILD_ATTEMPTS: int = 5

#: Hard cap on tool output returned to GPT-4o (characters).  Keeps the
#: context window manageable; truncated output is annotated.
_MAX_TOOL_OUTPUT_CHARS: int = 4_000

#: Hard cap on the error log forwarded to GPT-4o in the first user
#: message.  Older lines are dropped from the head, newest preserved.
_MAX_ERROR_LOG_CHARS: int = 6_000

#: Exponential back-off multiplier for 429 retries.
_BACKOFF_BASE: float = 2.0

#: Ceiling for the computed sleep interval (seconds).
_BACKOFF_MAX: float = 60.0

#: Number of 429 retry attempts before re-raising.
_BACKOFF_MAX_RETRIES: int = 6

#: Threshold at which the agent is forced to switch hypothesis category.
_HYPOTHESIS_LOCK_THRESHOLD: int = 2

#: Recognised strategy categories.  Anything outside this set is mapped
#: to ``"other"`` to keep the failure-count book-keeping consistent.
_KNOWN_STRATEGIES: frozenset[str] = frozenset({
    "pip_package",
    "apt_package",
    "pythonpath",
    "python_version",
    "entry_point",
    "workdir",
    "env_var",
    "other",
})

#: Recognises a Dockerfile ``CMD`` or ``ENTRYPOINT`` directive.  Used by
#: :meth:`DiagnosticAgent._inject_env_vars` to find the safest insertion
#: point for a new ``ENV`` line - just before the runtime entrypoint, so
#: the new value applies but every preceding layer is unaffected.
_CMD_LINE_RE = re.compile(r"^\s*(CMD|ENTRYPOINT)\b", re.IGNORECASE)

#: Extracts the JSON array from a Dockerfile ``CMD`` instruction, e.g.
#: ``CMD ["python", "train.py"]`` → ``'["python", "train.py"]'``.
#: Used by :func:`_dockerfile_runs_real_script` to validate that the
#: container will execute a real repository file rather than a trivial
#: inline expression.
_CMD_JSON_RE = re.compile(r'^\s*CMD\s+(\[.+\])\s*$', re.MULTILINE)

#: Lines we consider as the "signature" of a runtime failure when
#: comparing two error logs.  Anything matching one of these patterns
#: is the kind of message a human would naturally describe as "the
#: error" - tracebacks, package-resolution failures, exec errors.  The
#: comparison is deliberately fuzzy: paths and PIDs change between
#: runs but the error class + message + filename usually do not.
_ERROR_SIGNATURE_RE = re.compile(
    r"^(?:Error|Traceback|"
    r"\w+Error: |\w+Exception: |"
    r"ModuleNotFoundError|ImportError|FileNotFoundError|"
    r"python:|/bin/sh:|exec:|"
    r"E: |ERROR:)",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Tool schema - passed verbatim to the Azure OpenAI API
# ---------------------------------------------------------------------------

_TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "inspect_filesystem",
            "description": (
                "Enumerate files and directories inside the diagnostic "
                "container.  Use this to understand the cloned repository's "
                "layout - locate the real entry-point script, find a "
                "setup.py / pyproject.toml, or check whether a package is "
                "vendored alongside the project root.  Internally runs "
                "either `find <path> -maxdepth N -not -path '*/.*'` or "
                "`ls -laR <path>` depending on the depth requested."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": (
                            "Absolute path inside the container, e.g. "
                            "'/workspace/repo' or '/usr/local/lib/python3.10'."
                        ),
                    },
                    "max_depth": {
                        "type": "integer",
                        "description": (
                            "Maximum directory depth.  Use 1-2 for a quick "
                            "look, 3-4 for a thorough sweep.  Defaults to 3."
                        ),
                        "default": 3,
                    },
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": (
                "Return the full text content of a file inside the "
                "diagnostic container - typically README.md, setup.py, "
                "pyproject.toml, requirements.txt, or a small .py module "
                "to understand the project's import structure."
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
            "name": "execute_diagnostic_command",
            "description": (
                "Run an arbitrary shell command inside the live diagnostic "
                "container and return its combined STDOUT + STDERR.  Use "
                "this for quick probes BEFORE committing to a Dockerfile "
                "change: `pip list`, `env`, `python --version`, "
                "`python -c \"import sys; print(sys.path)\"`, "
                "`apt-get install -y libgl1 && python -c 'import cv2'`. "
                "Verifying a fix here is much cheaper than triggering a "
                "full rebuild via modify_infrastructure."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "Shell command to execute (passed to `sh -c`).",
                    }
                },
                "required": ["command"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "modify_infrastructure",
            "description": (
                "Commit a fix to the Dockerfile and/or environment "
                "variables, then automatically trigger one rebuild + re-run "
                "cycle.  The result of that cycle (build success, exit "
                "code, runtime logs) is returned as the tool's observation. "
                "You MUST first verify the fix in the live container with "
                "execute_diagnostic_command - rebuilds are expensive."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "dockerfile_changes": {
                        "type": "string",
                        "description": (
                            "Complete replacement Dockerfile.  Provide all "
                            "lines, no truncation, no placeholders.  Pass "
                            "an empty string when only env_vars need to "
                            "change."
                        ),
                    },
                    "env_vars": {
                        "type": "object",
                        "description": (
                            "Environment variables to set inside the "
                            "container.  Merged into the Dockerfile as ENV "
                            "directives - existing keys are overwritten. "
                            "Example: {'PYTHONPATH': '/workspace/repo'}."
                        ),
                        "additionalProperties": {"type": "string"},
                    },
                    "hypothesis": {
                        "type": "string",
                        "description": (
                            "One-sentence explanation of WHY this change "
                            "should fix the failure.  Logged to the user-"
                            "visible Reasoning Log."
                        ),
                    },
                    "strategy_category": {
                        "type": "string",
                        "description": (
                            "Coarse classification of the fix so the agent "
                            "can detect repeated failures and pivot."
                        ),
                        "enum": sorted(_KNOWN_STRATEGIES),
                    },
                },
                "required": ["hypothesis", "strategy_category"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "submit_final_audit",
            "description": (
                "Terminate the diagnostic loop and return the most recent "
                "successful build + run as the final audit result.  Call "
                "this ONLY when the latest modify_infrastructure cycle "
                "reported exit_code == 0.  Calling it after a failed run "
                "will surface that failure to the user."
            ),
            "parameters": {"type": "object", "properties": {}},
        },
    },
]


# ---------------------------------------------------------------------------
# System prompt - the Adaptive Reasoning core
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT: str = """\
You are the AuditFlow Diagnostic Agent, an autonomous infrastructure \
specialist embedded inside a Docker-based ML reproducibility system.

Your job: take a failing Docker build/run and, without human help, \
diagnose the ROOT CAUSE and apply the minimum patch that lets the \
project execute successfully (exit code 0).

You operate in a recursive Observe -> Think -> Act -> Observe loop \
backed by five tools:

  - inspect_filesystem(path, max_depth)     -- map the cloned repo
  - read_file(path)                         -- inspect README, setup.py, ...
  - execute_diagnostic_command(command)     -- probe the live container
  - modify_infrastructure(dockerfile_changes, env_vars, hypothesis,
                          strategy_category)
                                            -- commit a fix + rebuild
  - submit_final_audit()                    -- terminate on success

ROOT-CAUSE DOCTRINE - read carefully:

1. NEVER guess.  Inspect the filesystem and read source files BEFORE \
forming a hypothesis.

2. If a Python module is "not found", DO NOT immediately `pip install` \
it.  First check whether it is a LOCAL package shipped with the \
repository (look for a directory of the same name containing \
`__init__.py`, or an entry in `setup.py` / `pyproject.toml`).  If it \
is local, the correct fix is to adjust PYTHONPATH or WORKDIR, NOT to \
install something from PyPI.

3. PYTHONPATH POINTS TO THE PARENT DIRECTORY OF A PACKAGE, NEVER TO \
THE PACKAGE ITSELF.  This is the single most common mistake.  Example: \
if `/workspace/repo/src/utils/main_utils.py` exists and a script does \
`from src.utils.main_utils import *`, then `src` is the package root \
and PYTHONPATH MUST be `/workspace/repo` (its parent), NOT \
`/workspace/repo/src`.  Setting it to the package directory itself \
will reproduce the exact same `ModuleNotFoundError` because Python \
will search for a `src` directory INSIDE `/workspace/repo/src` and \
not find one.  Always derive PYTHONPATH by stripping the dotted \
module prefix from the script's absolute path, then verify with \
`execute_diagnostic_command "PYTHONPATH=<path> python -c 'import \
<top_pkg>'"` BEFORE committing the fix.

4. If the build fails, scan the build logs for missing system \
dependencies (e.g. `gcc: command not found`, `Python.h: No such file`, \
`libGL.so.1`).  Resolve them with `apt-get install -y <pkg>` in the \
Dockerfile, or with `pip install <pkg>` for a Python package.

5. ALWAYS verify a fix with `execute_diagnostic_command` BEFORE calling \
`modify_infrastructure`.  Rebuilds are expensive; an in-container \
verification (e.g. `pip install foo && python -c 'import foo'`, or \
`PYTHONPATH=/foo python /foo/bar/main.py`) is nearly free.

6. After every rebuild observation, reason about whether the LATEST \
error is the same class as the previous one or something new.  If the \
runner reports `STATUS: NO_PROGRESS` it means the post-fix error is \
BYTE-FOR-BYTE identical to the pre-fix error - your patch had zero \
effect.  Do NOT retry the same kind of fix; reread the traceback and \
form a fundamentally different hypothesis.  If you have tried two \
fixes in the same `strategy_category` you MUST switch hypothesis \
class - e.g. from "missing pip package" to "wrong PYTHONPATH", or \
from "missing apt package" to "wrong Python version".

7. When the most recent run reports exit_code == 0, immediately call \
`submit_final_audit()`.  Do not perform additional probes.

8. NEVER use `python -c "..."` as a solution.  An inline python \
expression (``-c``) does not execute any code from the repository and \
does not test reproducibility at all.  The Dockerfile CMD MUST execute \
a real ``.py`` file that exists inside the cloned repository (e.g. \
``["python", "main.py"]`` or ``["python", "src/train.py"]``).  A run \
that exits 0 via a trivial ``python -c "print('done')"`` command earns \
ZERO runtime points in the scoring rubric - it is treated as a failure. \
If no runnable ``.py`` file can be identified, respond with \
CANNOT_FIX instead.

9. Identify the PRIMARY analysis script the paper describes (e.g. \
``main_run_gpt_judge.py``, ``train.py``, ``eval.py``).  Use \
``inspect_filesystem`` and ``read_file`` to confirm it exists inside \
the repo before writing it into CMD.

10. If the failure is structurally unfixable (private repo, hard-coded \
absolute path that does not exist, broken upstream code), respond with \
the exact text:  CANNOT_FIX: <one-line reason>

OUTPUT RULES:

* Every assistant turn must contain either tool calls OR one of the \
terminal signals (`submit_final_audit` via tool call, or the literal \
text `CANNOT_FIX: ...`).
* Keep your free-text "thoughts" short - they will be rendered in the \
user's Reasoning Log.  Lead with "Hypothesis:" or "Observation:" so the \
log reads cleanly.
"""


# ---------------------------------------------------------------------------
# Public dataclasses
# ---------------------------------------------------------------------------


@dataclass
class Hypothesis:
    """A single recorded ``modify_infrastructure`` attempt."""

    iteration: int
    category: str
    description: str
    rebuild_succeeded: bool
    exit_code: int
    summary: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "iteration": self.iteration,
            "category": self.category,
            "description": self.description,
            "rebuild_succeeded": self.rebuild_succeeded,
            "exit_code": self.exit_code,
            "summary": self.summary,
        }


@dataclass
class ReasoningStep:
    """One entry in the user-visible Reasoning Log."""

    iteration: int
    phase: str  # 'think' | 'act' | 'observe' | 'terminate'
    tool: Optional[str]
    summary: str
    detail: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "iteration": self.iteration,
            "phase": self.phase,
            "tool": self.tool,
            "summary": self.summary,
            "detail": self.detail,
        }


@dataclass
class AgentResult:
    """
    Final outcome of :meth:`DiagnosticAgent.diagnose_and_repair`.

    Attributes
    ----------
    build_success:
        ``True`` iff the most recent rebuild produced an image AND the
        agent terminated cleanly via ``submit_final_audit``.
    exit_code:
        Exit code of the most recent container run.  ``-1`` when no
        successful build was ever produced.
    logs:
        Concatenated build + runtime logs from every cycle the agent
        attempted.  Includes the original failure logs at the top.
    dockerfile:
        The final Dockerfile (possibly mutated).  Returned so the caller
        can persist it for the user.
    reasoning_log:
        Ordered list of :class:`ReasoningStep` dicts describing every
        Observe / Think / Act transition.
    attempted_fixes:
        Ordered list of :class:`Hypothesis` dicts describing each
        ``modify_infrastructure`` attempt and its outcome.
    terminal_signal:
        One of ``"submit_final_audit"``, ``"cannot_fix"``,
        ``"max_iterations"``, ``"max_rebuilds"``, ``"agent_error"``.
    executed_real_script:
        ``True`` when the Dockerfile's ``CMD`` executes an actual
        ``.py`` file from the repository (e.g. ``["python", "train.py"]``).
        ``False`` when the CMD uses ``python -c`` or any other inline
        expression — such runs exit 0 trivially and must NOT earn the
        full reproducibility score.
    """

    build_success: bool
    exit_code: int
    logs: str
    dockerfile: str
    reasoning_log: list[dict[str, Any]] = field(default_factory=list)
    attempted_fixes: list[dict[str, Any]] = field(default_factory=list)
    terminal_signal: str = "max_iterations"
    executed_real_script: bool = True


# ---------------------------------------------------------------------------
# DockerBuildRunner protocol-ish helper
# ---------------------------------------------------------------------------


class DockerBuildRunner:
    """
    Thin facade exposing just the build / run operations the agent needs.

    The :class:`~services.sandbox.DockerAuditor` instantiates one of
    these and hands it to the agent.  Decoupling this from the auditor
    keeps the agent unit-testable with a stub builder.
    """

    def __init__(
        self,
        client: "docker.DockerClient",
        base_image: str,
        mem_limit: str,
        run_timeout_seconds: int,
        build_timeout_seconds: int,
    ) -> None:
        self._client = client
        self.base_image = base_image
        self.mem_limit = mem_limit
        self.run_timeout_seconds = run_timeout_seconds
        self.build_timeout_seconds = build_timeout_seconds

    def build(self, dockerfile_text: str) -> tuple[str, Optional[str]]:
        """Build ``dockerfile_text`` and return ``(logs, image_tag_or_None)``."""
        image_tag = f"auditflow-agent/{uuid.uuid4().hex[:12]}:latest"
        context = self._make_build_context(dockerfile_text)
        log_buffer: list[str] = ["--- build ---"]
        try:
            _image, stream = self._client.images.build(
                fileobj=context,
                custom_context=True,
                tag=image_tag,
                rm=True,
                forcerm=True,
                pull=True,
                timeout=self.build_timeout_seconds,
            )
            for chunk in stream:
                line = self._format_build_chunk(chunk)
                if line:
                    log_buffer.append(line)
            return "\n".join(log_buffer), image_tag
        except BuildError as exc:
            log_buffer.append(f"[agent] BuildError: {exc.msg}")
            for chunk in exc.build_log or []:
                line = self._format_build_chunk(chunk)
                if line:
                    log_buffer.append(line)
            return "\n".join(log_buffer), None
        except (APIError, DockerException) as exc:
            log_buffer.append(f"[agent] Docker build failed: {exc}")
            return "\n".join(log_buffer), None

    def run(self, image_tag: str) -> tuple[str, int]:
        """Run ``image_tag`` once and return ``(logs, exit_code)``."""
        container = None
        try:
            container = self._client.containers.run(
                image=image_tag,
                detach=True,
                mem_limit=self.mem_limit,
                nano_cpus=int(1.0 * 1e9),
                network_disabled=False,
                stderr=True,
                stdout=True,
            )
            try:
                result = container.wait(timeout=self.run_timeout_seconds)
                exit_code = int(result.get("StatusCode", -1))
            except Exception as wait_exc:  # noqa: BLE001
                logger.warning("[agent] container wait failed: %s", wait_exc)
                self._force_stop(container)
                exit_code = -1
            raw_logs = container.logs(stdout=True, stderr=True) or b""
            return raw_logs.decode("utf-8", errors="replace").strip(), exit_code
        except (APIError, DockerException) as exc:
            return f"[agent] docker run failed: {exc}", -1
        finally:
            if container is not None:
                try:
                    container.remove(force=True)
                except DockerException:
                    pass

    def remove_image(self, image_tag: Optional[str]) -> None:
        if not image_tag:
            return
        try:
            self._client.images.remove(image_tag, force=True, noprune=False)
        except DockerException as exc:
            logger.debug("[agent] could not remove image %s: %s", image_tag, exc)

    # -- helpers ---------------------------------------------------------

    @staticmethod
    def _make_build_context(dockerfile_text: str) -> io.BytesIO:
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w") as tar:
            data = dockerfile_text.encode("utf-8")
            info = tarfile.TarInfo(name="Dockerfile")
            info.size = len(data)
            info.mtime = int(time.time())
            tar.addfile(info, io.BytesIO(data))
        buf.seek(0)
        return buf

    @staticmethod
    def _format_build_chunk(chunk: dict) -> Optional[str]:
        if not isinstance(chunk, dict):
            return None
        if "stream" in chunk:
            return chunk["stream"].rstrip()
        if "error" in chunk:
            return f"[error] {chunk['error'].rstrip()}"
        if "status" in chunk:
            return chunk["status"].rstrip()
        return None

    @staticmethod
    def _force_stop(container) -> None:
        try:
            container.stop(timeout=5)
        except DockerException:
            try:
                container.kill()
            except DockerException:
                pass


# ---------------------------------------------------------------------------
# Main agent
# ---------------------------------------------------------------------------


class DiagnosticAgent:
    """
    GPT-4o-powered recursive diagnostic agent.

    Parameters
    ----------
    oai_client:
        An initialised :class:`openai.AzureOpenAI` instance.
    deployment:
        Azure OpenAI deployment name (e.g. ``"gpt-4o"``).
    docker_client:
        An initialised Docker SDK client.  Used to manage the long-lived
        diagnostic container that survives across iterations.
    base_image:
        Fallback image used as the diagnostic container when the Docker
        build itself never completed (so no image exists to introspect).
    """

    # ------------------------------------------------------------------
    # Construction
    # ------------------------------------------------------------------

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

    def diagnose_and_repair(
        self,
        *,
        initial_logs: str,
        initial_dockerfile: str,
        builder: DockerBuildRunner,
        initial_image_tag: Optional[str] = None,
    ) -> AgentResult:
        """
        Engage the recursive diagnostic loop on a failed Docker operation.

        Parameters
        ----------
        initial_logs:
            Combined STDOUT/STDERR from the failed build or run.
        initial_dockerfile:
            The Dockerfile that produced the failure.  May be mutated by
            the agent through ``modify_infrastructure``.
        builder:
            The :class:`DockerBuildRunner` used to perform every rebuild
            + re-run cycle the agent triggers.
        initial_image_tag:
            Tag of the originally built image (``None`` when the Docker
            *build* itself failed).  Used as the diagnostic container
            base when present so the agent sees the cloned repo +
            installed packages exactly as they failed.

        Returns
        -------
        AgentResult
            A populated result with the final build/run state, the
            mutated Dockerfile, and the structured Reasoning Log.
        """
        # ----- per-run state -----
        # NB: also stored on ``self`` (with leading underscore) so the
        # _handle_modify_infrastructure helper can update them in-place
        # without returning a long tuple.  Reset on every entry so a
        # single DiagnosticAgent instance can serve many audits.
        attempted_fixes: list[Hypothesis] = []
        reasoning_log: list[ReasoningStep] = []
        strategy_failures: dict[str, int] = {}
        rebuild_attempts = 0

        current_dockerfile = initial_dockerfile
        cumulative_logs = initial_logs.strip()

        self._latest_dockerfile_used = initial_dockerfile
        self._latest_image_tag = None
        self._latest_cumulative_logs = cumulative_logs
        # Fingerprint of the most recent failure - used to detect a
        # patch that did not move the needle (NO_PROGRESS).  Seeded
        # from the original failure so even the FIRST modify_infrastructure
        # call gets compared against the pre-loop error.
        self._previous_error_signature = self._extract_error_signature(
            initial_logs
        )

        # Track the latest known build/run state.  Seed from the initial
        # (failing) state so that if the agent never gets a chance to
        # mutate anything (CANNOT_FIX on iteration 1, LLM error, ...),
        # the result still reflects the actual original failure mode
        # rather than a phantom (-1 / False).
        last_image_tag: Optional[str] = None  # only ever set to *agent-produced* images
        last_exit_code: int = -1 if initial_image_tag is None else 1
        last_build_success: bool = initial_image_tag is not None

        # ----- diagnostic container lifecycle -----
        diag_container = self._start_diagnostic_container(initial_image_tag)
        if diag_container is None:
            logger.warning(
                "[agent] could not start diagnostic container - aborting."
            )
            return AgentResult(
                build_success=False,
                exit_code=-1,
                logs=cumulative_logs
                + "\n[agent] could not start diagnostic container.",
                dockerfile=current_dockerfile,
                reasoning_log=[],
                attempted_fixes=[],
                terminal_signal="agent_error",
            )

        # Append a header step so the UI always shows the trigger reason
        reasoning_log.append(
            ReasoningStep(
                iteration=0,
                phase="observe",
                tool=None,
                summary=(
                    "Initial Docker failure observed - "
                    "engaging recursive diagnostic loop."
                ),
                detail=initial_logs[:500],
            )
        )

        # ----- conversation seed -----
        truncated_logs = self._truncate_head(initial_logs, _MAX_ERROR_LOG_CHARS)
        messages: list[dict] = [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "AuditFlow detected a Docker failure.  Diagnose the "
                    "root cause and apply the minimal fix.\n\n"
                    f"=== ERROR LOG ===\n{truncated_logs}\n\n"
                    f"=== CURRENT DOCKERFILE ===\n{initial_dockerfile}"
                ),
            },
        ]

        terminal_signal = "max_iterations"

        try:
            for iteration in range(1, _MAX_AGENT_ITERATIONS + 1):
                logger.info(
                    "[agent] === iteration %d / %d ===",
                    iteration,
                    _MAX_AGENT_ITERATIONS,
                )

                try:
                    response = self._call_llm_with_backoff(messages)
                except Exception as exc:  # noqa: BLE001
                    logger.error("[agent] LLM call failed: %s", exc)
                    reasoning_log.append(
                        ReasoningStep(
                            iteration=iteration,
                            phase="terminate",
                            tool=None,
                            summary=f"LLM call failed: {exc}",
                        )
                    )
                    terminal_signal = "agent_error"
                    break

                msg = response.choices[0].message
                content_text = (msg.content or "").strip()

                # ── Record the agent's free-text "thought" -----------
                if content_text:
                    reasoning_log.append(
                        ReasoningStep(
                            iteration=iteration,
                            phase="think",
                            tool=None,
                            summary=self._first_line(content_text),
                            detail=content_text[:1_000],
                        )
                    )

                # ── Terminal: CANNOT_FIX text signal -----------------
                if content_text and "CANNOT_FIX" in content_text and not msg.tool_calls:
                    logger.warning(
                        "[agent] CANNOT_FIX signalled: %.200s", content_text
                    )
                    reasoning_log.append(
                        ReasoningStep(
                            iteration=iteration,
                            phase="terminate",
                            tool=None,
                            summary="Agent declared the failure unfixable.",
                            detail=content_text[:500],
                        )
                    )
                    terminal_signal = "cannot_fix"
                    break

                # ── No tool calls and no terminal signal -------------
                if not msg.tool_calls:
                    logger.warning(
                        "[agent] no tool calls produced - aborting loop."
                    )
                    reasoning_log.append(
                        ReasoningStep(
                            iteration=iteration,
                            phase="terminate",
                            tool=None,
                            summary="Agent produced no tool call - aborting.",
                        )
                    )
                    terminal_signal = "agent_error"
                    break

                # ── Append assistant turn -----------------------------
                messages.append(
                    self._serialise_assistant_message(msg, content_text)
                )

                # ── Execute every tool call --------------------------
                terminal_via_tool = False
                for tc in msg.tool_calls:
                    name = tc.function.name
                    try:
                        args = json.loads(tc.function.arguments or "{}")
                    except json.JSONDecodeError as exc:
                        observation = (
                            f"[agent] could not parse arguments for "
                            f"{name}: {exc}"
                        )
                        messages.append(
                            {
                                "role": "tool",
                                "tool_call_id": tc.id,
                                "content": observation,
                            }
                        )
                        reasoning_log.append(
                            ReasoningStep(
                                iteration=iteration,
                                phase="observe",
                                tool=name,
                                summary="Malformed tool arguments.",
                                detail=str(exc),
                            )
                        )
                        continue

                    # Submit-final-audit: terminate immediately ------
                    if name == "submit_final_audit":
                        reasoning_log.append(
                            ReasoningStep(
                                iteration=iteration,
                                phase="terminate",
                                tool="submit_final_audit",
                                summary=(
                                    "Agent submitted final audit "
                                    f"(exit_code={last_exit_code})."
                                ),
                            )
                        )
                        terminal_signal = "submit_final_audit"
                        terminal_via_tool = True
                        break

                    # ── modify_infrastructure: rebuild + run --------
                    if name == "modify_infrastructure":
                        if rebuild_attempts >= _MAX_REBUILD_ATTEMPTS:
                            observation = (
                                f"[agent] rebuild quota exhausted "
                                f"({_MAX_REBUILD_ATTEMPTS} attempts used). "
                                "You must call submit_final_audit() or "
                                "respond with CANNOT_FIX."
                            )
                            messages.append(
                                {
                                    "role": "tool",
                                    "tool_call_id": tc.id,
                                    "content": observation,
                                }
                            )
                            reasoning_log.append(
                                ReasoningStep(
                                    iteration=iteration,
                                    phase="observe",
                                    tool=name,
                                    summary="Rebuild quota exhausted.",
                                )
                            )
                            continue

                        rebuild_attempts += 1
                        observation, hypothesis = self._handle_modify_infrastructure(
                            args=args,
                            current_dockerfile=current_dockerfile,
                            iteration=iteration,
                            builder=builder,
                            strategy_failures=strategy_failures,
                        )

                        # The lambda above only computes; we need to
                        # actually update cumulative_logs and the live
                        # state here.
                        if hypothesis is not None:
                            attempted_fixes.append(hypothesis)
                            current_dockerfile = self._latest_dockerfile_used  # type: ignore[attr-defined]
                            cumulative_logs = self._latest_cumulative_logs  # type: ignore[attr-defined]
                            last_image_tag = self._latest_image_tag  # type: ignore[attr-defined]
                            last_exit_code = hypothesis.exit_code
                            last_build_success = hypothesis.rebuild_succeeded

                            # Restart diag container against the new
                            # image so subsequent inspections see the
                            # post-fix state.
                            if last_image_tag is not None:
                                self._teardown_diagnostic_container(diag_container)
                                replacement = self._start_diagnostic_container(
                                    last_image_tag
                                )
                                if replacement is not None:
                                    diag_container = replacement
                                else:
                                    logger.warning(
                                        "[agent] could not restart diag "
                                        "container against healed image - "
                                        "keeping old container."
                                    )

                            reasoning_log.append(
                                ReasoningStep(
                                    iteration=iteration,
                                    phase="act",
                                    tool=name,
                                    summary=(
                                        f"Hypothesis ({hypothesis.category}): "
                                        f"{hypothesis.description}"
                                    ),
                                )
                            )
                            reasoning_log.append(
                                ReasoningStep(
                                    iteration=iteration,
                                    phase="observe",
                                    tool=name,
                                    summary=hypothesis.summary,
                                    detail=observation[:1_500],
                                )
                            )
                        else:
                            reasoning_log.append(
                                ReasoningStep(
                                    iteration=iteration,
                                    phase="observe",
                                    tool=name,
                                    summary="modify_infrastructure rejected.",
                                    detail=observation[:500],
                                )
                            )

                        messages.append(
                            {
                                "role": "tool",
                                "tool_call_id": tc.id,
                                "content": observation,
                            }
                        )
                        continue

                    # ── Read-only inspection tools ------------------
                    observation = self._dispatch_inspection_tool(
                        name=name, args=args, container=diag_container
                    )
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tc.id,
                            "content": observation,
                        }
                    )
                    reasoning_log.append(
                        ReasoningStep(
                            iteration=iteration,
                            phase="act",
                            tool=name,
                            summary=self._summarise_inspection(name, args),
                            detail=observation[:1_500],
                        )
                    )

                if terminal_via_tool:
                    break

                # Hard ceiling on rebuilds also terminates the loop ----
                if rebuild_attempts >= _MAX_REBUILD_ATTEMPTS and not last_build_success:
                    logger.warning(
                        "[agent] rebuild quota exhausted without success."
                    )
                    terminal_signal = "max_rebuilds"
                    reasoning_log.append(
                        ReasoningStep(
                            iteration=iteration,
                            phase="terminate",
                            tool=None,
                            summary=(
                                "Rebuild quota exhausted without a successful "
                                "exit_code 0 run."
                            ),
                        )
                    )
                    break

        finally:
            self._teardown_diagnostic_container(diag_container)
            # Always clean up the agent-produced image - it has already
            # served its purpose (the run output is captured in logs)
            # and we don't want to leak disk space across audits.
            if last_image_tag is not None:
                builder.remove_image(last_image_tag)

        # ── Build the AgentResult ------------------------------------
        # ``cumulative_logs`` may have been mutated in-place via the
        # _latest_cumulative_logs helper attribute - prefer that.
        final_logs = self._latest_cumulative_logs or cumulative_logs
        # Validate that the final CMD executes a real repository script
        # and not a trivial `python -c` expression.  This is the gate
        # that prevents a fake `python -c "print('done')"` from earning
        # the 60-point runtime bonus.
        ran_real_script = self._dockerfile_runs_real_script(current_dockerfile)
        if not ran_real_script and last_build_success and last_exit_code == 0:
            logger.warning(
                "[agent] CMD in final Dockerfile is not a real .py script - "
                "exit_code=0 will NOT earn runtime points (trivial execution)."
            )
        return AgentResult(
            build_success=last_build_success,
            exit_code=last_exit_code,
            logs=final_logs,
            dockerfile=current_dockerfile,
            reasoning_log=[step.to_dict() for step in reasoning_log],
            attempted_fixes=[h.to_dict() for h in attempted_fixes],
            terminal_signal=terminal_signal,
            executed_real_script=ran_real_script,
        )

    # ------------------------------------------------------------------
    # modify_infrastructure
    # ------------------------------------------------------------------

    def _handle_modify_infrastructure(
        self,
        *,
        args: dict[str, Any],
        current_dockerfile: str,
        iteration: int,
        builder: DockerBuildRunner,
        strategy_failures: dict[str, int],
    ) -> tuple[str, Optional[Hypothesis]]:
        """
        Apply a Dockerfile / env-var patch and trigger one rebuild + run.

        Returns
        -------
        (observation, hypothesis_or_None):
            ``observation`` is the string fed back to GPT-4o.
            ``hypothesis_or_None`` is the recorded :class:`Hypothesis`
            on success, or ``None`` when the request was rejected (empty
            patch, malformed arguments) - in which case caller-side
            state is NOT mutated.
        """
        hypothesis_text: str = (args.get("hypothesis") or "").strip()
        category_raw: str = (args.get("strategy_category") or "other").strip().lower()
        category = category_raw if category_raw in _KNOWN_STRATEGIES else "other"
        dockerfile_changes: str = args.get("dockerfile_changes") or ""
        env_vars_raw = args.get("env_vars") or {}

        # Normalise env_vars to dict[str, str]
        env_vars: dict[str, str] = {}
        if isinstance(env_vars_raw, dict):
            for k, v in env_vars_raw.items():
                if isinstance(k, str) and v is not None:
                    env_vars[k] = str(v)

        if not dockerfile_changes.strip() and not env_vars:
            return (
                "[agent] modify_infrastructure rejected: both "
                "dockerfile_changes and env_vars were empty.",
                None,
            )
        if not hypothesis_text:
            return (
                "[agent] modify_infrastructure rejected: missing "
                "'hypothesis' field.",
                None,
            )

        # Build the new Dockerfile.
        if dockerfile_changes.strip():
            new_dockerfile = dockerfile_changes
        else:
            new_dockerfile = current_dockerfile
        if env_vars:
            new_dockerfile = self._inject_env_vars(new_dockerfile, env_vars)

        logger.info(
            "[agent] modify_infrastructure: category=%s hypothesis=%.120s",
            category,
            hypothesis_text,
        )

        # Run the rebuild + re-run cycle.
        build_logs, image_tag = builder.build(new_dockerfile)
        rebuild_succeeded = image_tag is not None
        run_logs = ""
        exit_code = -1

        if rebuild_succeeded:
            run_logs, exit_code = builder.run(image_tag)  # type: ignore[arg-type]

        # Update strategy-failure book-keeping.
        success = rebuild_succeeded and exit_code == 0
        if not success:
            strategy_failures[category] = strategy_failures.get(category, 0) + 1
        else:
            # Reset on success - irrelevant after termination but defensive.
            strategy_failures.pop(category, None)

        # Detect "no progress": post-fix error signature matches pre-fix.
        # Compute on the FULL combined output so a build-only failure
        # (no run_logs) still produces a meaningful fingerprint.
        new_combined = build_logs + ("\n" + run_logs if rebuild_succeeded else "")
        new_signature = self._extract_error_signature(new_combined)
        previous_signature = self._previous_error_signature
        no_progress = (
            not success
            and bool(new_signature)
            and new_signature == previous_signature
        )
        # Update for the next iteration regardless of outcome.
        self._previous_error_signature = new_signature

        # Compose the observation fed back to the LLM.
        observation_parts: list[str] = [
            f"[modify_infrastructure result]",
            f"hypothesis: {hypothesis_text}",
            f"strategy_category: {category}",
            f"rebuild_succeeded: {rebuild_succeeded}",
            f"exit_code: {exit_code}",
            "",
            "--- build logs ---",
            self._truncate_tail(build_logs, _MAX_TOOL_OUTPUT_CHARS // 2),
        ]
        if rebuild_succeeded:
            observation_parts.extend(
                [
                    "",
                    "--- runtime logs ---",
                    self._truncate_tail(run_logs, _MAX_TOOL_OUTPUT_CHARS // 2),
                ]
            )
        if success:
            observation_parts.extend(
                [
                    "",
                    "STATUS: SUCCESS - call submit_final_audit() now.",
                ]
            )
        else:
            if no_progress:
                observation_parts.extend(
                    [
                        "",
                        "STATUS: NO_PROGRESS - the post-fix error "
                        "signature is IDENTICAL to the pre-fix signature. "
                        "Your patch had ZERO effect on the failure mode. "
                        "Re-read the traceback carefully (especially file "
                        "paths and import statements) and form a "
                        "FUNDAMENTALLY DIFFERENT hypothesis.  Do not "
                        "submit a near-duplicate of the previous fix.",
                        f"  previous error: {previous_signature[:300]}",
                        f"  current error:  {new_signature[:300]}",
                    ]
                )
            failure_count = strategy_failures.get(category, 0)
            if failure_count >= _HYPOTHESIS_LOCK_THRESHOLD:
                observation_parts.extend(
                    [
                        "",
                        f"WARNING: category {category!r} has now failed "
                        f"{failure_count} times.  You MUST switch to a "
                        f"FUNDAMENTALLY DIFFERENT hypothesis on the "
                        f"next attempt - do not retry the same kind of "
                        f"fix.",
                    ]
                )

        observation = "\n".join(observation_parts)

        # Stash transient state for the caller (avoids a 5-tuple return).
        # The caller copies these out immediately after _handle_* returns.
        self._latest_dockerfile_used = new_dockerfile
        self._latest_image_tag = image_tag
        self._latest_cumulative_logs = self._append_logs(
            getattr(self, "_latest_cumulative_logs", ""),
            (
                f"\n--- agent attempt {iteration} ({category}) ---\n"
                f"hypothesis: {hypothesis_text}\n"
                f"{build_logs}"
                + (f"\n--- runtime ---\n{run_logs}" if rebuild_succeeded else "")
            ),
        )

        summary = (
            f"Rebuild {'succeeded' if rebuild_succeeded else 'FAILED'}, "
            f"exit_code={exit_code}"
            + (" (success)" if success else "")
        )
        hypothesis = Hypothesis(
            iteration=iteration,
            category=category,
            description=hypothesis_text,
            rebuild_succeeded=rebuild_succeeded,
            exit_code=exit_code,
            summary=summary,
        )
        return observation, hypothesis

    # ------------------------------------------------------------------
    # Read-only tool dispatch
    # ------------------------------------------------------------------

    def _dispatch_inspection_tool(
        self,
        *,
        name: str,
        args: dict[str, Any],
        container: "docker.models.containers.Container",
    ) -> str:
        """Run one of the read-only / probe tools and return its output."""
        if name == "inspect_filesystem":
            path = (args.get("path") or "/workspace/repo").strip() or "/"
            try:
                max_depth = int(args.get("max_depth", 3))
            except (TypeError, ValueError):
                max_depth = 3
            max_depth = max(1, min(max_depth, 6))
            cmd = (
                f"find {shlex.quote(path)} -maxdepth {max_depth} "
                f"-not -path '*/.*' -printf '%y %p\\n' 2>/dev/null "
                f"|| ls -laR {shlex.quote(path)}"
            )
            return self._exec_in_container(container, cmd)

        if name == "read_file":
            path = (args.get("path") or "").strip()
            if not path:
                return "[agent] read_file requires a 'path' argument."
            return self._exec_in_container(
                container,
                f"if [ -f {shlex.quote(path)} ]; then "
                f"cat {shlex.quote(path)}; else echo "
                f"'[agent] file does not exist: {path}'; fi",
            )

        if name == "execute_diagnostic_command":
            cmd = (args.get("command") or "").strip()
            if not cmd:
                return "[agent] execute_diagnostic_command requires a 'command'."
            return self._exec_in_container(container, cmd)

        return f"[agent] unknown tool name: {name!r}"

    # ------------------------------------------------------------------
    # Container exec helpers
    # ------------------------------------------------------------------

    def _exec_in_container(
        self,
        container: "docker.models.containers.Container",
        command: str,
    ) -> str:
        """Run ``command`` inside ``container`` and clip the output."""
        if not command.strip():
            return "[agent] empty command received"
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
                    f"\n... [truncated - "
                    f"{len(raw) - _MAX_TOOL_OUTPUT_CHARS} chars omitted]"
                )
            return clipped
        except (APIError, DockerException) as exc:
            return f"[agent] exec_run failed: {exc}"

    # ------------------------------------------------------------------
    # Diagnostic container lifecycle
    # ------------------------------------------------------------------

    def _start_diagnostic_container(
        self,
        image_tag: Optional[str],
    ) -> Optional["docker.models.containers.Container"]:
        """Spin up an idle ``sleep``-driven container for the agent."""
        image = image_tag if image_tag else self._base_image
        try:
            container = self._docker.containers.run(
                image=image,
                entrypoint=["sh"],
                command=["-c", "sleep 600"],
                detach=True,
                remove=False,
                mem_limit="512m",
                network_disabled=False,
            )
            logger.info(
                "[agent] diagnostic container %s started from image=%r",
                container.short_id,
                image,
            )
            return container
        except (APIError, DockerException) as exc:
            logger.error(
                "[agent] failed to start diagnostic container from %r: %s",
                image,
                exc,
            )
            return None

    def _teardown_diagnostic_container(
        self,
        container: Optional["docker.models.containers.Container"],
    ) -> None:
        if container is None:
            return
        try:
            container.stop(timeout=5)
        except DockerException:
            pass
        try:
            container.remove(force=True)
        except DockerException:
            pass

    # ------------------------------------------------------------------
    # Public: score justification
    # ------------------------------------------------------------------

    def generate_justification(
        self,
        *,
        reproducibility_index: float,
        logs: str,
        metadata_claims: dict[str, Any],
        reasoning_log: list[dict[str, Any]],
        attempted_fixes: list[dict[str, Any]],
        terminal_signal: Optional[str],
    ) -> str:
        """
        Generate a 3-paragraph Markdown justification for a reproducibility
        score using GPT-4o.

        This is a **post-audit** call that runs after
        :meth:`diagnose_and_repair` (or after a clean first-run success).
        It receives the final score and every artefact the pipeline
        produced, then instructs GPT-4o to write a structured editorial
        that the React frontend renders in a *"Why this score?"* section.

        Parameters
        ----------
        reproducibility_index:
            The 0-100 float score already computed by
            :class:`~models.scorecard.ReproducibilityScorecard`.
        logs:
            Combined build + runtime logs (may include agent-attempt
            sections).  Truncated before being forwarded to keep the
            prompt lean.
        metadata_claims:
            Dict derived from :class:`~models.scorecard.PaperMetadata`
            (``github_url``, ``dependencies``, ``entry_point``).  These
            represent the claims the paper makes about its own
            reproducibility.
        reasoning_log:
            Ordered list of ``ReasoningStep`` dicts from the diagnostic
            loop.  Summarised into a compact trace for the prompt.
        attempted_fixes:
            Ordered list of ``Hypothesis`` dicts.  Included so GPT-4o
            can name specific strategies that succeeded or failed.
        terminal_signal:
            How the diagnostic loop ended, or ``None`` when no agent
            ran (clean first-run success).

        Returns
        -------
        str
            A Markdown string with exactly three paragraphs:

            **Paragraph 1 — Checklist Contradiction**: what the paper
            claims vs what the runtime revealed.

            **Paragraph 2 — Technical Bottleneck**: the specific log
            errors / root causes encountered, plus any agent fixes
            applied.

            **Paragraph 3 — Verdict**: a direct statement for the
            researcher about what this score means in practice.

            On LLM failure returns a plain-text fallback so the field
            is always populated.
        """
        # ── Prepare compact context ──────────────────────────────────
        truncated_logs = self._truncate_head(logs, 3_000)

        claimed_deps = metadata_claims.get("dependencies") or []
        claimed_entry = metadata_claims.get("entry_point") or "main.py"
        claimed_url = metadata_claims.get("github_url") or "(none)"

        fix_summary = ""
        if attempted_fixes:
            lines = []
            for fx in attempted_fixes:
                outcome = "succeeded" if fx.get("rebuild_succeeded") and fx.get("exit_code") == 0 else "failed"
                lines.append(
                    f"  - [{fx.get('category', 'other')}] "
                    f"{fx.get('description', '')} → {outcome}"
                )
            fix_summary = "\n".join(lines)
        else:
            fix_summary = "  (no agent fixes were attempted)"

        loop_outcome = {
            "submit_final_audit": "Agent fixed the environment and the code ran successfully.",
            "cannot_fix": "Agent determined the failure is structurally unfixable.",
            "max_iterations": "Agent exhausted its iteration budget without a successful run.",
            "max_rebuilds": "Agent exhausted its rebuild quota without a successful run.",
            "agent_error": "Agent encountered an internal error.",
            None: "No agent intervention was needed (code ran on first attempt).",
        }.get(terminal_signal, f"Agent loop ended with signal: {terminal_signal!r}.")

        score_label = (
            "perfect (fully reproducible)"
            if reproducibility_index == 100
            else "partial (build succeeded but runtime failed)"
            if reproducibility_index == 40
            else "zero (could not build or run)"
            if reproducibility_index == 0
            else f"{reproducibility_index}/100"
        )

        prompt = f"""\
You are a scientific reproducibility auditor writing a structured \
report for a researcher who submitted an ML paper PDF to AuditFlow, \
an automated reproducibility system.

AUDIT RESULTS
=============
Reproducibility score : {reproducibility_index}/100 ({score_label})
Diagnostic loop outcome: {loop_outcome}

PAPER'S CLAIMED ARTEFACTS
--------------------------
GitHub URL  : {claimed_url}
Entry point : {claimed_entry}
Dependencies: {', '.join(claimed_deps) if claimed_deps else '(none listed)'}

AGENT FIX ATTEMPTS
------------------
{fix_summary}

RUNTIME LOGS (truncated)
------------------------
{truncated_logs}

INSTRUCTIONS
============
Write EXACTLY THREE paragraphs in Markdown.  Use the headings below \
verbatim.  Be specific: cite actual error messages, filenames, and \
package names from the logs above.  Do not invent information not \
present in the logs.

### Checklist Contradiction
Explain the gap between what the paper claims (the artefacts listed \
above) and what the runtime actually found.  If the code ran \
successfully, explain what the paper promised and that it delivered.

### Technical Bottleneck
Describe the specific technical errors encountered (exact error \
messages, missing modules, path issues, build failures).  If the \
agent applied fixes, name them and state whether they succeeded.  \
If the code ran cleanly, state that no technical barriers were found.

### Verdict
One direct paragraph addressed to the researcher.  State what the \
score means in practice: whether the paper is reproducible as \
written, what a reader would need to change to run it, and what \
the highest-priority fix is (if any).

Output ONLY the three Markdown paragraphs.  No preamble, no \
trailing commentary.\
"""

        messages: list[dict] = [
            {
                "role": "system",
                "content": (
                    "You are a precise scientific reproducibility auditor. "
                    "You write concise, evidence-based reports in Markdown. "
                    "You never invent errors or fixes not present in the data."
                ),
            },
            {"role": "user", "content": prompt},
        ]

        try:
            response = self._call_llm_simple(messages, max_tokens=600)
            justification = (response.choices[0].message.content or "").strip()
            if justification:
                return justification
        except Exception as exc:  # noqa: BLE001
            logger.warning("[agent] generate_justification LLM call failed: %s", exc)

        # Fallback: always return something renderable.
        return (
            f"### Checklist Contradiction\n"
            f"The paper links to `{claimed_url}` and lists "
            f"{len(claimed_deps)} dependencies. "
            f"AuditFlow attempted to clone and execute `{claimed_entry}`.\n\n"
            f"### Technical Bottleneck\n"
            f"The audit completed with score **{reproducibility_index}/100**. "
            f"Detailed logs are available in the execution panel above.\n\n"
            f"### Verdict\n"
            f"The justification model was unavailable. "
            f"Please review the raw logs to assess reproducibility."
        )

    # ------------------------------------------------------------------
    # LLM call with exponential back-off + full jitter
    # ------------------------------------------------------------------

    def _call_llm_with_backoff(self, messages: list[dict]) -> Any:
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
                        "[agent] 429 RateLimitError not resolved after "
                        "%d retries - re-raising.",
                        _BACKOFF_MAX_RETRIES,
                    )
                    raise
                cap = min(_BACKOFF_MAX, _BACKOFF_BASE ** attempt)
                sleep_time = random.uniform(0, cap)
                logger.warning(
                    "[agent] 429 RateLimitError (attempt %d/%d) - "
                    "sleeping %.1fs. %s",
                    attempt + 1,
                    _BACKOFF_MAX_RETRIES,
                    sleep_time,
                    exc,
                )
                time.sleep(sleep_time)
        raise RuntimeError("[agent] _call_llm_with_backoff exhausted")  # pragma: no cover

    def _call_llm_simple(
        self, messages: list[dict], max_tokens: int = 64
    ) -> Any:
        """
        Call GPT-4o for a **plain text** response with no tool schema.

        Used by :meth:`generate_justification` where we want prose back,
        not a function call.  Applies the same exponential back-off +
        full-jitter retry policy as :meth:`_call_llm_with_backoff`.
        """
        for attempt in range(_BACKOFF_MAX_RETRIES + 1):
            try:
                return self._oai.chat.completions.create(
                    model=self._deployment,
                    messages=messages,
                    temperature=0.3,
                    max_tokens=max_tokens,
                )
            except RateLimitError as exc:
                if attempt >= _BACKOFF_MAX_RETRIES:
                    raise
                cap = min(_BACKOFF_MAX, _BACKOFF_BASE ** attempt)
                sleep_time = random.uniform(0, cap)
                logger.warning(
                    "[agent] 429 on simple call (attempt %d/%d) - "
                    "sleeping %.1fs.",
                    attempt + 1,
                    _BACKOFF_MAX_RETRIES,
                    sleep_time,
                )
                time.sleep(sleep_time)
        raise RuntimeError("[agent] _call_llm_simple exhausted")  # pragma: no cover

    # ------------------------------------------------------------------
    # Misc helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _serialise_assistant_message(msg: Any, content_text: str) -> dict:
        """Convert an OpenAI ChatCompletionMessage to a JSON-safe dict."""
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

    @staticmethod
    def _truncate_head(text: str, limit: int) -> str:
        """Drop the *oldest* lines so the newest stay in view."""
        if len(text) <= limit:
            return text
        omitted = len(text) - limit
        return f"... [truncated head - {omitted} chars omitted]\n" + text[-limit:]

    @staticmethod
    def _truncate_tail(text: str, limit: int) -> str:
        if len(text) <= limit:
            return text
        omitted = len(text) - limit
        return text[:limit] + f"\n... [truncated tail - {omitted} chars omitted]"

    @staticmethod
    def _append_logs(existing: str, addition: str) -> str:
        if not existing:
            return addition.strip()
        return f"{existing}\n{addition}".strip()

    @staticmethod
    def _first_line(text: str) -> str:
        first = text.strip().splitlines()[0] if text.strip() else ""
        return first[:200]

    @staticmethod
    def _dockerfile_runs_real_script(dockerfile: str) -> bool:
        """
        Return ``True`` when the Dockerfile's ``CMD`` executes a real
        ``.py`` file from the cloned repository.

        Returns ``False`` (trivial / forbidden) when any of the following
        are true:

        * The CMD contains ``-c`` as an argument (inline Python expression
          like ``python -c "print('done')"``).
        * The CMD's script argument does not end in ``.py``.
        * No ``CMD`` line with a parseable JSON array is present.

        Examples
        --------
        >>> _dockerfile_runs_real_script('CMD ["python", "train.py"]')
        True
        >>> _dockerfile_runs_real_script('CMD ["python", "src/run.py"]')
        True
        >>> _dockerfile_runs_real_script('CMD ["python", "-c", "print(1)"]')
        False
        >>> _dockerfile_runs_real_script('CMD ["python", "start"]')
        False
        """
        match = _CMD_JSON_RE.search(dockerfile)
        if not match:
            return False
        try:
            cmd = json.loads(match.group(1))
        except (ValueError, TypeError):
            return False
        if not isinstance(cmd, list) or len(cmd) < 2:
            return False
        # Forbid any -c flag anywhere in the command vector.
        if "-c" in cmd:
            return False
        # The script argument (first token after the interpreter) must be
        # a path ending in .py.  This catches "python main.py" but not
        # "python -m module" or bare entrypoints without an extension.
        script_arg = cmd[1]
        return isinstance(script_arg, str) and script_arg.endswith(".py")

    @staticmethod
    def _extract_error_signature(text: str) -> str:
        """
        Reduce a noisy build/run log down to the lines that uniquely
        identify the failure mode.

        Strategy: walk the log bottom-up, collecting up to the last
        five lines that match :data:`_ERROR_SIGNATURE_RE` (Traceback,
        ``ModuleNotFoundError: ...``, ``/bin/sh: not found``, ...).
        These are the lines a human would read first to understand the
        error, and they are stable across rebuilds (paths and exception
        classes do not change just because we re-ran ``docker build``).

        Returns the reversed-back-to-original-order, ``\\n``-joined
        signature.  Empty string when no recognisable error line is
        found - in which case the caller's NO_PROGRESS comparison
        gracefully degrades to "we cannot tell" and is suppressed.
        """
        if not text:
            return ""
        hits: list[str] = []
        for line in reversed(text.splitlines()):
            stripped = line.strip()
            if not stripped:
                continue
            if _ERROR_SIGNATURE_RE.match(stripped):
                hits.append(stripped)
                if len(hits) >= 5:
                    break
        return "\n".join(reversed(hits))

    @staticmethod
    def _summarise_inspection(name: str, args: dict[str, Any]) -> str:
        if name == "inspect_filesystem":
            return f"inspect_filesystem({args.get('path', '/')!r})"
        if name == "read_file":
            return f"read_file({args.get('path', '')!r})"
        if name == "execute_diagnostic_command":
            cmd = (args.get("command") or "").strip().splitlines()[0]
            return f"execute_diagnostic_command({cmd[:120]!r})"
        return name

    # ------------------------------------------------------------------
    # Dockerfile patching
    # ------------------------------------------------------------------

    @staticmethod
    def _inject_env_vars(dockerfile: str, env_vars: dict[str, str]) -> str:
        """
        Merge ``env_vars`` into ``dockerfile``.

        Strategy: append a single new ``ENV K1=V1 K2=V2 ...`` directive
        immediately *before* the first ``CMD`` / ``ENTRYPOINT`` line
        (or at the end of the file when neither is present).  Existing
        ``ENV`` lines are left untouched.  Docker honours
        last-write-wins for ``ENV`` keys, so the appended directive
        cleanly overrides any earlier value while preserving every
        unrelated key declared on a multi-key ``ENV`` line - the
        previous regex-strip approach silently lost neighbouring keys.
        """
        if not env_vars:
            return dockerfile

        env_line = "ENV " + " ".join(
            f"{k}={shlex.quote(v)}" for k, v in env_vars.items()
        )

        out_lines: list[str] = []
        inserted = False
        for line in dockerfile.splitlines():
            if not inserted and _CMD_LINE_RE.match(line):
                out_lines.append(env_line)
                inserted = True
            out_lines.append(line)

        if not inserted:
            out_lines.append(env_line)

        joined = "\n".join(out_lines)
        return joined + ("\n" if not joined.endswith("\n") else "")
