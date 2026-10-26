import { useEffect, useId, useRef, useState } from "react";
import type { Institution } from "../../packages/shared/types";
import { api } from "./api";
type Results = { institutions: Institution[]; more: boolean };
const cache = new Map<string, { at: number; data: Results }>(),
  pending = new Map<string, Promise<Results>>();
async function search(query: string) {
  const hit = cache.get(query);
  if (hit && Date.now() - hit.at < 300000) return hit.data;
  if (pending.has(query)) return pending.get(query)!;
  const promise = api<Results>(
    "/institutions/search?q=" + encodeURIComponent(query),
  )
    .then((data) => {
      cache.set(query, { at: Date.now(), data });
      if (cache.size > 40) cache.delete(cache.keys().next().value!);
      return data;
    })
    .finally(() => pending.delete(query));
  pending.set(query, promise);
  return promise;
}
export default function InstitutionPicker({
  name = "institution_id",
  label = "Institution",
  required = false,
  onSelect,
}: {
  name?: string;
  label?: string;
  required?: boolean;
  onSelect?: (item: Institution | null) => void;
}) {
  const id = useId(),
    input = useRef<HTMLInputElement>(null),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<Institution | null>(null),
    [open, setOpen] = useState(false),
    [data, setData] = useState<Results>({ institutions: [], more: false }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [active, setActive] = useState(-1);
  useEffect(() => {
    setActive(-1);
    setError("");
    if (!open || selected || query.trim().length < 2) {
      setBusy(false);
      setData({ institutions: [], more: false });
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      setBusy(true);
      search(query.trim().toLowerCase())
        .then((value) => {
          if (current) setData(value);
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
  }, [query, open, selected]);
  function choose(item: Institution) {
    setSelected(item);
    setQuery(item.name);
    setOpen(false);
    input.current?.setCustomValidity("");
    onSelect?.(item);
  }
  return (
    <div className="ws-picker">
      <label htmlFor={id}>{label}</label>
      <input type="hidden" name={name} value={selected?.id || ""} />
      <input
        id={id}
        ref={input}
        value={query}
        required={required}
        role="combobox"
        aria-expanded={open}
        aria-controls={id + "-list"}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? id + "-item-" + active : undefined}
        autoComplete="off"
        placeholder="Institution name or Permanent ID"
        onFocus={() => setOpen(true)}
        onBlur={(event) => {
          if (!event.currentTarget.parentElement?.contains(event.relatedTarget))
            setOpen(false);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelected(null);
          setOpen(true);
          input.current?.setCustomValidity(
            required && event.target.value
              ? "Choose an institution from the suggestions."
              : "",
          );
          onSelect?.(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, data.institutions.length - 1));
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          }
          if (
            event.key === "Enter" &&
            open &&
            active >= 0 &&
            data.institutions[active]
          ) {
            event.preventDefault();
            choose(data.institutions[active]);
          }
        }}
      />
      {open && !selected && (
        <div className="ws-picker-popup">
          <div id={id + "-list"} role="listbox" aria-label={label}>
            {data.institutions.map((item, i) => (
              <button
                key={item.id}
                type="button"
                role="option"
                id={id + "-item-" + i}
                aria-selected={active === i}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(item)}
              >
                <span>
                  {item.name}
                  <small>
                    {item.permanent_id} · {item.city}, {item.state}
                  </small>
                </span>
              </button>
            ))}
          </div>
          <small role="status" className="ws-picker-status">
            {busy
              ? "Searching institutions…"
              : error ||
                (query.trim().length < 2
                  ? "Type at least two characters."
                  : data.more
                    ? "Refine your search to see more institutions."
                    : !data.institutions.length
                      ? "No matching institutions."
                      : "")}
          </small>
        </div>
      )}
    </div>
  );
}
