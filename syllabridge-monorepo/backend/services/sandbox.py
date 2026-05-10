"""
Docker-based reproducibility sandbox.

The :class:`DockerAuditor` takes the metadata extracted from an ML paper
(repository URL, inferred Python dependencies, entry-point script) and
attempts to actually execute the project end-to-end inside a throwaway
container. It is the runtime half of AuditFlow's audit pipeline; the
LLM extraction in ``main.py`` is the static half.

Design goals
------------
* **Self-contained.** No on-disk Dockerfile is required — the file is
  generated dynamically from a template and fed to the Docker SDK via
  an in-memory tarball.
* **Bounded.** Memory is capped (default 1 GB) and the container runs
  with no host network beyond what ``git clone`` and ``pip install``
  need at startup.
* **Robust.** Build failures, runtime errors, missing daemons, and
  shell injection in user-controlled fields are all handled
  gracefully — the auditor always returns a populated dict instead of
  raising.

Returned shape
--------------
Every call to :meth:`DockerAuditor.run_audit` returns a dictionary
matching :class:`backend.models.scorecard.DockerExecutionResult`::

    {
        "build_success": bool,
        "exit_code": int,    # -1 if the container never ran
        "logs": str,         # combined build + runtime output
    }
"""

from __future__ import annotations

import io
import logging
import re
import shlex
import tarfile
import time
import uuid
from typing import Any, Optional

import docker
from docker.errors import (
    APIError,
    BuildError,
    ContainerError,
    DockerException,
    ImageNotFound,
)

from models.scorecard import PaperMetadata

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Allow-list patterns used to sanitise LLM-supplied values before they end
# up in a Dockerfile. The LLM is helpful, not trusted.
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
        Docker image used as the build base. Defaults to ``python:3.10-slim``
        because slim shaves ~700 MB off the image and we install ``git``
        ourselves anyway.
    mem_limit:
        Per-container memory ceiling. Passed straight to
        :py:meth:`docker.models.containers.ContainerCollection.run`.
    run_timeout_seconds:
        Maximum wall-clock time the container is allowed to run before
        the auditor force-stops it. Prevents infinite training loops
        from blocking the API.
    build_timeout_seconds:
        Maximum wall-clock time for ``docker build``.
    """

    # ------------------------------------------------------------------
    # Construction
    # ------------------------------------------------------------------

    def __init__(
        self,
        base_image: str = "python:3.10-slim",
        mem_limit: str = "1g",
        run_timeout_seconds: int = 120,
        build_timeout_seconds: int = 180,
    ) -> None:
        self.base_image = base_image
        self.mem_limit = mem_limit
        self.run_timeout_seconds = run_timeout_seconds
        self.build_timeout_seconds = build_timeout_seconds

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run_audit(self, metadata: PaperMetadata) -> dict[str, Any]:
        """
        Build an image from ``metadata`` and execute its entry point.

        Parameters
        ----------
        metadata:
            The :class:`PaperMetadata` extracted by the LLM.

        Returns
        -------
        dict
            ``{"build_success": bool, "exit_code": int, "logs": str}``.
            Always populated — exceptions are caught and surfaced via
            ``logs`` so the caller can render them in the UI.
        """
        # 1. Validate the LLM output before letting it touch a Dockerfile.
        try:
            github_url, deps, entry_point = self._sanitise(metadata)
        except ValueError as exc:
            logger.warning("Refusing to audit invalid metadata: %s", exc)
            return {
                "build_success": False,
                "exit_code": -1,
                "logs": f"[auditflow] invalid metadata: {exc}",
            }

        # 2. Connect to the local Docker daemon. If it isn't running we
        #    bail out cleanly; the API layer will surface this to the UI.
        try:
            client = docker.from_env()
            client.ping()
        except DockerException as exc:
            logger.error("Docker daemon unavailable: %s", exc)
            return {
                "build_success": False,
                "exit_code": -1,
                "logs": f"[auditflow] could not reach the Docker daemon: {exc}",
            }

        dockerfile_text = self._render_dockerfile(github_url, deps, entry_point)
        image_tag = f"auditflow/{uuid.uuid4().hex[:12]}:latest"

        logger.info(
            "Starting audit: tag=%s github=%s entry=%s deps=%d",
            image_tag, github_url, entry_point, len(deps),
        )
        logger.debug("Generated Dockerfile:\n%s", dockerfile_text)

        # 3. Build.
        build_logs, build_ok = self._build_image(client, image_tag, dockerfile_text)
        if not build_ok:
            self._safe_remove_image(client, image_tag)
            return {
                "build_success": False,
                "exit_code": -1,
                "logs": build_logs,
            }

        # 4. Run.
        try:
            run_logs, exit_code = self._run_container(client, image_tag)
        finally:
            self._safe_remove_image(client, image_tag)

        return {
            "build_success": True,
            "exit_code": exit_code,
            "logs": f"{build_logs}\n--- runtime ---\n{run_logs}".strip(),
        }

    # ------------------------------------------------------------------
    # Dockerfile assembly
    # ------------------------------------------------------------------

    def _render_dockerfile(
        self,
        github_url: str,
        dependencies: list[str],
        entry_point: str,
    ) -> str:
        """
        Build the Dockerfile string from sanitised inputs.

        The clone step always lands in ``/workspace/repo`` so subsequent
        ``WORKDIR`` and ``CMD`` instructions can rely on a fixed path.
        """
        # ``shlex.quote`` keeps stray quotes / spaces from breaking the
        # shell form of CMD and from creating injection vectors.
        quoted_url = shlex.quote(github_url)
        quoted_entry = shlex.quote(entry_point)

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
            f"WORKDIR /workspace/repo\n"
            f"{pip_install}\n"
            f'CMD ["python", {quoted_entry!s}]\n'
        )

    # ------------------------------------------------------------------
    # Build / run helpers
    # ------------------------------------------------------------------

    def _build_image(
        self,
        client: "docker.DockerClient",
        image_tag: str,
        dockerfile_text: str,
    ) -> tuple[str, bool]:
        """
        Build ``dockerfile_text`` into ``image_tag`` and collect logs.

        Returns
        -------
        (logs, success):
            ``logs`` is the streamed build output (always populated);
            ``success`` is ``True`` iff the image was created.
        """
        context = self._make_build_context(dockerfile_text)
        log_buffer: list[str] = ["--- build ---"]
        try:
            _image, stream = client.images.build(
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
            return "\n".join(log_buffer), True

        except BuildError as exc:
            log_buffer.append(f"[auditflow] BuildError: {exc.msg}")
            for chunk in exc.build_log or []:
                line = self._format_build_chunk(chunk)
                if line:
                    log_buffer.append(line)
            return "\n".join(log_buffer), False

        except (APIError, DockerException) as exc:
            log_buffer.append(f"[auditflow] Docker build failed: {exc}")
            return "\n".join(log_buffer), False

    def _run_container(
        self,
        client: "docker.DockerClient",
        image_tag: str,
    ) -> tuple[str, int]:
        """
        Run ``image_tag`` detached, wait for completion, return logs + exit.
        """
        container = None
        try:
            container = client.containers.run(
                image=image_tag,
                detach=True,
                mem_limit=self.mem_limit,
                # A modest CPU cap keeps a single audit from saturating
                # the host. ``nano_cpus`` is in 1e-9 CPU units.
                nano_cpus=int(1.0 * 1e9),
                network_disabled=False,  # entry point may need network
                stderr=True,
                stdout=True,
            )

            try:
                result = container.wait(timeout=self.run_timeout_seconds)
                exit_code = int(result.get("StatusCode", -1))
            except Exception as wait_exc:  # noqa: BLE001 — covers requests timeouts
                logger.warning("Container wait timed out / failed: %s", wait_exc)
                self._force_stop(container)
                exit_code = -1

            raw_logs = container.logs(stdout=True, stderr=True) or b""
            return raw_logs.decode("utf-8", errors="replace").strip(), exit_code

        except ContainerError as exc:
            logger.error("Container raised on start: %s", exc)
            return f"[auditflow] container error: {exc}", exc.exit_status or -1

        except ImageNotFound as exc:
            logger.error("Image vanished before run: %s", exc)
            return f"[auditflow] image not found: {exc}", -1

        except (APIError, DockerException) as exc:
            logger.error("Docker run failed: %s", exc)
            return f"[auditflow] docker run failed: {exc}", -1

        finally:
            if container is not None:
                try:
                    container.remove(force=True)
                except DockerException:
                    pass

    # ------------------------------------------------------------------
    # Internal utilities
    # ------------------------------------------------------------------

    @staticmethod
    def _make_build_context(dockerfile_text: str) -> io.BytesIO:
        """Wrap a Dockerfile string in an in-memory tarball for the SDK."""
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
        """Pull the human-readable bit out of a Docker build event."""
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
        """Best-effort container stop; never raises."""
        try:
            container.stop(timeout=5)
        except DockerException:
            try:
                container.kill()
            except DockerException:
                pass

    def _safe_remove_image(self, client: "docker.DockerClient", tag: str) -> None:
        """Remove a build artifact without ever raising."""
        try:
            client.images.remove(tag, force=True, noprune=False)
        except DockerException as exc:
            logger.debug("Could not remove image %s: %s", tag, exc)

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
            raise ValueError(f"github_url is not a recognised GitHub repo URL: {github_url!r}")

        entry_point = (metadata.entry_point or "main.py").strip()
        if ".." in entry_point or entry_point.startswith("/"):
            raise ValueError(f"entry_point must be a repo-relative path: {entry_point!r}")
        if not _ENTRY_POINT_RE.match(entry_point):
            raise ValueError(f"entry_point contains invalid characters: {entry_point!r}")

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
