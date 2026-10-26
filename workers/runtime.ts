import type { Env } from "./shared";
export interface RuntimeConfig {
  is_demo: number;
  site_name: string;
  public_url: string;
  support_email: string;
  provider: "resend" | "sendgrid";
  sender_name: string;
  recovery_sender: string;
  updates_sender: string;
  reply_to: string;
  recovery_enabled: number;
  updates_enabled: number;
  reminders_enabled: number;
  daily_email_limit: number;
  reminder_days: number;
  session_hours: number;
}
export const defaultConfig: RuntimeConfig = {
  is_demo: 0,
  site_name: "AICTE",
  public_url: "",
  support_email: "",
  provider: "resend",
  sender_name: "AICTE",
  recovery_sender: "",
  updates_sender: "",
  reply_to: "",
  recovery_enabled: 0,
  updates_enabled: 0,
  reminders_enabled: 0,
  daily_email_limit: 100,
  reminder_days: 3,
  session_hours: 8,
};
export async function runtime(env: Env, demo: number): Promise<RuntimeConfig> {
  return {
    ...defaultConfig,
    ...(await (env.CONTROL_DB || env.DB)
      .prepare("SELECT * FROM runtime_settings WHERE is_demo=?")
      .bind(demo)
      .first<RuntimeConfig>()),
    is_demo: demo,
  };
}
