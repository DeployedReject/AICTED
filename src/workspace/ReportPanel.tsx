import { useEffect, useRef, useState, type ReactNode } from "react";
/** Draw actual chart marks once, when the tile becomes visible or receives focus. */
export default function ReportPanel({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null),
    [drawn, setDrawn] = useState(false);
  useEffect(() => {
    if (drawn) return;
    if (
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    ) {
      setDrawn(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries.some(
            (entry) => entry.isIntersecting && entry.intersectionRatio >= 0.2,
          )
        ) {
          setDrawn(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [drawn]);
  return (
    <section
      ref={ref}
      className={"ws-chart " + className}
      data-drawn={drawn}
      onFocusCapture={() => setDrawn(true)}
    >
      <header>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
}

export function usePlotSize(initialWidth: number, initialHeight: number) {
  const ref = useRef<SVGSVGElement>(null),
    [size, setSize] = useState({ width: initialWidth, height: initialHeight });
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(240, Math.round(entry.contentRect.width)),
        height = Math.max(150, Math.round(entry.contentRect.height));
      setSize((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return { ref, ...size };
}
