"use client";
import { createContext, useContext } from "react";
import { MESSAGES, translator, type UiLocale } from "./messages";

const Ctx = createContext<UiLocale>("en");
// v1.5: the edition being viewed, so client islands (SSE, Exchange, maps) bind to the same country as the server render.
const EdCtx = createContext<string>("ALL");
export function I18nProvider({ locale, edition = "ALL", children }: { locale: UiLocale; edition?: string; children: React.ReactNode }) {
  return <Ctx.Provider value={locale}><EdCtx.Provider value={edition}>{children}</EdCtx.Provider></Ctx.Provider>;
}
export function useEdition() { return useContext(EdCtx); }
export function useT() { return translator(useContext(Ctx)); }
export function useLocale() { return useContext(Ctx); }
void MESSAGES;
