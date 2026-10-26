import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
export const reduced = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;
export function Scene({
  scene,
  children,
}: {
  scene: string;
  children: ReactNode;
}) {
  const [shown, setShown] = useState(scene),
    [phase, setPhase] = useState("draw");
  const previous = useRef(children);
  if (shown === scene) previous.current = children;
  useEffect(() => {
    if (reduced()) {
      setShown(scene);
      setPhase("steady");
      return;
    }
    if (scene === shown) {
      const t = setTimeout(() => setPhase("steady"), 1250);
      return () => clearTimeout(t);
    }
    setPhase("erase");
    const t = setTimeout(() => {
      setShown(scene);
      setPhase("draw");
    }, 280);
    return () => clearTimeout(t);
  }, [scene, shown]);
  return (
    <div className="ws-scene" data-phase={phase} aria-busy={phase === "erase"}>
      <div className="ws-scene-content" key={shown}>
        {shown === scene ? children : previous.current}
      </div>
      <div className="ws-drafting" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}
export function SlidingNav({
  selected,
  children,
}: {
  selected: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null),
    [style, setStyle] = useState<CSSProperties>({ opacity: 0 });
  useLayoutEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const update = () => {
      const item = nav.querySelector<HTMLElement>('[aria-current="page"]');
      if (!item) return;
      const navBox = nav.getBoundingClientRect(),
        itemBox = item.getBoundingClientRect();
      setStyle({
        width: item.offsetWidth,
        height: item.offsetHeight,
        transform: `translate(${itemBox.left - navBox.left + nav.scrollLeft}px,${itemBox.top - navBox.top + nav.scrollTop}px)`,
        opacity: 1,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [selected, children]);
  return (
    <nav ref={ref} className="ws-sliding-nav">
      <div className="ws-nav-highlight" style={style} aria-hidden="true" />
      {children}
    </nav>
  );
}
export function Counter({ value }: { value: number }) {
  const [shown, setShown] = useState(value),
    old = useRef(0);
  useEffect(() => {
    if (reduced()) {
      setShown(value);
      old.current = value;
      return;
    }
    let frame = 0;
    const start = performance.now(),
      from = old.current;
    const tick = (time: number) => {
      const t = Math.min((time - start) / 850, 1);
      setShown(Math.round(from + (value - from) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
      else old.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <strong aria-label={String(value)}>{shown}</strong>;
}
export function NavIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    "My Work": (
      <>
        <rect x="3" y="3" width="14" height="14" rx="1" />
        <path d="M8 3v14M8 9h9" />
      </>
    ),
    Team: (
      <>
        <circle cx="8" cy="6" r="3" />
        <path d="M2 18v-2a6 6 0 0 1 12 0v2M14 3a3 3 0 0 1 0 6M16 12a5 5 0 0 1 3 5" />
      </>
    ),
    Institutions: (
      <>
        <path d="m2 6 8-4 8 4M3 7h14M4 8v8M10 8v8M16 8v8M2 18h16" />
      </>
    ),
    Reports: (
      <>
        <path d="M3 2v16h15M7 14v-4M11 14V6M15 14V3" />
      </>
    ),
    Administration: (
      <>
        <path d="M4 5h12M4 10h12M4 15h12" />
        <circle cx="7" cy="5" r="2" fill="var(--input)" />
        <circle cx="13" cy="10" r="2" fill="var(--input)" />
        <circle cx="8" cy="15" r="2" fill="var(--input)" />
      </>
    ),
  };
  paths.Accounts = paths.Team;
  paths.Database = paths.Administration;
  paths.Email = <path d="M2 4h16v12H2zM2 5l8 6 8-6" />;
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
