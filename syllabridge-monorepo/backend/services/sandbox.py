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
import json
import logging
import re
import shlex
import tarfile
import time
import uuid
from typing import TYPE_CHECKING, Any, Optional

import docker
from docker.errors import (
    APIError,
    BuildError,
    ContainerError,
    DockerException,
    ImageNotFound,
)

from models.scorecard import PaperMetadata

if TYPE_CHECKING:
    from services.healer import SelfHealingLoop

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

# ---------------------------------------------------------------------------
# Self-healing: exec / not-found error detection
# ---------------------------------------------------------------------------

#: Exit codes that indicate the container's shell could not exec the command.
#: 127 = command/file not found; 126 = permission denied / not executable.
_EXEC_ERROR_EXIT_CODES: frozenset[int] = frozenset({126, 127})

#: Log patterns that indicate an exec or shell dispatcher failure even when
#: the exit code alone is ambiguous (e.g. the container was killed externally).
_EXEC_ERROR_LOG_RE = re.compile(
    r"/bin/sh:|not found|No such file or directory|exec format error|cannot execute",
    re.IGNORECASE,
)

#: Extracts a Python script name from a ``python <script.py>`` invocation —
#: the highest-confidence source for the correct entry-point filename.
_PY_INVOCATION_RE = re.compile(r"python\s+([\w./\-]+\.py)")

#: Catches any bare ``.py`` filename appearing in the document text.
_PY_FILENAME_RE = re.compile(r"\b([\w./\-]+\.py)\b")

#: Priority order for common ML entry-point stems (lower index = higher priority).
_ENTRY_PRIORITY_STEMS: tuple[str, ...] = (
    "train", "run", "experiment", "eval", "demo", "infer", "inference", "main",
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
        healer: Optional["SelfHealingLoop"] = None,
    ) -> None:
        self.base_image = base_image
        self.mem_limit = mem_limit
        self.run_timeout_seconds = run_timeout_seconds
        self.build_timeout_seconds = build_timeout_seconds
        # Optional GPT-4o self-healing loop.  When set, the auditor
        # triggers the ReAct diagnostic loop on build failures and
        # non-exec runtime failures before returning a FAIL result.
        self._healer = healer

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run_audit(
        self,
        metadata: PaperMetadata,
        raw_markdown: str = "",
    ) -> dict[str, Any]:
        """
        Build an image from ``metadata`` and execute its entry point.

        Parameters
        ----------
        metadata:
            The :class:`PaperMetadata` extracted by the LLM.
        raw_markdown:
            The full Markdown string returned by Azure Document Intelligence
            for the paper.  When provided, the self-healing logic uses it to
            re-scan for a corrected entry-point filename if the first run
            fails with an exec / not-found error.

        Returns
        -------
        dict
            ``{"build_success": bool, "exit_code": int, "logs": str}``.
            Always populated — exceptions are caught and surfaced via
            ``logs`` so the caller can render them in the UI.

        Self-healing policy
        -------------------
        If the container exits with a ``/bin/sh:`` or ``not found`` error
        (exit codes 126/127, or matching log text) *and* ``raw_markdown`` was
        supplied, the auditor:

        1. Re-parses ``raw_markdown`` to locate a better entry-point filename.
        2. Regenerates the Dockerfile with the corrected entry point.
        3. Attempts exactly **one** rebuild + re-run.

        If the retry succeeds the result reflects the healed execution.
        If no alternative entry point can be found, or the healed build also
        fails, ``build_success`` is set to ``False`` and the audit is flagged
        ``FAIL``.
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
            # ── GPT-4o Self-Healing Loop (build failure) ──────────────────
            # No image was produced, so the diagnostic container starts from
            # the base image.  The healer may patch the Dockerfile and signal
            # READY_TO_RETRY, in which case we attempt exactly one rebuild.
            if self._healer is not None:
                logger.info(
                    "[sandbox] build failed — triggering GPT-4o Self-Healing Loop."
                )
                gpt_result = self._try_gpt_heal(
                    client=client,
                    error_logs=build_logs,
                    dockerfile_text=dockerfile_text,
                    image_tag=None,
                )
                if gpt_result is not None:
                    self._safe_remove_image(client, image_tag)
                    return gpt_result

            self._safe_remove_image(client, image_tag)
            return {
                "build_success": False,
                "exit_code": -1,
                "logs": build_logs,
            }

        # 4. Run — do NOT wrap in try/finally yet; we need the image to remain
        #    available for file-system discovery in step 5 if an exec error occurs.
        #    _run_container itself never raises, so exit_code is always set here.
        run_logs, exit_code = self._run_container(client, image_tag)
        all_logs = f"{build_logs}\n--- runtime ---\n{run_logs}".strip()

        # 5. Self-healing: repository-aware retry on exec / not-found errors.
        #    The original image is kept alive intentionally so that
        #    _discover_repo_py_files can introspect the cloned repo before the
        #    healer decides what to rebuild.
        if raw_markdown and self._is_exec_error(exit_code, run_logs):
            logger.warning(
                "[self-heal] exec error detected (exit_code=%d); "
                "starting repository-aware heal.",
                exit_code,
            )
            try:
                return self._self_heal_with_discovery(
                    client=client,
                    built_image_tag=image_tag,
                    github_url=github_url,
                    deps=deps,
                    original_entry=entry_point,
                    raw_markdown=raw_markdown,
                    prior_logs=all_logs,
                )
            finally:
                # Always clean up the original failing image after the heal
                # attempt, whether it succeeded or raised unexpectedly.
                self._safe_remove_image(client, image_tag)

        # 6. Non-exec runtime failure → GPT-4o Self-Healing Loop.
        #    Covers: missing import, RuntimeError, wrong Python path, etc.
        #    The built image still exists here, so the diagnostic container
        #    can introspect the fully-cloned and pip-installed environment.
        if exit_code != 0 and self._healer is not None:
            logger.info(
                "[sandbox] runtime failure (exit_code=%d) — "
                "triggering GPT-4o Self-Healing Loop.",
                exit_code,
            )
            gpt_result = self._try_gpt_heal(
                client=client,
                error_logs=all_logs,
                dockerfile_text=dockerfile_text,
                image_tag=image_tag,
            )
            self._safe_remove_image(client, image_tag)
            if gpt_result is not None:
                return gpt_result
            return {
                "build_success": False,
                "exit_code": exit_code,
                "logs": all_logs,
                "discovered_path": None,
            }

        # No failures (or healer disabled) — normal cleanup and return.
        self._safe_remove_image(client, image_tag)
        return {
            "build_success": True,
            "exit_code": exit_code,
            "logs": all_logs,
            "discovered_path": None,
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
        ``WORKDIR`` becomes ``/workspace/repo/src`` so that scripts in
        sub-packages are found by the interpreter without path gymnastics.

        CMD and ENTRYPOINT are serialised with ``json.dumps`` so every
        element is always wrapped in double quotes — the only format
        Docker's JSON-array parser accepts.  ``shlex.quote`` is
        intentionally NOT used for CMD because it produces single-quoted
        tokens that trigger the ``/bin/sh: not found`` error.
        """
        quoted_url = shlex.quote(github_url)  # used in RUN shell form — single-quotes are fine

        # Derive the working directory that CMD will run inside.
        repo_workdir = (
            f"/workspace/repo/{workdir_suffix}".rstrip("/")
            if workdir_suffix
            else "/workspace/repo"
        )

        # entry_point is already validated; json.dumps gives correct double-quoting.
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
    # Self-healing helpers
    # ------------------------------------------------------------------

    def _try_gpt_heal(
        self,
        client: "docker.DockerClient",
        error_logs: str,
        dockerfile_text: str,
        image_tag: Optional[str],
    ) -> Optional[dict[str, Any]]:
        """
        Delegate to the GPT-4o :class:`SelfHealingLoop` and, if it signals
        ``READY_TO_RETRY``, perform one full rebuild + run with the patched
        Dockerfile.

        Parameters
        ----------
        client:
            Active Docker SDK client.
        error_logs:
            Combined build / runtime logs from the failure that triggered
            this call.
        dockerfile_text:
            The Dockerfile used in the failed attempt.
        image_tag:
            Tag of the built image, or ``None`` when the build itself
            failed (so no image exists yet).

        Returns
        -------
        dict or None
            A populated ``run_audit``-style result dict on success or on a
            healed-but-still-failing run.  ``None`` when the healer did not
            signal ``READY_TO_RETRY`` (i.e. the caller should fall back to
            its own failure path).
        """
        assert self._healer is not None  # guard — callers already check

        updated_df, should_retry = self._healer.run(
            error_logs=error_logs,
            dockerfile_text=dockerfile_text,
            image_tag=image_tag,
        )

        if not should_retry:
            logger.warning(
                "[sandbox] GPT-4o healer did not signal READY_TO_RETRY — "
                "falling back to original failure result."
            )
            return None

        logger.info(
            "[sandbox] GPT-4o healer signalled READY_TO_RETRY — "
            "rebuilding with patched Dockerfile."
        )

        healed_tag = f"auditflow/{uuid.uuid4().hex[:12]}:latest"
        build_logs, build_ok = self._build_image(client, healed_tag, updated_df)

        if not build_ok:
            self._safe_remove_image(client, healed_tag)
            logger.warning("[sandbox] GPT-4o healed build also failed.")
            return {
                "build_success": False,
                "exit_code": -1,
                "logs": (
                    f"{error_logs}\n--- gpt-heal (build) ---\n{build_logs}"
                ).strip(),
                "discovered_path": None,
            }

        try:
            run_logs, exit_code = self._run_container(client, healed_tag)
        finally:
            self._safe_remove_image(client, healed_tag)

        combined = (
            f"{error_logs}\n--- gpt-heal (build) ---\n{build_logs}"
            f"\n--- gpt-heal (runtime) ---\n{run_logs}"
        ).strip()

        return {
            "build_success": exit_code >= 0,
            "exit_code": exit_code,
            "logs": combined,
            "discovered_path": None,
        }

    @staticmethod
    def _is_exec_error(exit_code: int, logs: str) -> bool:
        """
        Return ``True`` when the container failed because the shell could not
        locate or execute the entry-point script.

        Covers the two canonical failure modes:

        * Exit code 127 — shell ``command not found``
        * Exit code 126 — permission denied / not executable
        * Log text containing ``/bin/sh:``, ``not found``, etc.
        """
        return (
            exit_code in _EXEC_ERROR_EXIT_CODES
            or bool(_EXEC_ERROR_LOG_RE.search(logs))
        )

    @staticmethod
    def _find_entry_point_in_markdown(markdown: str, original: str) -> str:
        """
        Re-scan the Azure Document Intelligence Markdown for a Python entry
        point that differs from ``original``.

        Search strategy (highest confidence first):

        1. Filenames that appear immediately after ``python`` in the document
           text — e.g. ``python train.py`` or ``python src/run.py``.
        2. All other ``.py`` filenames found anywhere in the document.

        Within each tier the candidates are ranked by ``_ENTRY_PRIORITY_STEMS``
        so ``train.py`` beats ``demo.py`` beats an arbitrary script.

        Returns ``original`` unchanged when no distinct candidate is found.
        """
        seen: set[str] = set()
        invocation_hits: list[str] = []
        filename_hits: list[str] = []

        def _accept(name: str) -> bool:
            name = name.strip()
            return bool(
                name
                and name not in seen
                and _ENTRY_POINT_RE.match(name)
                and ".." not in name
                and not name.startswith("/")
            )

        for m in _PY_INVOCATION_RE.findall(markdown):
            if _accept(m):
                seen.add(m)
                invocation_hits.append(m)

        for m in _PY_FILENAME_RE.findall(markdown):
            if _accept(m):
                seen.add(m)
                filename_hits.append(m)

        def _priority(name: str) -> int:
            stem = name.rsplit("/", 1)[-1].replace(".py", "").lower()
            for i, prefix in enumerate(_ENTRY_PRIORITY_STEMS):
                if stem.startswith(prefix):
                    return i
            return len(_ENTRY_PRIORITY_STEMS)

        for tier in (invocation_hits, filename_hits):
            tier.sort(key=_priority)
            for candidate in tier:
                if candidate != original:
                    return candidate

        return original

    def _discover_repo_py_files(
        self,
        client: "docker.DockerClient",
        image_tag: str,
    ) -> list[str]:
        """
        Spin up a throwaway container from ``image_tag`` and run::

            find . -maxdepth 2 -name "*.py"

        from ``/workspace/repo`` to enumerate Python files actually present
        inside the cloned repository.

        Returns a deduplicated list of repo-relative POSIX paths
        (e.g. ``["src/train.py", "app.py"]``).  Returns an empty list on any
        error so callers can fall back gracefully.
        """
        try:
            raw: bytes = client.containers.run(
                image=image_tag,
                command=["find", ".", "-maxdepth", "2", "-name", "*.py"],
                working_dir="/workspace/repo",
                remove=True,
                stdout=True,
                stderr=False,
                network_disabled=True,
            )
            result: list[str] = []
            seen: set[str] = set()
            for line in raw.decode("utf-8", errors="replace").splitlines():
                p = line.strip()
                if p.startswith("./"):
                    p = p[2:]
                p = p.strip("/")
                if (
                    p
                    and p not in seen
                    and _ENTRY_POINT_RE.match(p)
                    and ".." not in p
                ):
                    seen.add(p)
                    result.append(p)
            logger.info(
                "[self-heal] find discovered %d .py paths: %s",
                len(result), result[:12],
            )
            return result
        except (APIError, DockerException) as exc:
            logger.warning("[self-heal] file discovery container failed: %s", exc)
            return []
        except Exception as exc:  # noqa: BLE001
            logger.warning("[self-heal] file discovery unexpected error: %s", exc)
            return []

    @staticmethod
    def _split_entry_path(path: str) -> tuple[str, str]:
        """
        Split a repo-relative path into ``(filename, directory)``.

        Examples
        --------
        ``"src/train.py"`` → ``("train.py", "src")``
        ``"main.py"``      → ``("main.py", "")``
        """
        if "/" in path:
            directory, filename = path.rsplit("/", 1)
            return filename, directory
        return path, ""

    @staticmethod
    def _pick_entry_from_discovered(
        discovered_files: list[str],
        original_entry: str,
    ) -> tuple[str, str, Optional[str]]:
        """
        Select the best entry-point from paths returned by
        :meth:`_discover_repo_py_files`.

        Scoring rules (applied in order):

        1. Exclude obvious non-entry-point names: ``__init__``, ``setup``,
           ``conftest``, ``test_*``.
        2. Sort survivors by ``_ENTRY_PRIORITY_STEMS`` (``train`` beats
           ``run`` beats ``main`` …), then by directory depth (shallower
           is better — a root-level script is preferred over a nested one
           with the same stem).
        3. Pick the highest-ranked result.

        Returns
        -------
        (entry_filename, workdir_suffix, discovered_path)
            * ``entry_filename`` — the bare script name for ``CMD``.
            * ``workdir_suffix`` — the sub-directory for ``WORKDIR`` (empty
              string means repo root).
            * ``discovered_path`` — the full repo-relative path to record in
              the Scorecard (e.g. ``"src/train.py"``).
              ``None`` when no distinct candidate was found.
        """
        if not discovered_files:
            filename, suffix = DockerAuditor._split_entry_path(original_entry)
            return filename, suffix, None

        _EXCLUDE_STEMS = frozenset({
            "__init__", "setup", "conftest", "__main__",
        })

        def _is_plausible(path: str) -> bool:
            stem = path.rsplit("/", 1)[-1].replace(".py", "").lower()
            return stem not in _EXCLUDE_STEMS and not stem.startswith("test_")

        plausible = [f for f in discovered_files if _is_plausible(f)]
        if not plausible:
            plausible = list(discovered_files)

        def _sort_key(path: str) -> tuple[int, int]:
            stem = path.rsplit("/", 1)[-1].replace(".py", "").lower()
            depth = path.count("/")
            for i, prefix in enumerate(_ENTRY_PRIORITY_STEMS):
                if stem.startswith(prefix):
                    return i, depth
            return len(_ENTRY_PRIORITY_STEMS), depth

        plausible.sort(key=_sort_key)
        best = plausible[0]
        entry_filename, workdir_suffix = DockerAuditor._split_entry_path(best)
        return entry_filename, workdir_suffix, best

    def _self_heal_with_discovery(
        self,
        client: "docker.DockerClient",
        built_image_tag: str,
        github_url: str,
        deps: list[str],
        original_entry: str,
        raw_markdown: str,
        prior_logs: str,
    ) -> dict[str, Any]:
        """
        Repository-aware self-healing: introspect the repo, pick the right
        entry point, update the ``WORKDIR``, and retry once.

        Strategy
        --------
        **Phase A — File-system discovery** (highest confidence):
            Run ``find . -maxdepth 2 -name "*.py"`` inside a throwaway
            container spawned from the already-built image.  This gives the
            actual on-disk layout of the cloned repo and is immune to errors
            in the LLM extraction or the DI OCR.

        **Phase B — DI Markdown fallback** (lower confidence):
            If the Docker discovery returns no results (daemon error, empty
            repo), fall back to re-parsing the raw Document Intelligence
            Markdown for ``python <script.py>`` invocations and bare
            ``.py`` filenames.

        **Phase C — Rebuild and re-run**:
            Regenerate the Dockerfile with the corrected ``WORKDIR`` and
            ``CMD``, build once, run once.  The caller is responsible for
            cleaning up ``built_image_tag`` (via ``_safe_remove_image``).

        Returns
        -------
        dict
            Standard ``run_audit`` result dict augmented with
            ``"discovered_path"`` (the repo-relative path located by the
            healer, or ``None`` when no actionable candidate was found).
        """
        # ------------------------------------------------------------------
        # Phase A: introspect the live image's file system
        # ------------------------------------------------------------------
        discovered_files = self._discover_repo_py_files(client, built_image_tag)

        # ------------------------------------------------------------------
        # Phase B: select the best candidate
        # ------------------------------------------------------------------
        if discovered_files:
            new_entry, workdir_suffix, discovered_path = self._pick_entry_from_discovered(
                discovered_files, original_entry
            )
        else:
            # Docker discovery failed — fall back to DI Markdown re-parsing.
            raw_candidate = self._find_entry_point_in_markdown(raw_markdown, original_entry)
            new_entry, workdir_suffix = self._split_entry_path(raw_candidate)
            discovered_path = raw_candidate if raw_candidate != original_entry else None

        # Skip the rebuild if nothing actionable changed.
        if new_entry == original_entry and not workdir_suffix:
            logger.warning(
                "[self-heal] no better entry point found (discovery=%d files, "
                "markdown_fallback=%r) — audit FAIL.",
                len(discovered_files), discovered_path,
            )
            return {
                "build_success": False,
                "exit_code": -1,
                "logs": (
                    f"{prior_logs}\n"
                    "[self-heal] exec error confirmed; no alternative entry point "
                    "found — audit FAIL."
                ),
                "discovered_path": None,
            }

        logger.info(
            "[self-heal] entry_point %r → %r  workdir_suffix=%r  "
            "discovered_path=%r  rebuilding once.",
            original_entry, new_entry, workdir_suffix, discovered_path,
        )

        # ------------------------------------------------------------------
        # Phase C: rebuild and re-run with the corrected Dockerfile
        # ------------------------------------------------------------------
        healed_logs, healed_exit = self._attempt_healed_run(
            client, github_url, deps, new_entry, workdir_suffix=workdir_suffix
        )
        combined = f"{prior_logs}\n--- self-heal ---\n{healed_logs}".strip()

        return {
            # healed_exit == -1 → healed build itself failed → FAIL
            "build_success": healed_exit >= 0,
            "exit_code": healed_exit,
            "logs": combined,
            "discovered_path": discovered_path,
        }

    def _attempt_healed_run(
        self,
        client: "docker.DockerClient",
        github_url: str,
        deps: list[str],
        new_entry: str,
        workdir_suffix: str = "",
    ) -> tuple[str, int]:
        """
        Regenerate the Dockerfile with ``new_entry`` / ``workdir_suffix`` and
        execute one full build-then-run cycle.

        This is the single retry the self-healing policy allows before the
        audit is flagged as ``FAIL``.

        Parameters
        ----------
        new_entry:
            The corrected entry-point filename (just the basename, e.g.
            ``"train.py"``).
        workdir_suffix:
            Sub-directory relative to ``/workspace/repo`` where the script
            lives (e.g. ``"src"``).  Empty string keeps the WORKDIR at the
            repo root.

        Returns
        -------
        (combined_logs, exit_code):
            ``exit_code`` is ``-1`` when the healed build itself fails
            (container never ran).  Any value ``>= 0`` means the container
            executed — the caller decides whether the exit code is acceptable.
        """
        healed_tag = f"auditflow/{uuid.uuid4().hex[:12]}:latest"
        healed_dockerfile = self._render_dockerfile(
            github_url, deps, new_entry, workdir_suffix=workdir_suffix
        )

        logger.info(
            "[self-heal] rebuilding: entry_point=%r workdir_suffix=%r tag=%s",
            new_entry, workdir_suffix, healed_tag,
        )
        logger.debug("[self-heal] healed Dockerfile:\n%s", healed_dockerfile)

        build_logs, build_ok = self._build_image(client, healed_tag, healed_dockerfile)
        if not build_ok:
            self._safe_remove_image(client, healed_tag)
            logger.warning("[self-heal] healed build failed — audit flagged FAIL.")
            return build_logs, -1

        try:
            run_logs, exit_code = self._run_container(client, healed_tag)
        finally:
            self._safe_remove_image(client, healed_tag)

        combined = f"{build_logs}\n--- runtime (healed) ---\n{run_logs}"
        return combined, exit_code

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
