import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type SelectHTMLAttributes,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
type Props = SelectHTMLAttributes<HTMLSelectElement>;
interface Option {
  value: string;
  label: string;
  disabled: boolean;
}
function optionsFrom(children: Props["children"]): Option[] {
  return Children.toArray(children).flatMap((child) => {
    if (
      !isValidElement<{
        value?: string;
        children?: Props["children"];
        disabled?: boolean;
      }>(child)
    )
      return [];
    if (child.type !== "option") return optionsFrom(child.props.children);
    const label = Children.toArray(child.props.children).join("");
    return [
      {
        value: String(child.props.value ?? label),
        label,
        disabled: !!child.props.disabled,
      },
    ];
  });
}
export default function Select({
  children,
  onChange,
  value,
  defaultValue,
  id,
  disabled,
  required,
  className,
  ...props
}: Props) {
  const uid = useId(),
    listId = uid + "-options",
    native = useRef<HTMLSelectElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    popup = useRef<HTMLDivElement>(null);
  const options = optionsFrom(children),
    [local, setLocal] = useState(
      String(defaultValue ?? options[0]?.value ?? ""),
    ),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(0),
    [position, setPosition] = useState<CSSProperties>({}),
    [label, setLabel] = useState("");
  const selected = String(value ?? local),
    current = options.find((option) => option.value === selected),
    typeahead = useRef({ text: "", time: 0 });
  useEffect(() => {
    if (id)
      setLabel(
        document
          .querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`)
          ?.textContent?.trim() || "",
      );
  }, [id]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  useEffect(() => {
    const form = native.current?.form;
    if (!form) return;
    const reset = () => {
      setLocal(String(defaultValue ?? options[0]?.value ?? ""));
      setOpen(false);
    };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [defaultValue, children]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current!.getBoundingClientRect(),
        height = Math.min(300, innerHeight * 0.48),
        below = innerHeight - rect.bottom - 12;
      setPosition({
        left: Math.max(8, Math.min(rect.left, innerWidth - rect.width - 8)),
        width: Math.min(rect.width, innerWidth - 16),
        maxHeight: Math.max(
          100,
          Math.min(height, Math.max(below, rect.top - 12)),
        ),
        ...(below >= Math.min(height, 160)
          ? { top: rect.bottom + 5 }
          : { bottom: innerHeight - rect.top + 5 }),
      });
    };
    const outside = (event: PointerEvent) => {
      if (
        !trigger.current?.contains(event.target as Node) &&
        !popup.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    place();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  useEffect(() => {
    if (open)
      document
        .getElementById(listId + "-" + active)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);
  function show() {
    setActive(
      Math.max(
        0,
        options.findIndex((option) => option.value === selected),
      ),
    );
    setOpen(true);
  }
  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    setLocal(option.value);
    if (native.current) {
      native.current.value = option.value;
      native.current.dispatchEvent(new Event("change", { bubbles: true }));
    }
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <span className={"themed-select " + (className || "")}>
      <select
        {...props}
        id={id ? id + "-native" : undefined}
        ref={native}
        className="themed-select-native"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        required={required}
        value={value ?? local}
        onChange={(event) => {
          setLocal(event.target.value);
          onChange?.(event);
        }}
        onInvalid={(event) => {
          event.preventDefault();
          trigger.current?.focus();
          show();
        }}
      >
        {children}
      </select>
      <button
        id={id}
        ref={trigger}
        type="button"
        className="themed-select-trigger"
        role="combobox"
        aria-label={
          props["aria-label"] || label || props.name || "Select an option"
        }
        aria-labelledby={props["aria-labelledby"]}
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-required={required}
        aria-activedescendant={open ? listId + "-" + active : undefined}
        disabled={disabled}
        onBlur={(event) => {
          if (!popup.current?.contains(event.relatedTarget as Node))
            setOpen(false);
        }}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(event) => {
          const key = event.key;
          if (key === "Escape") {
            setOpen(false);
            event.preventDefault();
            return;
          }
          if (key === "Tab") {
            setOpen(false);
            return;
          }
          if (key === "Enter" || key === " ") {
            event.preventDefault();
            if (open) choose(active);
            else show();
            return;
          }
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(key)) {
            event.preventDefault();
            if (!open) {
              show();
              return;
            }
            let next =
              key === "Home"
                ? 0
                : key === "End"
                  ? options.length - 1
                  : active + (key === "ArrowDown" ? 1 : -1);
            const step = key === "ArrowUp" || key === "End" ? -1 : 1;
            while (next >= 0 && next < options.length && options[next].disabled)
              next += step;
            if (next >= 0 && next < options.length) setActive(next);
            return;
          }
          if (
            key.length === 1 &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey
          ) {
            event.preventDefault();
            const now = Date.now();
            typeahead.current = {
              text:
                (now - typeahead.current.time < 700
                  ? typeahead.current.text
                  : "") + key.toLowerCase(),
              time: now,
            };
            const index = options.findIndex(
              (option) =>
                !option.disabled &&
                option.label.toLowerCase().startsWith(typeahead.current.text),
            );
            if (index >= 0) {
              setActive(index);
              setOpen(true);
            }
          }
        }}
      >
        <span className={!selected ? "themed-select-placeholder" : ""}>
          {current?.label || "Select an option"}
        </span>
        <span className="themed-select-arrow" aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={popup}
            id={listId}
            role="listbox"
            aria-label={props["aria-label"] || label || "Options"}
            className="themed-select-menu"
            style={position}
          >
            {options.map((option, index) => (
              <div
                id={listId + "-" + index}
                key={option.value + "-" + index}
                role="option"
                aria-selected={selected === option.value}
                aria-disabled={option.disabled || undefined}
                data-active={active === index}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => !option.disabled && setActive(index)}
                onClick={() => choose(index)}
              >
                <span>{option.label}</span>
                <span aria-hidden="true">
                  {selected === option.value ? "✓" : ""}
                </span>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </span>
  );
}
