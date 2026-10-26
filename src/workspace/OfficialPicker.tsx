import { useEffect, useId, useRef, useState } from "react";
import type { Official } from "../../packages/shared/types";
import { api } from "./api";
type Result = { officials: Official[]; more: boolean };
const cache = new Map<string, { time: number; result: Result }>();
const pending = new Map<string, Promise<Result>>();
export function clearOfficialSearchCache() {
  cache.clear();
}
const matches = (o: Official, q: string) => {
  const text = `${o.name} ${o.id} ${o.designation} ${o.bureau}`.toLowerCase();
  return (q.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).every((term) =>
    text.includes(term),
  );
};
async function find(query: string, role: string, bureau: string) {
  const key = JSON.stringify([query, role, bureau]),
    hit = cache.get(key);
  if (hit && Date.now() - hit.time < 300000) return hit.result;
  const superset = [...cache.entries()].find(([k, v]) => {
    const [old, r, b] = JSON.parse(k);
    return (
      r === role &&
      b === bureau &&
      query.startsWith(old) &&
      !v.result.more &&
      Date.now() - v.time < 300000
    );
  });
  if (superset)
    return {
      officials: superset[1].result.officials.filter((o) => matches(o, query)),
      more: false,
    };
  if (pending.has(key)) return pending.get(key)!;
  const task = api<Result>(
    "/admin/officials?" + new URLSearchParams({ q: query, role, bureau }),
  )
    .then((result) => {
      cache.set(key, { time: Date.now(), result });
      if (cache.size > 40) cache.delete(cache.keys().next().value!);
      return result;
    })
    .finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}
export default function OfficialPicker({
  name,
  label,
  officials,
  role = "",
  bureau = "",
  value = "",
  required = false,
  onSelect,
}: {
  name: string;
  label: string;
  officials: Official[];
  role?: string;
  bureau?: string;
  value?: string;
  required?: boolean;
  onSelect?: (o: Official | null) => void;
}) {
  const uid = useId(),
    input = useRef<HTMLInputElement>(null),
    [query, setQuery] = useState(
      () => officials.find((o) => o.id === value)?.name || value,
    ),
    [selected, setSelected] = useState(value),
    [open, setOpen] = useState(false),
    [results, setResults] = useState<Official[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [active, setActive] = useState(-1),
    [more, setMore] = useState(false);
  const choices = officials.filter(
    (o) =>
      o.role !== "it" &&
      (!role || o.role === role) &&
      (!bureau || o.bureau === bureau) &&
      !(name === "official_id" && o.id === "0000"),
  );
  useEffect(() => {
    setSelected(value);
    setQuery(officials.find((o) => o.id === value)?.name || value);
    input.current?.setCustomValidity("");
  }, [value, officials]);
  useEffect(() => {
    if (!open) return;
    const q = query.trim().toLowerCase();
    setActive(-1);
    setError("");
    setResults(choices.filter((o) => matches(o, q)).slice(0, 8));
    setMore(false);
    if (q.length < 2 || selected || officials.length < 100) {
      setBusy(false);
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      setBusy(true);
      find(q, role, bureau)
        .then((result) => {
          if (!current) return;
          const combined = new Map(
            [...choices.filter((o) => matches(o, q)), ...result.officials].map(
              (o) => [o.id, o],
            ),
          );
          setResults(
            [...combined.values()]
              .filter((o) => !(name === "official_id" && o.id === "0000"))
              .slice(0, 8),
          );
          setMore(result.more || combined.size > 8);
        })
        .catch((e) => {
          if (current) setError(e.message);
        })
        .finally(() => {
          if (current) setBusy(false);
        });
    }, 500);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, open, role, bureau, selected]);
  function choose(o: Official) {
    setSelected(o.id);
    setQuery(o.name);
    setOpen(false);
    setBusy(false);
    input.current?.setCustomValidity("");
    onSelect?.(o);
  }
  return (
    <div className="ws-picker">
      <label htmlFor={uid}>{label}</label>
      <input type="hidden" name={name} value={selected} />
      <input
        ref={input}
        id={uid}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={uid + "list"}
        aria-activedescendant={active >= 0 ? uid + "item" + active : undefined}
        placeholder="Name or ID"
        value={query}
        autoComplete="off"
        required={required}
        onFocus={() => setOpen(true)}
        onBlur={(e) => {
          if (!e.currentTarget.parentElement?.contains(e.relatedTarget))
            setOpen(false);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected("");
          setOpen(true);
          e.currentTarget.setCustomValidity(
            required && e.target.value ? "Choose a suggestion." : "",
          );
          onSelect?.(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, results.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          }
          if (e.key === "Enter" && open && active >= 0 && results[active]) {
            e.preventDefault();
            choose(results[active]);
          }
        }}
      />
      {open && (
        <div className="ws-picker-popup">
          <div id={uid + "list"} role="listbox" aria-label={label}>
            {results.map((o, i) => (
              <button
                type="button"
                role="option"
                aria-selected={active === i}
                id={uid + "item" + i}
                key={o.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o)}
              >
                <span>
                  {o.name}
                  <small>
                    {o.id} · {o.designation}
                  </small>
                </span>
                <small>{o.bureau}</small>
              </button>
            ))}
          </div>
          <small className="ws-picker-status" role="status">
            {busy
              ? "Searching…"
              : error ||
                (more
                  ? "Refine search"
                  : !results.length
                    ? query.length < 2
                      ? "Type a name or ID"
                      : "No matches"
                    : "")}
          </small>
        </div>
      )}
    </div>
  );
}
