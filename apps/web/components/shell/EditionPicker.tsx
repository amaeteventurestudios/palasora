"use client";
// Country edition picker (v1.5; unified master §1, appendix 4 §2.3). Choosing a country VIEWS that edition for this
// browsing session; "Save as my home edition" also persists it (account for owners, first-party cookie for guests).
// Built on shadcn Popover + Command so all 54 countries are searchable by keyboard.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Home } from "lucide-react";
import { setPreferences } from "@/app/actions/prefs";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type EditionOption = { code: string; name: string; flag: string; region: string };

export function EditionPicker({ edition, home, options, signedIn, compact = false }: { edition: string; home: string; options: EditionOption[]; signedIn: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [save, setSave] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  const current = options.find((o) => o.code === edition) ?? options[0];
  const homeOpt = options.find((o) => o.code === home);
  const regions = [...new Set(options.filter((o) => o.code !== "ALL").map((o) => o.region))];
  const choose = (code: string) => {
    const f = new FormData();
    f.set("edition", code); f.set("js", "1");
    if (save) f.set("save_home", "1");
    start(async () => {
      const r = await setPreferences({ ok: false, message: "" }, f);
      if (!r.ok) { setError(r.message); return; }
      setError(""); setOpen(false);
      // Drop any ?edition= in the URL so the new choice is not overridden, then re-render on the server.
      const u = new URL(window.location.href); u.searchParams.delete("edition"); u.searchParams.delete("cursor");
      router.replace(u.pathname + (u.search ? u.search : "")); router.refresh();
    });
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size={compact ? "icon" : "default"} data-testid="edition-menu" aria-label={`Country edition: ${current.name}. Change`}
          className={cn("h-10 gap-1.5 border border-white/25 px-2 text-[13px] font-semibold text-white hover:bg-white/10 hover:text-white", compact && "w-auto px-2")}>
          <span aria-hidden="true" className="text-base leading-none">{current.flag}</span>
          <span className={cn("max-w-[120px] truncate", compact && "sr-only md:not-sr-only")}>{current.name}</span>
          <ChevronsUpDown className="hidden size-3.5 opacity-70 md:block" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(320px,calc(100vw-24px))] p-0" data-testid="edition-panel">
        <Command>
          <CommandInput placeholder="Search 54 countries…" aria-label="Search countries" />
          <CommandList className="max-h-[50vh]">
            <CommandEmpty>No country matches.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="All Africa" onSelect={() => choose("ALL")} disabled={pending} data-testid="edition-opt-ALL">
                <span aria-hidden="true">🌍</span>All Africa<span className="ms-auto text-xs text-muted-foreground">continental</span>
                {edition === "ALL" && <Check className="size-4" aria-hidden="true" />}
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            {regions.map((r) => (
              <CommandGroup key={r} heading={r}>
                {options.filter((o) => o.region === r).map((o) => (
                  <CommandItem key={o.code} value={`${o.name} ${o.code}`} onSelect={() => choose(o.code)} disabled={pending} data-testid={`edition-opt-${o.code}`}>
                    <span aria-hidden="true">{o.flag}</span>{o.name}
                    {o.code === home && <Home className="ms-auto size-3.5 text-muted-foreground" aria-label="home edition" />}
                    {edition === o.code && <Check className={cn("size-4", o.code !== home && "ms-auto")} aria-hidden="true" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
        <div className="border-t p-3">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="ed-save" className="text-sm font-medium">Save as my home edition</Label>
            <Switch id="ed-save" checked={save} onCheckedChange={setSave} data-testid="edition-save" />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Home: {homeOpt ? `${homeOpt.flag} ${homeOpt.name}` : "🌍 All Africa"}. {signedIn ? "Saved to your account." : "Saved in this browser."} Viewing another country never changes your home edition, languages, agents or portfolio.
          </p>
          {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
