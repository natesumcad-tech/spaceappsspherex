"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ES, ES_PHRASES } from "./es";

/**
 * Languages for the Sky Explorer. Text is written in English in the code and looked up here by that
 * same English text, so anything not translated yet simply stays in English.
 */
export type Lang = "en" | "es";
export const LANGS: { id: Lang; label: string; short: string }[] = [
  { id: "en", label: "English", short: "EN" },
  { id: "es", label: "Español", short: "ES" },
];
const DICTS: Record<Lang, Record<string, string>> = { en: {}, es: ES };
const STORE = "ui.lang";

export type Vars = Record<string, string | number>;
/** Translate `text` (with {placeholders} filled from `vars`). */
export function translate(lang: Lang, text: string, vars?: Vars) {
  let out = DICTS[lang][text] ?? text;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

/** Like translate(), but also handles computed text (distances, times…) phrase by phrase. */
export function translateValue(lang: Lang, text: string) {
  const exact = DICTS[lang][text];
  if (exact !== undefined || lang === "en") return exact ?? text;
  let out = text;
  for (const [re, to] of ES_PHRASES) out = out.replace(re, to);
  return out;
}

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "en", setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    // ?lang=es in a shared link, then a saved choice, then the browser's language
    let l: string | null = new URL(window.location.href).searchParams.get("lang");
    try {
      l ??= localStorage.getItem(STORE);
    } catch {}
    l ??= navigator.language?.slice(0, 2);
    if (l === "es") setLangState("es");
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORE, l);
    } catch {}
  }, []);
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);
export function useT() {
  const { lang } = useContext(Ctx);
  return useCallback((text: string, vars?: Vars) => translate(lang, text, vars), [lang]);
}
/** For computed text: exact translation if there is one, otherwise phrase by phrase. */
export function useTV() {
  const { lang } = useContext(Ctx);
  return useCallback((text: string) => translateValue(lang, text), [lang]);
}

/** EN | ES switch. */
export function LangSwitch({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLang();
  return (
    <div className={`lang-switch ${className}`} role="group" aria-label="Language / Idioma">
      {LANGS.map((l) => (
        <button key={l.id} type="button" lang={l.id} aria-pressed={lang === l.id} title={l.label} onClick={() => setLang(l.id)}>
          {l.short}
        </button>
      ))}
    </div>
  );
}
