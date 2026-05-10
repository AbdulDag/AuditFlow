export interface User {
  id: string;
  name: string;
  email: string;
}

export interface AuditEntry {
  id: string;
  paper: string;
  date: string;
  rindex: number;
  status: "PASS" | "WARN" | "FAIL";
}
