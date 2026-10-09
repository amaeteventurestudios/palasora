"use client";
import { createContext, useContext } from "react";
import { MESSAGES, translator, type UiLocale } from "./messages";

const Ctx = createContext<UiLocale>("en");
export function I18nProvider({ locale, children }: { locale: UiLocale; children: React.ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}
export function useT() { return translator(useContext(Ctx)); }
export function useLocale() { return useContext(Ctx); }
void MESSAGES;
