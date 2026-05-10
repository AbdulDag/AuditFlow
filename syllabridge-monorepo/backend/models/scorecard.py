"""
AuditFlow data models.

This module defines the Pydantic schema that flows through the AuditFlow
pipeline:

    PaperMetadata          ← extracted from the paper's Markdown by gpt-4o
    DockerExecutionResult  ← produced by the DockerAuditor sandbox
    ReproducibilityScorecard ← combines the two and computes a 0-100 index
    AuditResponse          ← the JSON envelope returned to the React client

Keeping these models in one place makes it easy to keep the FastAPI
contract, the sandbox service, and the frontend in sync.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, computed_field


# ---------------------------------------------------------------------------
# Scoring constants
# ---------------------------------------------------------------------------

#: Points awarded when the dynamically-generated Docker image builds cleanly.
BUILD_SUCCESS_POINTS: float = 40.0

#: Points awarded when the container's entry point exits with status 0.
EXIT_SUCCESS_POINTS: float = 60.0

#: Maximum possible reproducibility index value.
MAX_INDEX: float = BUILD_SUCCESS_POINTS + EXIT_SUCCESS_POINTS  # 100.0


# ---------------------------------------------------------------------------
# Extracted paper metadata
# ---------------------------------------------------------------------------

class PaperMetadata(BaseModel):
    """
    Structured fields extracted from an ML paper's Markdown by the LLM.

    Attributes
    ----------
    github_url:
        The primary GitHub repository URL referenced by the paper. Empty
        string if the model could not find a repository link.
    dependencies:
        Python packages that the LLM inferred are required to run the
        repository (e.g. ``["torch", "numpy", "pandas"]``).
    entry_point:
        The script most likely to be the experiment entry point
        (e.g. ``main.py``, ``train.py``, ``eval.py``).
    """

    github_url: str = Field(
        "",
        description="Primary GitHub repository URL, e.g. https://github.com/org/repo",
    )
    dependencies: list[str] = Field(
        default_factory=list,
        description="Python packages required by the repository.",
    )
    entry_point: str = Field(
        "main.py",
        description="The script the auditor should execute, e.g. main.py / train.py.",
    )


# ---------------------------------------------------------------------------
# Sandbox execution result
# ---------------------------------------------------------------------------

class DockerExecutionResult(BaseModel):
    """
    Outcome of running the paper's repository inside the Docker sandbox.

    Attributes
    ----------
    build_success:
        ``True`` if the dynamically-generated image built without errors.
    exit_code:
        Exit code reported by the container. ``-1`` indicates the
        container never started (because the build failed or the SDK
        raised before launch).
    logs:
        Combined STDOUT/STDERR output (build + runtime) returned to the
        client. The frontend renders this verbatim in a terminal-like
        viewer.
    discovered_path:
        Repo-relative path of the entry-point script located by the
        self-healing file-discovery pass (e.g. ``"src/train.py"``).
        ``None`` when the initial run succeeded without healing, or when
        healing fell back to DI-Markdown re-parsing without a confirmed
        on-disk path.
    """

    build_success: bool = Field(..., description="Did `docker build` succeed?")
    exit_code: int = Field(..., description="Container exit code (-1 if never ran).")
    logs: str = Field("", description="Combined build + runtime logs.")
    discovered_path: Optional[str] = Field(
        None,
        description=(
            "Repo-relative path found by self-healing file discovery, "
            "e.g. 'src/train.py'. Null when no healing was needed."
        ),
    )


# ---------------------------------------------------------------------------
# Reproducibility scorecard
# ---------------------------------------------------------------------------

class ReproducibilityScorecard(BaseModel):
    """
    Final report combining the extracted metadata, sandbox results, and a
    derived ``reproducibility_index`` in the range [0, 100].

    The scoring rubric is intentionally simple so that the index is easy
    to reason about during a manual audit:

        * +40 points if the Docker image builds cleanly.
        * +60 points if the container exits with status 0.

    The index is recomputed from the underlying fields on every
    serialization via ``@computed_field``, so callers never have to set
    it manually.
    """

    metadata: PaperMetadata = Field(
        ..., description="LLM-extracted paper metadata."
    )
    execution: DockerExecutionResult = Field(
        ..., description="Outcome of running the paper's code in the sandbox."
    )

    # ------------------------------------------------------------------
    # Derived field
    # ------------------------------------------------------------------

    @computed_field  # type: ignore[prop-decorator]
    @property
    def reproducibility_index(self) -> float:
        """
        Compute the 0-100 reproducibility score from the execution result.

        Returns
        -------
        float
            ``round(score, 2)`` so the JSON payload stays readable.
        """
        return self.compute_index(self.execution)

    # ------------------------------------------------------------------
    # Public helper (kept as a class method so callers can score a result
    # without instantiating a full scorecard, useful for unit tests).
    # ------------------------------------------------------------------

    @classmethod
    def compute_index(cls, execution: DockerExecutionResult) -> float:
        """
        Apply the AuditFlow scoring rubric to a ``DockerExecutionResult``.

        Parameters
        ----------
        execution:
            The sandbox result to score.

        Returns
        -------
        float
            Reproducibility index in ``[0.0, 100.0]``, rounded to 2 dp.
        """
        score = 0.0
        if execution.build_success:
            score += BUILD_SUCCESS_POINTS
        if execution.exit_code == 0:
            score += EXIT_SUCCESS_POINTS
        return round(score, 2)


# ---------------------------------------------------------------------------
# Top-level API response envelope
# ---------------------------------------------------------------------------

class AuditResponse(BaseModel):
    """
    Envelope returned by ``POST /api/audit``.

    A successful audit always populates ``scorecard``. The optional
    ``error`` field carries a human-readable message when the LLM or
    sandbox fail in a recoverable way (e.g. no GitHub link found,
    Docker daemon unavailable) so the React client can surface a useful
    notice instead of a generic 500.
    """

    scorecard: ReproducibilityScorecard = Field(
        ..., description="The computed reproducibility scorecard."
    )
    source: str = Field(
        ...,
        description="Extraction path: 'llm_one_shot' or 'none'.",
    )
    error: Optional[str] = Field(
        None,
        description="Human-readable note about partial failures (e.g. Docker offline).",
    )
