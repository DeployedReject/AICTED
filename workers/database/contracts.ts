export interface Query {
  sql: string;
  params: unknown[];
}
export interface Result {
  results: Record<string, unknown>[];
  success: boolean;
  meta: { changes: number; duration: number };
}
export interface Profile {
  id: string;
  name: string;
  source: "bound" | "d1" | "postgres";
  account_id: string;
  database_id: string;
  host: string;
  port: number;
  database_name: string;
  username: string;
  credential: string;
  checked_at: string;
  checked_ok: number;
  check_message: string;
  created_at: string;
}
export interface MoveJob {
  id: string;
  source: string;
  target: string;
  mode: "copy" | "prepared";
  phase: "copying" | "validating" | "complete" | "failed";
  table: number;
  cursor: number;
  last_keys?: unknown[];
  copied: number;
  source_counts: Record<string, number>;
  message: string;
  started_at: string;
}
export const tables = [
  "officials",
  "institutions",
  "org_units",
  "tags",
  "institution_accounts",
  "institution_sessions",
  "institution_password_resets",
  "institution_recovery_usage",
  "institution_routing",
  "cases",
  "institution_events",
  "handoff_requests",
  "case_events",
  "case_notices",
  "case_documents",
  "case_folders",
  "case_relations",
  "case_grants",
  "coordination_requests",
  "messages",
  "sessions",
  "workspace_settings",
  "migration_settings",
  "tag_cache",
  "inference_usage",
  "runtime_settings",
  "secret_store",
  "admin_audit",
  "password_resets",
  "recovery_usage",
  "mail_daily",
  "notification_outbox",
  "production_bootstrap",
] as const;
export const keys: Record<(typeof tables)[number], string[]> = {
  officials: ["id"],
  institutions: ["id"],
  org_units: ["code"],
  tags: ["code", "is_demo"],
  institution_accounts: ["id"],
  institution_sessions: ["token_hash"],
  institution_password_resets: ["token_hash"],
  institution_recovery_usage: ["account_id", "day"],
  institution_routing: ["is_demo", "bureau"],
  institution_events: ["id"],
  handoff_requests: ["id"],
  cases: ["id"],
  case_documents: ["id"],
  case_folders: ["case_id"],
  case_events: ["id"],
  case_notices: ["id"],
  case_relations: ["case_id", "related_case_id"],
  case_grants: ["case_id", "official_id"],
  coordination_requests: ["id"],
  messages: ["id"],
  sessions: ["token_hash"],
  workspace_settings: ["is_demo"],
  migration_settings: ["is_demo"],
  tag_cache: ["cache_key"],
  inference_usage: ["official_id", "day"],
  runtime_settings: ["is_demo"],
  secret_store: ["is_demo", "name"],
  admin_audit: ["id"],
  password_resets: ["token_hash"],
  recovery_usage: ["official_id", "day"],
  mail_daily: ["day"],
  notification_outbox: ["id"],
  production_bootstrap: ["id"],
};
export const original: Profile = {
  id: "original",
  name: "aicted-workspace",
  source: "bound",
  account_id: "",
  database_id: "89aee8a9-9366-4a4c-a7ec-031ed3edb9a8",
  host: "",
  port: 5432,
  database_name: "aicted-workspace",
  username: "",
  credential: "",
  checked_at: "",
  checked_ok: 1,
  check_message: "Bound Cloudflare D1 database",
  created_at: "",
};
