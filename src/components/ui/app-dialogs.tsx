"use client";

import { useCallback, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brandCta } from "@/components/ui/styles";
import { cn } from "@/lib/utils";

type Pending =
  | { kind: "confirm"; title: string; body: React.ReactNode; confirmLabel: string; danger: boolean; resolve: (v: boolean) => void }
  | { kind: "prompt"; title: string; label: string; type: string; confirmLabel: string; resolve: (v: string | null) => void };

/**
 * In-app replacements for window.confirm / window.prompt, on shadcn AlertDialog and Dialog.
 *   const { confirm, prompt, dialogs } = useDialogs();  ...  {dialogs}
 */
export function useDialogs() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [value, setValue] = useState("");

  const confirm = useCallback(
    (opts: { title: string; body?: React.ReactNode; confirmLabel?: string; danger?: boolean }) =>
      new Promise<boolean>((resolve) =>
        setPending({ kind: "confirm", title: opts.title, body: opts.body ?? null, confirmLabel: opts.confirmLabel ?? "OK", danger: opts.danger ?? false, resolve }),
      ),
    [],
  );
  const prompt = useCallback(
    (opts: { title: string; label: string; initial?: string; type?: string; confirmLabel?: string }) =>
      new Promise<string | null>((resolve) => {
        setValue(opts.initial ?? "");
        setPending({ kind: "prompt", title: opts.title, label: opts.label, type: opts.type ?? "text", confirmLabel: opts.confirmLabel ?? "Save", resolve });
      }),
    [],
  );

  const settle = (accepted: boolean) => {
    if (pending?.kind === "confirm") pending.resolve(accepted);
    if (pending?.kind === "prompt") pending.resolve(accepted ? value.trim() : null);
    setPending(null);
  };

  const dialogs = (
    <>
      <AlertDialog open={pending?.kind === "confirm"} onOpenChange={(o) => !o && settle(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-body text-slate-600">{pending?.kind === "confirm" ? pending.body : null}</div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => settle(true)}
              className={cn(pending?.kind === "confirm" && pending.danger ? "bg-red-600 text-white hover:bg-red-700" : brandCta)}
            >
              {pending?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={pending?.kind === "prompt"} onOpenChange={(o) => !o && settle(false)}>
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (value.trim()) settle(true);
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>{pending?.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="dialog-input">{pending?.kind === "prompt" ? pending.label : ""}</Label>
              <Input id="dialog-input" type={pending?.kind === "prompt" ? pending.type : "text"} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => settle(false)}>Cancel</Button>
              <Button type="submit" className={brandCta} disabled={!value.trim()}>{pending?.kind === "prompt" ? pending.confirmLabel : ""}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
  return { confirm, prompt, dialogs };
}
