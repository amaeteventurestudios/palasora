"use client";
// ISSUE-06 shared contextual help: a "?" button that opens a short plain-English explanation in three parts, written for
// a ninth-grade reader: what it is, why it matters, what you can do. Keyboard and touch friendly (Radix popover).
import { CircleHelp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function HelpTip({ label, what, why, todo }: { label: string; what: React.ReactNode; why?: React.ReactNode; todo?: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex size-6 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`What is ${label}?`} data-testid="help-tip"><CircleHelp className="size-4" aria-hidden="true" /></button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] space-y-2 text-sm leading-relaxed" data-testid="help-tip-body">
        <p className="font-semibold">{label}</p>
        <p><span className="font-semibold">What it is: </span>{what}</p>
        {why && <p><span className="font-semibold">Why it matters: </span>{why}</p>}
        {todo && <p><span className="font-semibold">What you can do: </span>{todo}</p>}
      </PopoverContent>
    </Popover>
  );
}
