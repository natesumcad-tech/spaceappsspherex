"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ES, ES_PHRASES } from "./es";
import { ES_OBJECTS } from "./es-objects";

/**
 * Languages for the Sky Explorer. Text is written in English in the code and looked up here by that
 * same English text, so anything not translated yet simply stays in English.
 */
export type Lang = "en" | "es";
export const LANGS: { id: Lang; label: string; short: string }[] = [
  { id: "en", label: "English", short: "EN" },
  { id: "es", label: "Español", short: "ES" },
];
const DICTS: Record<Lang, Record<string, string>> = { en: {}, es: { ...ES_OBJECTS, ...ES } };
const STORE = "ui.lang";

/** More entries known only at run time (e.g. star and constellation names from the sky catalogue). */
export function addTranslations(lang: Lang, entries: Record<string, string>) {
  if (lang === "en") return;
  for (const [k, v] of Object.entries(entries)) if (v && !(k in DICTS[lang])) DICTS[lang][k] = v;
}

/** Text built from a template (the generated 360° views for any star or constellation). */
const PATTERNS: Record<Lang, [RegExp, (m: RegExpMatchArray, t: (s: string) => string) => string][]> = {
  en: [],
  es: [
    [/^(.+) is one of the 88 constellations astronomers use to divide up the sky\. The highlighted lines join its brightest stars into its traditional figure\.$/,
      (m, t) => `${t(m[1])} es una de las 88 constelaciones en que los astrónomos dividen el cielo. Las líneas resaltadas unen sus estrellas más brillantes formando su figura tradicional.`],
    [/^Behind the lines is SPHEREx's own picture of (.+): every star, dust cloud and galaxy here was measured in 102 infrared colors\.$/,
      (m, t) => `Detrás de las líneas está la propia imagen de SPHEREx de ${t(m[1])}: cada estrella, nube de polvo y galaxia de aquí se midió en 102 colores infrarrojos.`],
    [/^Star in (.+) · magnitude ([\d.−-]+)$/, (m, t) => `Estrella de ${t(m[1])} · magnitud ${m[2].replace(".", ",")}`],
    [/^magnitude ([\d.−-]+)$/, (m) => `magnitud ${m[1].replace(".", ",")}`],
    [/^(.+) is (a [^,]+(?:, like the Sun)?) and one of the brightest stars in the night sky, in the constellation (.+)\. Its color comes from the temperature of its surface\.$/,
      (m, t) => `${t(m[1])} es ${t(m[2])} y una de las estrellas más brillantes del cielo nocturno, en la constelación ${t(m[3])}. Su color se debe a la temperatura de su superficie.`],
    [/^(A|An) (.+), about ([\d,]+) light-years away, shining at magnitude ([\d.−-]+)\. Orbit or fly away to see how far it sits from its neighbors\.$/,
      (m, t) => `${cap(t(`${m[1].toLowerCase()} ${m[2]}`))}, a unos ${m[3].replace(/,/g, ".")} años luz, con magnitud ${m[4].replace(".", ",")}. Orbita o aléjate volando para ver lo lejos que está de sus vecinas.`],
    [/^(A|An) (.+), shining at magnitude ([\d.−-]+)\. Orbit or fly away to see how far it sits from its neighbors\.$/,
      (m, t) => `${cap(t(`${m[1].toLowerCase()} ${m[2]}`))}, con magnitud ${m[3].replace(".", ",")}. Orbita o aléjate volando para ver lo lejos que está de sus vecinas.`],
  ],
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
function fromPattern(lang: Lang, text: string): string | undefined {
  for (const [re, fn] of PATTERNS[lang]) {
    const m = text.match(re);
    if (m) return fn(m, (s) => DICTS[lang][s] ?? s);
  }
}

export type Vars = Record<string, string | number>;
/** Translate `text` (with {placeholders} filled from `vars`). */
export function translate(lang: Lang, text: string, vars?: Vars) {
  let out = DICTS[lang][text] ?? fromPattern(lang, text) ?? text;
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
