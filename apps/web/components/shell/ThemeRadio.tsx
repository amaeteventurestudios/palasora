"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useThemePref } from "./HeaderControls";

/** Inline appearance control for the drawer (light / dark / system). */
export function ThemeRadio() {
  const [pref, choose] = useThemePref();
  return (
    <div className="px-3 pb-3">
      <p id="theme-lbl" className="pb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Appearance</p>
      <ToggleGroup type="single" variant="outline" value={pref} onValueChange={(v) => v && choose(v as "light" | "dark" | "system")} aria-labelledby="theme-lbl" className="w-full">
        <ToggleGroupItem value="light" aria-label="Light" className="flex-1"><Sun aria-hidden="true" />Light</ToggleGroupItem>
        <ToggleGroupItem value="dark" aria-label="Dark" className="flex-1"><Moon aria-hidden="true" />Dark</ToggleGroupItem>
        <ToggleGroupItem value="system" aria-label="System" className="flex-1"><Monitor aria-hidden="true" />Auto</ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
