import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { BrandMark } from "./Icons";
import ThemeToggle from "./ThemeToggle";
import SecretField from "./workspace/SecretField";
import { api } from "./workspace/api";
export default function IdentityPages() {
  const setup = location.pathname === "/it/setup",
    [theme, setTheme] = useState(
      document.documentElement.dataset.theme || "light",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState("");
  useEffect(() => {
    document.title = (setup ? "Setup" : "Reset") + " · AICTE";
  }, [setup]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm")) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await api<{ login?: string }>(
        "/auth/" + (setup ? "setup" : "reset"),
        {
          ...Object.fromEntries(f),
          token: new URLSearchParams(location.search).get("token") || "",
        },
      );
      if (!setup) history.replaceState(null, "", "/reset");
      setDone(r.login || "/it");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="identity-page">
      <header>
        <a className="brand" href={setup ? "/it" : "/"}>
          <BrandMark />
          <span className="brand-type">
            <strong>AICTE</strong>
          </span>
        </a>
        <ThemeToggle
          theme={theme}
          onToggle={() => {
            const next = theme === "dark" ? "light" : "dark";
            setTheme(next);
            document.documentElement.dataset.theme = next;
            try {
              localStorage.setItem("aicte-theme", next);
            } catch {
              /* Theme still applies. */
            }
          }}
        />
      </header>
      <section>
        <h1>{setup ? "Production setup" : "Reset password"}</h1>
        {done ? (
          <div>
            <p>
              {setup
                ? "Administrator created. Sign in to configure the server."
                : "Password changed. Sign in with your new password."}
            </p>
            <a href={done}>Sign in →</a>
          </div>
        ) : (
          <form onSubmit={submit}>
            {setup && (
              <>
                <SecretField name="setup_code" label="Setup code" required />
                <label>
                  ID
                  <input name="id" required maxLength={80} />
                </label>
                <label>
                  Name
                  <input name="name" required maxLength={120} />
                </label>
                <label>
                  Email
                  <input name="email" type="email" required maxLength={254} />
                </label>
              </>
            )}
            <SecretField
              name="password"
              label="Password"
              minLength={12}
              required
            />
            <SecretField
              name="confirm"
              label="Confirm"
              minLength={12}
              required
            />
            {error && (
              <p role="alert" className="identity-error">
                {error}
              </p>
            )}
            <button className="primary-button" disabled={busy}>
              {busy ? "Saving…" : setup ? "Create" : "Reset"}
            </button>
          </form>
        )}
      </section>
      <footer>© {new Date().getFullYear()} DeployedReject</footer>
    </main>
  );
}
