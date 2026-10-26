import Select from "../Select";
import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "./api";
import SecretField from "./SecretField";
export interface MailConfig {
  provider: string;
  sender_name: string;
  support_email: string;
  recovery_sender: string;
  updates_sender: string;
  reply_to: string;
  recovery_enabled: number;
  updates_enabled: number;
  reminders_enabled: number;
  daily_email_limit: number;
  site_name: string;
  public_url: string;
  session_hours: number;
  reminder_days: number;
}
export default function EmailSettings({
  config,
  secrets,
  demo,
  accountEmail,
  onSaved,
}: {
  config: MailConfig;
  secrets: { name: string }[];
  demo: boolean;
  accountEmail: string;
  onSaved: () => void;
}) {
  const [provider, setProvider] = useState(config.provider),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/admin", {
        ...Object.fromEntries(new FormData(e.currentTarget)),
        action: "email",
      });
      setNotice("Saved");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify(sender: string) {
    setBusy(true);
    setError("");
    try {
      await api("/admin", { action: "email_verification", sender });
      setNotice("Accepted by the email provider.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ws-admin-grid">
      <section className="ws-card">
        <h2>Delivery</h2>
        <form onSubmit={submit}>
          <label>
            Provider
            <Select
              name="provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              <option value="resend">Resend</option>
              <option value="sendgrid">SendGrid</option>
            </Select>
          </label>
          <SecretField
            key={provider}
            name="api_key"
            label="API key"
            secretName={"email_" + provider}
            saved={secrets.some((s) => s.name === "email_" + provider)}
            disabled={demo}
          />
          <label title="Name displayed beside sender addresses.">
            Name
            <input
              name="sender_name"
              defaultValue={config.sender_name}
              required
              maxLength={80}
            />
          </label>
          <label title="Address used for password-reset messages. Its domain must be verified with your provider.">
            Recovery sender
            <input
              name="recovery_sender"
              type="email"
              defaultValue={config.recovery_sender}
            />
          </label>
          <label title="Address used for case updates, escalations and deadline reminders.">
            Updates sender
            <input
              name="updates_sender"
              type="email"
              defaultValue={config.updates_sender}
            />
          </label>
          <label>
            Reply-to
            <input
              name="reply_to"
              type="email"
              defaultValue={config.reply_to}
            />
          </label>
          <label>
            Support
            <input
              name="support_email"
              type="email"
              defaultValue={config.support_email}
            />
          </label>
          <label title="Maximum outgoing email attempts per UTC day, shared by recovery and case notifications.">
            Daily limit
            <input
              name="daily_email_limit"
              type="number"
              min={1}
              max={1000}
              required
              defaultValue={config.daily_email_limit}
            />
          </label>
          <fieldset>
            <legend>Messages</legend>
            {[
              ["recovery_enabled", "Recovery"],
              ["updates_enabled", "Updates"],
              ["reminders_enabled", "Reminders"],
            ].map(([name, label]) => (
              <label className="ws-checkbox" key={name}>
                <input
                  type="checkbox"
                  name={name}
                  defaultChecked={!!config[name as keyof MailConfig]}
                />
                {label}
              </label>
            ))}
          </fieldset>
          {error && (
            <p className="ws-error" role="alert">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          <button className="ws-primary" disabled={busy}>
            Save
          </button>
        </form>
      </section>
      <section className="ws-card">
        <h2>Verification</h2>
        <p className="ws-hint">
          Save the settings first. Send only to your own account email to verify
          each sender.
        </p>
        <dl>
          <dt>Recipient</dt>
          <dd>{accountEmail || "Not configured"}</dd>
          <dt>Recovery</dt>
          <dd>{config.recovery_sender || "Not configured"}</dd>
          <dt>Updates</dt>
          <dd>{config.updates_sender || "Not configured"}</dd>
        </dl>
        {demo ? (
          <p className="ws-description">
            Sending test emails requires a production IT account.
          </p>
        ) : !accountEmail ? (
          <p className="ws-description">
            Add an email address to your IT account before sending a test email.
          </p>
        ) : null}
        <div className="ws-actions">
          <button
            disabled={busy || demo || !accountEmail}
            aria-busy={busy}
            title={
              demo
                ? "Test emails are disabled for demo accounts."
                : !accountEmail
                  ? "Add your account email first."
                  : undefined
            }
            onClick={() => void verify("recovery")}
          >
            Recovery
          </button>
          <button
            disabled={busy || demo || !accountEmail}
            aria-busy={busy}
            title={
              demo
                ? "Test emails are disabled for demo accounts."
                : !accountEmail
                  ? "Add your account email first."
                  : undefined
            }
            onClick={() => void verify("updates")}
          >
            Updates
          </button>
        </div>
      </section>
    </div>
  );
}
