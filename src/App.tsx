import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { BrandMark, Icon } from "./Icons";
import IndiaMap from "./IndiaMap";
import ThemeToggle from "./ThemeToggle";
import { api } from "./workspace/api";

type Audience = "official" | "institution";
type View = "login" | "recovery";
type Dialog = "support" | "access" | "admin" | null;

const designations = [
  "Chairman",
  "Vice Chairman",
  "Member Secretary",
  "Adviser-I",
  "Adviser-II",
  "Director",
  "Deputy Director",
  "Assistant Director",
  "Regional Officer",
  "Supporting Official",
  "Technical Official",
  "Other",
  "Test",
];

function readTheme() {
  try {
    const saved = localStorage.getItem("aicte-theme");
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    /* Storage can be disabled in private browsing. */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export default function App() {
  const isIT = location.pathname.replace(/\/$/, "") === "/it";
  const [theme, setTheme] = useState(readTheme);
  const [audience, setAudience] = useState<Audience>("official");
  const [view, setView] = useState<View>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [setupAvailable, setSetupAvailable] = useState(false),
    [supportEmail, setSupportEmail] = useState("");
  useEffect(() => {
    if (isIT)
      api<{ available: boolean }>("/auth/setup-status")
        .then((r) => setSetupAvailable(r.available))
        .catch(() => {});
  }, [isIT]);

  const [dialog, setDialog] = useState<Dialog>(null);
  useEffect(() => {
    if (dialog === "support")
      api<{ support_email: string }>("/public-config")
        .then((r) => setSupportEmail(r.support_email))
        .catch(() => {});
  }, [dialog]);
  const modal = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#171b1f" : "#f7f7f4");
    try {
      localStorage.setItem("aicte-theme", theme);
    } catch {
      /* Theme still works without storage. */
    }
  }, [theme]);

  useEffect(() => {
    if (dialog) modal.current?.showModal();
    else modal.current?.close();
  }, [dialog]);

  useEffect(() => {
    document.title = `${view === "recovery" ? "Reset password" : "Sign in"} · AICTE Institution Complaint Portal`;
  }, [view]);

  function changeAudience(next: Audience) {
    setAudience(next);
    setShowPassword(false);
    setNotice("");
  }

  function changeView(next: View) {
    setView(next);
    setNotice("");
    setShowPassword(false);
    requestAnimationFrame(() => title.current?.focus());
  }

  async function login(id: string, password: string, designation: string) {
    setBusy(true);
    setNotice("");
    try {
      await api("/auth/login", {
        id,
        password,
        designation,
        portal: isIT ? "it" : "official",
      });
      sessionStorage.removeItem("demo-actor");
      location.assign(isIT ? "/it/workspace" : "/workspace");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (view === "recovery") {
      const data = new FormData(event.currentTarget);
      setBusy(true);
      setNotice("");
      void api<{ message: string }>("/auth/recover", {
        email: data.get("email"),
      })
        .then((r) => setNotice(r.message))
        .catch((e) => setNotice(e.message))
        .finally(() => setBusy(false));
      return;
    }
    if (audience === "institution") {
      setNotice(
        "Institution accounts must be provisioned by IT. Contact your administrator.",
      );
      return;
    }
    const data = new FormData(event.currentTarget);
    void login(
      String(data.get("username")),
      String(data.get("password")),
      isIT ? "" : String(data.get("designation")),
    );
  }

  const dialogContent = {
    support: {
      title: "Need a hand?",
      text: supportEmail
        ? `Contact ${supportEmail} for account help.`
        : "Contact your administrator for account help.",
    },
    access: {
      title: "Institution access",
      text: "Your institution’s authorised representative will need an account. Contact your AICTE administrator to request access.",
    },
    admin: {
      title: "IT administration",
      text: "Sign in with your assigned official ID and designation. Administration appears only for accounts granted IT access.",
    },
  };

  return (
    <main className="portal">
      <a className="skip-link" href="#login-content">
        Skip to sign in
      </a>
      <section className="login-panel" aria-label="Account sign-in">
        <header className="login-header">
          <a
            className="brand"
            href="/"
            aria-label="AICTE Institution Complaint Portal home"
          >
            <BrandMark />
            <span className="brand-type">
              <strong>AICTE</strong>
              <span>All India Council for Technical Education</span>
            </span>
          </a>
          <ThemeToggle
            theme={theme}
            onToggle={() => setTheme(theme === "dark" ? "light" : "dark")}
          />
        </header>

        <div className="login-main" id="login-content">
          <div className="form-container">
            <div className="intro">
              <h1 tabIndex={-1} ref={title}>
                {view === "login" ? (isIT ? "IT" : "Sign in") : "Recovery"}
              </h1>
            </div>

            {view === "login" ? (
              <>
                {!isIT && (
                  <div
                    className="audience-tabs"
                    role="tablist"
                    aria-label="Account type"
                  >
                    {(["official", "institution"] as const).map(
                      (type, index) => (
                        <button
                          key={type}
                          ref={(el) => {
                            tabRefs.current[index] = el;
                          }}
                          type="button"
                          id={`${type}-tab`}
                          role="tab"
                          aria-selected={audience === type}
                          aria-controls="account-form"
                          tabIndex={audience === type ? 0 : -1}
                          className={audience === type ? "selected" : ""}
                          onClick={() => changeAudience(type)}
                          onKeyDown={(event) => {
                            if (
                              [
                                "ArrowLeft",
                                "ArrowRight",
                                "Home",
                                "End",
                              ].includes(event.key)
                            ) {
                              event.preventDefault();
                              const next =
                                event.key === "Home"
                                  ? 0
                                  : event.key === "End"
                                    ? 1
                                    : 1 - index;
                              changeAudience(
                                next === 0 ? "official" : "institution",
                              );
                              tabRefs.current[next]?.focus();
                            }
                          }}
                        >
                          <Icon
                            name={type === "official" ? "shield" : "building"}
                            size={17}
                          />
                          {type === "official" ? "Official" : "Institution"}
                        </button>
                      ),
                    )}
                  </div>
                )}
                <div
                  role={isIT ? undefined : "tabpanel"}
                  id="account-form"
                  aria-labelledby={isIT ? undefined : `${audience}-tab`}
                >
                  <form className="login-form" key={audience} onSubmit={submit}>
                    {audience === "official" && !isIT && (
                      <div className="field">
                        <label htmlFor="designation">Designation</label>
                        <div className="select-wrap">
                          <select
                            id="designation"
                            name="designation"
                            required
                            defaultValue=""
                          >
                            <option value="" disabled>
                              Select your designation
                            </option>
                            {designations.map((rank) => (
                              <option key={rank}>{rank}</option>
                            ))}
                          </select>
                          <Icon name="chevron" size={17} />
                        </div>
                      </div>
                    )}
                    <div className="field">
                      <label htmlFor="account-id">
                        {audience === "official"
                          ? "Official ID"
                          : "Institution ID"}
                      </label>
                      <input
                        id="account-id"
                        name="username"
                        autoComplete="username"
                        placeholder={
                          audience === "official"
                            ? "Enter your official ID"
                            : "Enter your institution account ID"
                        }
                        autoCapitalize="none"
                        spellCheck={false}
                        maxLength={128}
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="password">Password</label>
                      <div className="password-wrap">
                        <input
                          id="password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          placeholder="Enter your password"
                          required
                          maxLength={256}
                        />
                        <button
                          className="password-toggle"
                          type="button"
                          aria-label={
                            showPassword ? "Hide password" : "Show password"
                          }
                          aria-pressed={showPassword}
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          <Icon
                            name={showPassword ? "eyeOff" : "eye"}
                            size={19}
                          />
                        </button>
                      </div>
                    </div>
                    <div className="recovery-link">
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => changeView("recovery")}
                      >
                        Forgot password?
                      </button>
                    </div>
                    {notice && (
                      <p className="form-notice" role="status">
                        <Icon name="lock" size={18} />
                        <span>{notice}</span>
                      </p>
                    )}
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={busy}
                    >
                      {busy ? "Signing in…" : "Sign in"}
                      <Icon name="arrow" size={19} />
                    </button>
                  </form>
                  <div className="login-links">
                    {isIT && setupAvailable && <a href="/it/setup">Setup</a>}
                    <button
                      className="text-button"
                      type="button"
                      onClick={() =>
                        setDialog(
                          audience === "official" ? "support" : "access",
                        )
                      }
                    >
                      {audience === "official" ? "Support" : "Access"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <form className="login-form recovery-form" onSubmit={submit}>
                <div className="field">
                  <label htmlFor="recovery-email">Email address</label>
                  <input
                    id="recovery-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="Enter your registered email"
                    required
                    maxLength={254}
                  />
                </div>
                {notice && (
                  <p className="form-notice" role="status">
                    <Icon name="mail" size={18} />
                    <span>{notice}</span>
                  </p>
                )}
                <button className="primary-button" type="submit">
                  Send reset link
                  <Icon name="arrow" size={19} />
                </button>
                <button
                  className="back-button"
                  type="button"
                  onClick={() => changeView("login")}
                >
                  <Icon name="back" size={17} />
                  Back to sign in
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
      <IndiaMap />
      <footer className="login-footer">
        <span>© {new Date().getFullYear()} DeployedReject</span>
        <span className="map-credit">
          <a
            href="https://github.com/datameet/maps/blob/master/Country/india-composite.geojson"
            target="_blank"
            rel="noreferrer"
          >
            DataMeet · CC BY 4.0
          </a>
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            © OpenStreetMap contributors
          </a>
          <a href="/assets/local-map-data.json" download>
            Local vectors · ODbL
          </a>
        </span>
        <a className="admin-link" href={isIT ? "/" : "/it"}>
          {isIT ? "Officials" : "IT"}
          <Icon name="arrow" size={13} />
        </a>
      </footer>

      <dialog
        ref={modal}
        className="info-dialog"
        onCancel={() => setDialog(null)}
        onClose={() => setDialog(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            const rect = event.currentTarget.getBoundingClientRect();
            if (
              event.clientX < rect.left ||
              event.clientX > rect.right ||
              event.clientY < rect.top ||
              event.clientY > rect.bottom
            )
              setDialog(null);
          }
        }}
        aria-labelledby="dialog-title"
        aria-describedby="dialog-copy"
      >
        <button
          className="dialog-close"
          type="button"
          aria-label="Close dialog"
          onClick={() => setDialog(null)}
        >
          <Icon name="close" />
        </button>
        <span className="dialog-symbol">
          <Icon name={dialog === "admin" ? "shield" : "mail"} size={24} />
        </span>
        <h2 id="dialog-title">{dialog ? dialogContent[dialog].title : ""}</h2>
        <p id="dialog-copy">{dialog ? dialogContent[dialog].text : ""}</p>
        <button
          type="button"
          className="primary-button"
          onClick={() => setDialog(null)}
        >
          Got it
          <Icon name="check" size={18} />
        </button>
      </dialog>
    </main>
  );
}
