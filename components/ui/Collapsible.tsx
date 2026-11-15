"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * A panel that folds down to its header. The header (title, plus an optional summary shown while
 * folded) stays visible; the chevron toggles the body. The choice is remembered in this browser.
 */
export default function Collapsible({
  id,
  title,
  summary,
  className = "",
  defaultOpen = true,
  closedOnSmall = false,
  children,
}: {
  id: string;
  title: ReactNode;
  summary?: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  /** Start folded on phone-sized screens (unless the visitor opened it before). */
  closedOnSmall?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    try {
      const v = localStorage.getItem(`ui.open.${id}`);
      if (v) setOpen(v === "1");
      else if (closedOnSmall && window.innerWidth < 760) setOpen(false);
    } catch {
      /* storage unavailable */
    }
  }, [id, closedOnSmall]);
  const toggle = () =>
    setOpen((o) => {
      try {
        localStorage.setItem(`ui.open.${id}`, o ? "0" : "1");
      } catch {
        /* storage unavailable */
      }
      return !o;
    });
  return (
    <section className={`cl ${open ? "open" : "closed"} ${className}`}>
      <div className="cl-head">
        <div className="cl-title" onClick={toggle}>
          {title}
          {!open && summary && <span className="cl-summary">{summary}</span>}
        </div>
        <button type="button" className="cl-toggle" onClick={toggle} aria-expanded={open} aria-label={open ? "Collapse panel" : "Expand panel"}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div className="cl-body" inert={!open}>
        <div className="cl-inner">{children}</div>
      </div>
    </section>
  );
}
