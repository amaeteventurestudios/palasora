"use client";
// Privileged operator action with an explicit confirmation step (docs/specs/25 A04 "kill-switch double-confirmation").
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionState } from "@/app/actions/member";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export function ConfirmAction({ action, fields, label, title, body, destructive = false, size = "sm", testid }: { action: (s: ActionState, f: FormData) => Promise<ActionState>;
  fields: Record<string, string>; label: string; title: string; body: string; destructive?: boolean; size?: "sm" | "default"; testid?: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const run = () => start(async () => {
    const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v);
    const r = await action({ ok: false, message: "" }, f);
    (r.ok ? toast.success : toast.error)(r.message);
    setOpen(false);
  });
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild><Button size={size} variant={destructive ? "destructive" : "outline"} disabled={pending} data-testid={testid}>{pending ? "Working…" : label}</Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{body}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={(e) => { e.preventDefault(); run(); }} className={destructive ? "bg-destructive text-white hover:bg-destructive/90" : ""}>Confirm</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
