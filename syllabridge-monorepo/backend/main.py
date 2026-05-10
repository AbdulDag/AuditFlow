"""
AuditFlow API.

A FastAPI service that turns an ML research paper PDF into a
``ReproducibilityScorecard``:

    PDF  ──▶  Azure Document Intelligence (Markdown)
        ──▶  Azure OpenAI gpt-4o (PaperMetadata extraction)
        ──▶  DockerAuditor (build + run the paper's repo)
        ──▶  ReproducibilityScorecard (0-100 index + logs)

The Azure halves of this pipeline are intentionally left structurally
identical to the original Syllabridge implementation — only the prompt,
the response models, and the downstream sandbox call have changed. That
keeps the existing ``.env`` configuration and credential-handling
behaviour exactly as documented.
"""

from __future__ import annotations

import asyncio
import io
import json
import logging
import os
import textwrap
from typing import Any

import docker
import pypdf

import uvicorn
from azure.ai.documentintelligence import DocumentIntelligenceClient
from azure.ai.documentintelligence.models import DocumentContentFormat
from azure.core.credentials import AzureKeyCredential
from azure.core.exceptions import HttpResponseError
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from openai import AzureOpenAI, RateLimitError
from pydantic import ValidationError

from models.scorecard import (
    AuditResponse,
    DockerExecutionResult,
    PaperMetadata,
    ReproducibilityScorecard,
)
from services.diagnostic_agent import DiagnosticAgent
from services.sandbox import DockerAuditor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

# ---------------------------------------------------------------------------
# Environment / credentials
# ---------------------------------------------------------------------------

def _env(key: str) -> str:
    """Read an environment variable, stripping whitespace and stray quotes."""
    return os.getenv(key, "").strip().strip('"').strip("'")


AZURE_DI_ENDPOINT  = _env("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT")
AZURE_DI_KEY       = _env("AZURE_DOCUMENT_INTELLIGENCE_KEY")
AZURE_OAI_ENDPOINT = _env("AZURE_OPENAI_ENDPOINT")
AZURE_OAI_KEY      = _env("AZURE_OPENAI_KEY")
AZURE_OAI_DEPLOY   = _env("AZURE_OPENAI_DEPLOYMENT_NAME") or "gpt-4o"
AZURE_OAI_VERSION  = _env("AZURE_OPENAI_API_VERSION") or "2024-12-01-preview"

for _var, _val in [
    ("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT", AZURE_DI_ENDPOINT),
    ("AZURE_OPENAI_ENDPOINT", AZURE_OAI_ENDPOINT),
]:
    if _val and not _val.startswith(("https://", "http://")):
        raise RuntimeError(f"{_var} must start with https:// (got {_val[:40]!r})")

if AZURE_OAI_ENDPOINT and AZURE_OAI_KEY:
    _oai_client: AzureOpenAI | None = AzureOpenAI(
        azure_endpoint=AZURE_OAI_ENDPOINT,
        api_key=AZURE_OAI_KEY,
        api_version=AZURE_OAI_VERSION,
    )
    logger.info(
        "Azure OpenAI client ready (deployment=%s, api_version=%s).",
        AZURE_OAI_DEPLOY, AZURE_OAI_VERSION,
    )
else:
    _oai_client = None
    logger.warning("AZURE_OPENAI_* not set — LLM extraction disabled.")

# Single shared sandbox; the DockerAuditor itself is stateless.
# When Azure OpenAI credentials are present we also attach the
# DiagnosticAgent so the auditor can autonomously diagnose and repair
# Docker build/run failures via its recursive Observe -> Think -> Act
# loop before returning a FAIL result.  Without an agent the auditor
# returns failures verbatim (no hard-coded heuristic recovery).
_agent: DiagnosticAgent | None = None
if _oai_client is not None:
    try:
        _docker_client_for_agent = docker.from_env()
        _agent = DiagnosticAgent(
            oai_client=_oai_client,
            deployment=AZURE_OAI_DEPLOY,
            docker_client=_docker_client_for_agent,
            base_image="python:3.10-slim",
        )
        logger.info(
            "DiagnosticAgent initialised (deployment=%s).", AZURE_OAI_DEPLOY,
        )
    except Exception as _agent_exc:  # noqa: BLE001
        logger.warning(
            "Could not initialise DiagnosticAgent (Docker unavailable?): %s",
            _agent_exc,
        )

_auditor = DockerAuditor(agent=_agent)

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(title="AuditFlow API", version="1.0.0")

def _parse_cors_origins() -> list[str]:
    """Comma-separated extra origins from AUDITFLOW_CORS_ORIGINS."""
    raw = _env("AUDITFLOW_CORS_ORIGINS")
    if not raw:
        return []
    return [o.strip() for o in raw.split(",") if o.strip()]


_DEFAULT_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys(_DEFAULT_ORIGINS + _parse_cors_origins())),
    allow_origin_regex=r"chrome-extension://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100 MB

# ---------------------------------------------------------------------------
# Extraction prompt
# ---------------------------------------------------------------------------

_EXTRACTION_PROMPT = textwrap.dedent("""
    You are a meticulous ML research engineer auditing a paper for
    reproducibility. The Markdown below was rendered directly from the
    paper's PDF by Azure Document Intelligence — code listings and tables
    are preserved as Markdown, so you can rely on them for repo URLs and
    package names.

    Your job is to return a JSON object with EXACTLY these three keys:

      "github_url"   : string  — the primary GitHub repository URL where
                                 the paper's official implementation lives.
                                 Must look like
                                 "https://github.com/<owner>/<repo>".
                                 If the paper lists multiple repos, pick
                                 the one tagged "official", "code", or
                                 the one referenced from the Abstract /
                                 "Code Availability" section.
                                 If no GitHub link can be found, return "".

      "dependencies" : array of strings — Python packages a fresh
                                 environment would need in order to run
                                 the repository. Infer these from:
                                   * import statements quoted in the paper
                                     (e.g. "import torch", "from transformers ...")
                                   * library names mentioned in prose
                                     ("we implement our model in PyTorch")
                                   * tables of hyperparameters that name a
                                     framework (Hugging Face, JAX, ...)
                                 Use canonical PyPI names: "torch" not
                                 "PyTorch", "scikit-learn" not "sklearn",
                                 "huggingface_hub" not "Hugging Face".
                                 Do NOT include the Python standard library.
                                 Do NOT pin versions unless the paper does.
                                 If you are unsure, return an empty array.

      "entry_point"  : string  — the script most likely to reproduce the
                                 paper's headline result if executed
                                 inside the cloned repo. Prefer, in order:
                                   1. A script the paper explicitly tells
                                      the reader to run.
                                   2. "train.py" / "run.py" / "experiment.py"
                                      / "eval.py" / "demo.py".
                                   3. "main.py" as a generic fallback.
                                 Return only a repo-relative POSIX path
                                 (e.g. "src/train.py"); never an absolute
                                 path or shell command.

    RULES
    -----
    - Return ONLY the JSON object — no prose, no Markdown fences.
    - All three keys MUST be present, even if empty.
    - "dependencies" MUST be a JSON array of strings (use [] if none).
    - Never invent a repository URL: if it is not in the paper, return "".

    PAPER CONTENT (MARKDOWN)
    ------------------------
    {content}
""").strip()


# ---------------------------------------------------------------------------
# LLM helpers
# ---------------------------------------------------------------------------

def _coerce_to_metadata(parsed: Any) -> PaperMetadata | None:
    """
    Validate the LLM's JSON object as a :class:`PaperMetadata`.

    Returns ``None`` (rather than raising) when the LLM produces a
    payload that we cannot reasonably massage into the model.
    """
    if not isinstance(parsed, dict):
        logger.warning("Expected dict from LLM, got %s.", type(parsed).__name__)
        return None

    candidate = {
        "github_url":   parsed.get("github_url", "") or "",
        "dependencies": parsed.get("dependencies", []) or [],
        "entry_point":  parsed.get("entry_point", "main.py") or "main.py",
    }

    # Coerce common LLM mistakes (string of comma-separated deps,
    # trailing whitespace, accidental ``None`` entries).
    if isinstance(candidate["dependencies"], str):
        candidate["dependencies"] = [
            piece.strip()
            for piece in candidate["dependencies"].split(",")
            if piece.strip()
        ]
    candidate["dependencies"] = [
        str(dep).strip() for dep in candidate["dependencies"] if dep
    ]

    try:
        return PaperMetadata.model_validate(candidate)
    except ValidationError as err:
        logger.warning("LLM produced invalid PaperMetadata: %s", err.errors()[0]["msg"])
        return None


def _llm_extract_metadata(markdown_content: str) -> PaperMetadata | None:
    """
    Send the paper Markdown to gpt-4o and parse the structured response.

    Raises
    ------
    HTTPException
        On rate-limit (429) or upstream Azure OpenAI failure (502).
    """
    if _oai_client is None or not markdown_content.strip():
        return None

    prompt = _EXTRACTION_PROMPT.format(content=markdown_content)
    try:
        response = _oai_client.chat.completions.create(
            model=AZURE_OAI_DEPLOY,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0,
        )
        raw_json = (response.choices[0].message.content or "").strip()
        logger.info("LLM raw response (first 500 chars): %.500s", raw_json)
    except RateLimitError as exc:
        logger.error("Azure OpenAI rate-limited: %s", exc)
        raise HTTPException(
            status_code=429,
            detail="Azure OpenAI rate limit reached — please retry in a moment.",
        ) from exc
    except Exception as exc:
        logger.error("Azure OpenAI call failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Azure OpenAI error: {exc}") from exc

    try:
        parsed = json.loads(raw_json)
    except json.JSONDecodeError as exc:
        logger.error("LLM returned invalid JSON: %s | raw: %.300s", exc, raw_json)
        return None

    metadata = _coerce_to_metadata(parsed)
    if metadata is None:
        return None
    logger.info(
        "LLM extracted metadata: github=%s entry=%s deps=%d",
        metadata.github_url, metadata.entry_point, len(metadata.dependencies),
    )
    return metadata


# ---------------------------------------------------------------------------
# Azure Document Intelligence — Markdown output
# ---------------------------------------------------------------------------

# Azure DI F0 (free tier) hard limit. S0 (standard) supports 500 MB so
# this guard only matters for free-tier users.
_DI_FREE_TIER_LIMIT_BYTES = 3_500_000  # 3.5 MB — leaves headroom below the 4 MB ceiling


def _truncate_pdf(document_bytes: bytes, max_pages: int) -> bytes:
    """
    Return a new PDF containing only the first ``max_pages`` pages.

    If the document already has ≤ ``max_pages`` pages the original bytes
    are returned unchanged.
    """
    reader = pypdf.PdfReader(io.BytesIO(document_bytes))
    total = len(reader.pages)
    if total <= max_pages:
        return document_bytes

    logger.info("PDF has %d pages — truncating to first %d.", total, max_pages)
    writer = pypdf.PdfWriter()
    for page in reader.pages[:max_pages]:
        writer.add_page(page)

    buf = io.BytesIO()
    writer.write(buf)
    buf.seek(0)
    return buf.read()


def _fit_pdf_to_limit(document_bytes: bytes) -> bytes:
    """
    Progressively shrink the PDF by halving the page count until it fits
    within ``_DI_FREE_TIER_LIMIT_BYTES``.

    Page schedule tried: full doc → 20 → 10 → 5 → 3 pages.
    For ML papers the abstract + intro (first 3–5 pages) always contain
    the GitHub URL and the key library references, so even the most
    aggressive cut still produces a useful extraction.

    Returns the smallest version that fits, or the 3-page version as a
    last resort (Azure DI will return whatever it can parse).
    """
    reader = pypdf.PdfReader(io.BytesIO(document_bytes))
    total_pages = len(reader.pages)

    for max_pages in [total_pages, 20, 10, 5, 3]:
        candidate = _truncate_pdf(document_bytes, max_pages=max_pages)
        size_mb = len(candidate) / 1_000_000
        logger.info(
            "PDF candidate: %d pages, %.2f MB.", min(max_pages, total_pages), size_mb
        )
        if len(candidate) <= _DI_FREE_TIER_LIMIT_BYTES:
            return candidate

    # Absolute fallback — 3-page slice (won't exceed 3.5 MB for any sane PDF)
    return _truncate_pdf(document_bytes, max_pages=3)


def _call_azure_di(client: DocumentIntelligenceClient, pdf_bytes: bytes) -> str:
    """Submit ``pdf_bytes`` to Azure DI and return the Markdown content."""
    poller = client.begin_analyze_document(
        "prebuilt-layout",
        body=io.BytesIO(pdf_bytes),
        content_type="application/pdf",
        output_content_format=DocumentContentFormat.MARKDOWN,
    )
    return poller.result().content or ""


def _is_content_length_error(exc: HttpResponseError) -> bool:
    """Return True iff ``exc`` is an Azure DI InvalidContentLength rejection."""
    inner = exc.error.innererror if exc.error else None
    return (getattr(inner, "code", "") or "") == "InvalidContentLength"


def _analyze_document_as_markdown(document_bytes: bytes) -> str:
    """
    Send the PDF to Azure Document Intelligence (prebuilt-layout) and
    request Markdown output.

    Strategy
    --------
    1. Pre-shrink the PDF with ``_fit_pdf_to_limit`` — progressively
       halves the page count (full → 20 → 10 → 5 → 3 pages) until the
       file sits below ``_DI_FREE_TIER_LIMIT_BYTES`` (3.5 MB). This
       handles free-tier (F0, 4 MB cap) users transparently.
    2. If Azure DI still rejects with ``InvalidContentLength`` (e.g.
       the first 3 pages somehow still render too large), retry with a
       3-page hard-capped slice as a last resort.
    3. Any other Azure error is re-raised so the endpoint can surface it.

    On S0 (Standard) tier the pre-shrink still runs but the PDF will
    almost always pass the size check at the first candidate, so only one
    Azure call is made.
    """
    client = DocumentIntelligenceClient(
        endpoint=AZURE_DI_ENDPOINT,
        credential=AzureKeyCredential(AZURE_DI_KEY),
    )

    fitted = _fit_pdf_to_limit(document_bytes)
    logger.info(
        "Submitting %.2f MB PDF to Azure DI.", len(fitted) / 1_000_000
    )

    try:
        return _call_azure_di(client, fitted)
    except HttpResponseError as exc:
        if not _is_content_length_error(exc):
            raise

    # Last-resort: 3 pages only — covers abstract + intro for any paper
    logger.warning(
        "Azure DI still rejected after pre-shrink (%.2f MB). "
        "Retrying with 3 pages only.",
        len(fitted) / 1_000_000,
    )
    minimal = _truncate_pdf(document_bytes, max_pages=3)
    return _call_azure_di(client, minimal)


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@app.post("/api/audit", response_model=AuditResponse)
async def audit(file: UploadFile = File(...)) -> AuditResponse:
    """
    Audit a research paper end-to-end.

    Accepts a PDF upload (``multipart/form-data``, field name ``file``),
    extracts the paper's GitHub URL / dependencies / entry-point via
    gpt-4o, then hands the metadata to :class:`DockerAuditor` to actually
    build and run the project. Returns a :class:`ReproducibilityScorecard`
    with a 0-100 ``reproducibility_index``.
    """

    # --- Credential guards ---------------------------------------------------
    if not AZURE_DI_ENDPOINT or not AZURE_DI_KEY:
        raise HTTPException(
            status_code=500,
            detail="Azure Document Intelligence credentials not configured.",
        )
    if not AZURE_OAI_ENDPOINT or not AZURE_OAI_KEY:
        raise HTTPException(
            status_code=500,
            detail="Azure OpenAI credentials not configured.",
        )

    # --- 1. Read & validate upload ------------------------------------------
    document_bytes = await file.read()
    if not document_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(document_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(document_bytes):,} bytes; max 100 MB).",
        )
    if not document_bytes.startswith(b"%PDF-"):
        raise HTTPException(
            status_code=422,
            detail=f"Not a PDF (first bytes: {document_bytes[:8]!r}).",
        )

    # --- 2. Azure Document Intelligence → Markdown --------------------------
    try:
        markdown_content = _analyze_document_as_markdown(document_bytes)
    except HttpResponseError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Azure Document Intelligence error: {exc.message}",
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Azure OCR failed: {exc}") from exc

    logger.info("Azure returned %d chars of Markdown.", len(markdown_content))

    # --- 3. LLM extraction --------------------------------------------------
    metadata = _llm_extract_metadata(markdown_content)
    source = "llm_one_shot" if metadata is not None else "none"

    if metadata is None:
        # We still return a structured scorecard so the UI can render
        # something useful — just one with a zero reproducibility index.
        empty_metadata = PaperMetadata()
        empty_execution = DockerExecutionResult(
            build_success=False,
            exit_code=-1,
            logs="[auditflow] could not extract paper metadata from the PDF.",
        )
        return AuditResponse(
            scorecard=ReproducibilityScorecard(
                metadata=empty_metadata,
                execution=empty_execution,
            ),
            source=source,
            error="Failed to extract reproducibility metadata from the paper.",
        )

    # --- 4. Docker sandbox audit -------------------------------------------
    # run_audit is synchronous (Docker SDK uses blocking I/O). Running it
    # directly in an async handler would freeze the entire event loop for the
    # duration of the build + run — potentially 10+ minutes. asyncio.to_thread
    # offloads it to a worker thread so FastAPI stays responsive. The outer
    # wait_for enforces a hard 5-minute wall-clock ceiling so a runaway build
    # can never permanently hang the server.
    _AUDIT_TIMEOUT_SECONDS = 300  # 5 minutes total (build + run)
    try:
        audit_result = await asyncio.wait_for(
            asyncio.to_thread(_auditor.run_audit, metadata, markdown_content),
            timeout=_AUDIT_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.warning("Docker audit timed out after %ds.", _AUDIT_TIMEOUT_SECONDS)
        audit_result = {
            "build_success": False,
            "exit_code": -1,
            "logs": (
                f"[auditflow] audit timed out after {_AUDIT_TIMEOUT_SECONDS}s. "
                "The repository may require a very long build or the Docker daemon "
                "is unavailable. Try a smaller paper or check Docker Desktop."
            ),
            "discovered_path": None,
            "reasoning_log": [],
            "attempted_fixes": [],
            "terminal_signal": None,
            "executed_real_script": False,
        }

    try:
        execution = DockerExecutionResult(**audit_result)
    except ValidationError as exc:
        # Defensive: if the auditor ever returns a malformed dict, surface
        # it as a 502 instead of letting Pydantic crash inside the response.
        logger.error("DockerAuditor returned an invalid payload: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="DockerAuditor returned a malformed result.",
        ) from exc

    scorecard = ReproducibilityScorecard(metadata=metadata, execution=execution)

    # --- 5. Generate "Why this score?" justification ----------------------
    # Runs as a separate GPT-4o call after the audit so it can synthesise
    # the final score, the raw logs, and the agent's reasoning into a
    # 3-paragraph Markdown explanation for the researcher.  Skipped when
    # no Azure OpenAI agent is configured (credentials missing or Docker
    # was unavailable at startup).
    justification: str | None = None
    if _agent is not None:
        try:
            justification = await asyncio.to_thread(
                _agent.generate_justification,
                reproducibility_index=scorecard.reproducibility_index,
                logs=execution.logs,
                metadata_claims={
                    "github_url": metadata.github_url,
                    "dependencies": metadata.dependencies,
                    "entry_point": metadata.entry_point,
                },
                reasoning_log=execution.reasoning_log,
                attempted_fixes=execution.attempted_fixes,
                terminal_signal=execution.terminal_signal,
            )
        except Exception as _just_exc:  # noqa: BLE001
            logger.warning(
                "generate_justification raised unexpectedly: %s", _just_exc
            )

    return AuditResponse(
        scorecard=scorecard,
        source=source,
        error=None if execution.build_success else
              "Docker build failed — see logs for details.",
        justification=justification,
    )


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health")
async def health() -> dict[str, str]:
    """Lightweight readiness probe used by the frontend and uptime checks."""
    return {
        "status": "ok",
        "service": "auditflow",
        "azure_openai": "configured" if _oai_client is not None else "not configured",
        "azure_openai_deployment": AZURE_OAI_DEPLOY,
        "azure_document_intelligence":
            "configured" if AZURE_DI_ENDPOINT else "not configured",
        "output_format": "markdown",
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
