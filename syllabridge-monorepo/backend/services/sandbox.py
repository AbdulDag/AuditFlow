"""
Docker-based reproducibility sandbox.

The :class:`DockerAuditor` takes the metadata extracted from an ML paper
(repository URL, inferred Python dependencies, entry-point script) and
attempts to actually execute the project end-to-end inside a throwaway
container.  It is the runtime half of AuditFlow's audit pipeline; the
LLM extraction in ``main.py`` is the static half.

Refactor (Recursive Agentic Loop)
---------------------------------

This module used to ship with a stack of hard-coded error handlers:

* exec-error heuristics (exit codes 126/127, regex log scanning),
* a ``find``-based entry-point discoverer,
* a stem-priority + depth scoring fallback,
* a Markdown re-parsing pass,
* a single-shot GPT-4o "self-healing" patch.

Every one of those has now been removed.  When **any** Docker SDK error
or non-zero exit code surfaces, the auditor hands the failure off to a
:class:`~services.diagnostic_agent.DiagnosticAgent` which owns the
entire diagnose / patch / rebuild / verify cycle through its five-tool
function-calling loop.

If no agent is configured (Azure OpenAI credentials missing, Docker
daemon offline at agent-init time) the failure is surfaced as-is.

Returned shape
--------------
Every call to :meth:`DockerAuditor.run_audit` returns a dictionary
matching :class:`backend.models.scorecard.DockerExecutionResult`::

    {
        "build_success": bool,
        "exit_code": int,        # -1 if the container never ran
        "logs": str,             # combined build + runtime + agent logs
        "discovered_path": str | None,
        "reasoning_log": list[dict],
        "attempted_fixes": list[dict],
        "terminal_signal": str | None,
    }
"""

from __future__ import annotations

import json
import logging
import re
import shlex
import uuid
from typing import TYPE_CHECKING, Any, Optional

import docker
from docker.errors import DockerException

from models.scorecard import PaperMetadata
from services.diagnostic_agent import DockerBuildRunner

if TYPE_CHECKING:
    from services.diagnostic_agent import DiagnosticAgent

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Allow-list patterns used to sanitise LLM-supplied values before they end
# up in a Dockerfile.  The LLM is helpful, not trusted.
# ---------------------------------------------------------------------------

#: Matches a typical PyPI distribution name plus optional version specifier
#: (e.g. ``torch``, ``numpy>=1.24``, ``scikit-learn==1.3.0``).
_PIP_NAME_RE = re.compile(r"^[A-Za-z0-9_.\-]+(\[[A-Za-z0-9_.\-,]+\])?([<>=!~]=?[A-Za-z0-9_.\-+*]+)?$")

#: Matches a relative POSIX path that does not escape the repo (no ``..``
#: segments, no leading slash).
_ENTRY_POINT_RE = re.compile(r"^[A-Za-z0-9_./\-]+$")

#: Matches an http(s) GitHub URL.
_GITHUB_URL_RE = re.compile(
    r"^https?://(?:www\.)?github\.com/[A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+(?:\.git)?/?$"
)


class DockerAuditor:
    """
    Build-and-run a paper's repository inside a disposable container.

    Parameters
    ----------
    base_image:
        Docker image used as the build base.  Defaults to ``python:3.10-slim``
        because slim shaves ~700 MB off the image and we install ``git``
        ourselves anyway.
    mem_limit:
        Per-container memory ceiling.  Passed straight to
        :py:meth:`docker.models.containers.ContainerCollection.run`.
    run_timeout_seconds:
        Maximum wall-clock time the container is allowed to run before
        the auditor force-stops it.
    build_timeout_seconds:
        Maximum wall-clock time for ``docker build``.
    agent:
        Optional :class:`~services.diagnostic_agent.DiagnosticAgent`.
        When provided, every Docker failure - build error, runtime
        failure, SDK exception with a recoverable surface - is routed
        into the agent's recursive Observe -> Think -> Act -> Observe
        loop.  When ``None`` the auditor returns the failure verbatim.
    """

    def __init__(
        self,
        base_image: str = "python:3.10-slim",
        mem_limit: str = "1g",
        run_timeout_seconds: int = 120,
        build_timeout_seconds: int = 180,
        agent: Optional["DiagnosticAgent"] = None,
    ) -> None:
        self.base_image = base_image
        self.mem_limit = mem_limit
        self.run_timeout_seconds = run_timeout_seconds
        self.build_timeout_seconds = build_timeout_seconds
        self._agent = agent

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run_audit(
        self,
        metadata: PaperMetadata,
        raw_markdown: str = "",  # noqa: ARG002 (kept for API back-compat)
    ) -> dict[str, Any]:
        """
        Build an image from ``metadata`` and execute its entry point.

        Parameters
        ----------
        metadata:
            The :class:`PaperMetadata` extracted by the LLM.
        raw_markdown:
            Retained for API back-compatibility with the previous
            heuristic healer.  No longer consulted - the
            :class:`DiagnosticAgent` introspects the live container
            instead of re-parsing OCR output.

        Returns
        -------
        dict
            Dict matching :class:`DockerExecutionResult`.  Always
            populated - exceptions are caught and surfaced via ``logs``.
        """
        # --- 1. Validate the LLM output before letting it touch a Dockerfile.
        try:
            github_url, deps, entry_point = self._sanitise(metadata)
        except ValueError as exc:
            logger.warning("Refusing to audit invalid metadata: %s", exc)
            return self._empty_result(
                build_success=False,
                exit_code=-1,
                logs=f"[auditflow] invalid metadata: {exc}",
            )

        # --- 2. Connect to the local Docker daemon.
        try:
            client = docker.from_env()
            client.ping()
        except DockerException as exc:
            logger.error("Docker daemon unavailable: %s", exc)
            return self._empty_result(
                build_success=False,
                exit_code=-1,
                logs=f"[auditflow] could not reach the Docker daemon: {exc}",
            )

        dockerfile_text = self._render_dockerfile(github_url, deps, entry_point)
        builder = DockerBuildRunner(
            client=client,
            base_image=self.base_image,
            mem_limit=self.mem_limit,
            run_timeout_seconds=self.run_timeout_seconds,
            build_timeout_seconds=self.build_timeout_seconds,
        )

        logger.info(
            "Starting audit: github=%s entry=%s deps=%d",
            github_url, entry_point, len(deps),
        )
        logger.debug("Generated Dockerfile:\n%s", dockerfile_text)

        # --- 3. First build attempt.
        build_logs, image_tag = builder.build(dockerfile_text)
        if image_tag is None:
            logger.warning("[sandbox] initial build failed.")
            return self._delegate_to_agent_or_fail(
                builder=builder,
                initial_logs=build_logs,
                initial_dockerfile=dockerfile_text,
                initial_image_tag=None,
                trigger="build_failure",
            )

        # --- 4. First run attempt.
        run_logs, exit_code = builder.run(image_tag)
        all_logs = f"{build_logs}\n--- runtime ---\n{run_logs}".strip()

        if exit_code == 0:
            # Happy path - no agent involvement needed.
            builder.remove_image(image_tag)
            return self._success_result(
                build_success=True,
                exit_code=exit_code,
                logs=all_logs,
            )

        # --- 5. Any non-zero exit code triggers the recursive agent.
        logger.info(
            "[sandbox] runtime failure (exit_code=%d) - "
            "engaging recursive Diagnostic Agent.",
            exit_code,
        )
        try:
            return self._delegate_to_agent_or_fail(
                builder=builder,
                initial_logs=all_logs,
                initial_dockerfile=dockerfile_text,
                initial_image_tag=image_tag,
                trigger="runtime_failure",
            )
        finally:
            # The agent owns image cleanup for any image *it* produced;
            # we only need to drop the original failing image here.
            builder.remove_image(image_tag)

    # ------------------------------------------------------------------
    # Agent delegation
    # ------------------------------------------------------------------

    def _delegate_to_agent_or_fail(
        self,
        *,
        builder: DockerBuildRunner,
        initial_logs: str,
        initial_dockerfile: str,
        initial_image_tag: Optional[str],
        trigger: str,
    ) -> dict[str, Any]:
        """
        Either hand the failure off to the configured DiagnosticAgent,
        or surface it verbatim when no agent is wired up.
        """
        if self._agent is None:
            logger.warning(
                "[sandbox] %s but no DiagnosticAgent configured - "
                "returning failure as-is.",
                trigger,
            )
            return self._failure_result(
                build_success=initial_image_tag is not None,
                exit_code=-1 if initial_image_tag is None else 1,
                logs=initial_logs,
            )

        agent_result = self._agent.diagnose_and_repair(
            initial_logs=initial_logs,
            initial_dockerfile=initial_dockerfile,
            builder=builder,
            initial_image_tag=initial_image_tag,
        )

        return {
            "build_success": agent_result.build_success,
            "exit_code": agent_result.exit_code,
            "logs": agent_result.logs,
            "discovered_path": None,
            "reasoning_log": agent_result.reasoning_log,
            "attempted_fixes": agent_result.attempted_fixes,
            "terminal_signal": agent_result.terminal_signal,
        }

    # ------------------------------------------------------------------
    # Result helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _empty_result(
        *,
        build_success: bool,
        exit_code: int,
        logs: str,
    ) -> dict[str, Any]:
        """Result for early-exit cases (bad metadata, no Docker daemon)."""
        return {
            "build_success": build_success,
            "exit_code": exit_code,
            "logs": logs,
            "discovered_path": None,
            "reasoning_log": [],
            "attempted_fixes": [],
            "terminal_signal": None,
        }

    @staticmethod
    def _success_result(
        *,
        build_success: bool,
        exit_code: int,
        logs: str,
    ) -> dict[str, Any]:
        """Result for the no-intervention happy path."""
        return {
            "build_success": build_success,
            "exit_code": exit_code,
            "logs": logs,
            "discovered_path": None,
            "reasoning_log": [],
            "attempted_fixes": [],
            "terminal_signal": None,
        }

    @staticmethod
    def _failure_result(
        *,
        build_success: bool,
        exit_code: int,
        logs: str,
    ) -> dict[str, Any]:
        """Result for failures when no agent was wired up to recover."""
        return {
            "build_success": build_success,
            "exit_code": exit_code,
            "logs": logs,
            "discovered_path": None,
            "reasoning_log": [],
            "attempted_fixes": [],
            "terminal_signal": None,
        }

    # ------------------------------------------------------------------
    # Dockerfile assembly
    # ------------------------------------------------------------------

    def _render_dockerfile(
        self,
        github_url: str,
        dependencies: list[str],
        entry_point: str,
        workdir_suffix: str = "",
    ) -> str:
        """
        Build the Dockerfile string from sanitised inputs.

        The clone step always lands in ``/workspace/repo``; if
        ``workdir_suffix`` is provided (e.g. ``"src"``) the final
        ``WORKDIR`` becomes ``/workspace/repo/src``.

        CMD is serialised with ``json.dumps`` so every element is
        wrapped in double quotes - the only format Docker's JSON-array
        parser accepts.  ``shlex.quote`` is intentionally NOT used for
        CMD because it produces single-quoted tokens that trigger the
        ``/bin/sh: not found`` error.
        """
        quoted_url = shlex.quote(github_url)

        repo_workdir = (
            f"/workspace/repo/{workdir_suffix}".rstrip("/")
            if workdir_suffix
            else "/workspace/repo"
        )

        cmd_instruction = json.dumps(["python", entry_point])

        if dependencies:
            quoted_deps = " ".join(shlex.quote(dep) for dep in dependencies)
            pip_install = (
                f"RUN pip install --no-cache-dir --upgrade pip && "
                f"pip install --no-cache-dir {quoted_deps}"
            )
        else:
            pip_install = "# no dependencies inferred from the paper"

        return (
            f"FROM {self.base_image}\n"
            f"ENV PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1\n"
            f"RUN apt-get update && apt-get install -y --no-install-recommends "
            f"git ca-certificates && rm -rf /var/lib/apt/lists/*\n"
            f"WORKDIR /workspace\n"
            f"RUN git clone --depth 1 {quoted_url} repo\n"
            f"WORKDIR {repo_workdir}\n"
            f"{pip_install}\n"
            f"CMD {cmd_instruction}\n"
        )

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    @staticmethod
    def _sanitise(
        metadata: PaperMetadata,
    ) -> tuple[str, list[str], str]:
        """
        Validate the LLM-supplied metadata against strict allow-lists.

        Returns
        -------
        (github_url, dependencies, entry_point):
            All three values are safe to interpolate directly into the
            generated Dockerfile.

        Raises
        ------
        ValueError
            If any field is missing, malformed, or fails its regex.
        """
        github_url = (metadata.github_url or "").strip()
        if not github_url:
            raise ValueError("missing github_url")
        if not _GITHUB_URL_RE.match(github_url):
            raise ValueError(
                f"github_url is not a recognised GitHub repo URL: {github_url!r}"
            )

        entry_point = (metadata.entry_point or "main.py").strip()
        if ".." in entry_point or entry_point.startswith("/"):
            raise ValueError(
                f"entry_point must be a repo-relative path: {entry_point!r}"
            )
        if not _ENTRY_POINT_RE.match(entry_point):
            raise ValueError(
                f"entry_point contains invalid characters: {entry_point!r}"
            )

        cleaned_deps: list[str] = []
        for dep in metadata.dependencies or []:
            dep = dep.strip()
            if not dep:
                continue
            if not _PIP_NAME_RE.match(dep):
                logger.warning("Dropping suspicious dependency %r", dep)
                continue
            cleaned_deps.append(dep)

        return github_url, cleaned_deps, entry_point
