"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useT, useTV } from "@/lib/i18n";

export type SearchItem = { id: string; name: string; kind: "Star" | "Constellation" | "Planet" | "Place" | "Your waypoint"; sub: string; alt: string[] };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\u0080-￿]+/g, " ").trim();

/** Magnifying-glass search: find stars, constellations, planets and places, then fly there. */
export default function Search({ items, onPick }: { items: SearchItem[]; onPick: (it: SearchItem) => void }) {
  const t = useT();
  const tv = useTV();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  // Ctrl/Cmd+K opens it from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (open) setTimeout(() => field.current?.focus(), 30);
    else setQ("");
  }, [open]);
  // Click outside closes it
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const results = useMemo(() => {
    const n = norm(q);
    if (!n) return [];
    const scored: [number, SearchItem][] = [];
    for (const it of items) {
      let best = Infinity;
      for (const [k, name] of [it.name, ...it.alt].entries()) {
        const m = norm(name);
        const score = m === n ? 0 : m.startsWith(n) ? 1 : m.split(" ").some((w) => w.startsWith(n)) ? 2 : m.includes(n) ? 3 : Infinity;
        best = Math.min(best, score + (k ? 0.5 : 0));
      }
      if (best < Infinity) scored.push([best + (it.kind === "Star" ? 0.1 : 0), it]);
    }
    return scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).slice(0, 8).map(([, it]) => it);
  }, [q, items]);
  useEffect(() => setSel(0), [q]);

  const pick = (it: SearchItem) => {
    setOpen(false);
    onPick(it);
  };

  return (
    <div ref={wrap} className={`mv-search ${open ? "open" : ""}`}>
      <button className="mv-glass mv-search-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={t("Search stars, constellations and planets")} title={t("Search (Ctrl+K)")}>
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M15.5 15.5L21 21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="mv-glass mv-search-panel" role="dialog" aria-label={t("Search")}>
          <input
            ref={field}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(s + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(s - 1, 0));
              } else if (e.key === "Enter" && results[sel]) pick(results[sel]);
              else if (e.key === "Escape") {
                e.stopPropagation();
                setOpen(false);
              }
            }}
            placeholder={t("Find a star, constellation or planet…")}
            aria-label={t("Search the sky")}
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="mv-search-results"
          />
          {q && (
            <ul id="mv-search-results" role="listbox">
              {results.length ? (
                results.map((it, i) => (
                  <li key={`${it.kind}-${it.id}`} role="option" aria-selected={i === sel}>
                    <button onMouseEnter={() => setSel(i)} onClick={() => pick(it)}>
                      <span className={`mv-search-kind k-${it.kind === "Your waypoint" ? "mine" : it.kind.toLowerCase()}`}>{t(it.kind)}</span>
                      <span className="mv-search-name">{t(it.name)}</span>
                      <span className="mv-search-sub">{tv(it.sub ?? "")}</span>
                    </button>
                  </li>
                ))
              ) : (
                <li className="mv-search-empty">{t("Nothing called “{q}” on the map. Try the ✦ Ask guide.", { q })}</li>
              )}
            </ul>
          )}
          {!q && <p className="mv-search-hint">{t("Try “Sirius”, “Orion”, “Saturn” or “Andromeda”. ↑↓ to choose, Enter to fly there.")}</p>}
        </div>
      )}
    </div>
  );
}
