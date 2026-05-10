/** Mirrors FastAPI / Pydantic JSON (snake_case). */

export interface PaperMetadata {
  github_url: string;
  dependencies: string[];
  entry_point: string;
}

export interface DockerExecutionResult {
  build_success: boolean;
  exit_code: number;
  logs: string;
  discovered_path: string | null;
  reasoning_log: Record<string, unknown>[];
  attempted_fixes: Record<string, unknown>[];
  terminal_signal: string | null;
  executed_real_script: boolean;
}

export interface ReproducibilityScorecard {
  metadata: PaperMetadata;
  execution: DockerExecutionResult;
  reproducibility_index: number;
}

export interface AuditResponse {
  scorecard: ReproducibilityScorecard;
  source: string;
  error: string | null;
  justification: string | null;
}

export type AuditEntryStatus = "PASS" | "WARN" | "FAIL";

export interface AuditEntry {
  id: string;
  paper: string;
  date: string;
  rindex: number;
  status: AuditEntryStatus;
  githubUrl: string;
  response?: AuditResponse;
}

export type JobSubmitPayload =
  | { mode: "pdf"; file: File; dataset?: File }
  | { mode: "arxiv"; arxivId: string; dataset?: File };
