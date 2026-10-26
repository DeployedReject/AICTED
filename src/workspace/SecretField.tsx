import { useEffect, useId, useState } from "react";
import { Icon } from "../Icons";
import { api } from "./api";
export default function SecretField({
  name,
  label,
  secretName,
  saved = false,
  required = false,
  disabled = false,
  minLength = 0,
  onValue,
}: {
  name: string;
  label: string;
  secretName?: string;
  saved?: boolean;
  required?: boolean;
  disabled?: boolean;
  minLength?: number;
  onValue?: (value: string) => void;
}) {
  const id = useId(),
    [value, setValue] = useState(""),
    [visible, setVisible] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setValue("");
    setVisible(false);
    setError("");
  }, [secretName]);
  async function toggle() {
    if (!visible && !value && saved && secretName) {
      setBusy(true);
      setError("");
      try {
        const r = await api<{ value: string }>("/admin", {
          action: "secret_reveal",
          name: secretName,
        });
        setValue(r.value);
        onValue?.(r.value);
        setVisible(true);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    } else setVisible((v) => !v);
  }
  return (
    <div
      className="ws-secret"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setVisible(false);
      }}
    >
      <label htmlFor={id}>{label}</label>
      <div>
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          value={value}
          required={required}
          disabled={disabled}
          minLength={minLength}
          maxLength={4000}
          autoComplete={secretName ? "off" : "new-password"}
          spellCheck={false}
          autoCapitalize="none"
          placeholder={
            disabled
              ? "Production account required"
              : saved
                ? "Saved — leave blank to keep"
                : ""
          }
          onChange={(e) => {
            setValue(e.target.value);
            onValue?.(e.target.value);
          }}
        />
        <button
          type="button"
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
          disabled={disabled || busy}
          aria-pressed={visible}
          onClick={() => void toggle()}
        >
          <Icon name={visible ? "eyeOff" : "eye"} size={17} />
        </button>
      </div>
      {error && (
        <small role="alert" className="ws-error">
          {error}
        </small>
      )}
    </div>
  );
}
