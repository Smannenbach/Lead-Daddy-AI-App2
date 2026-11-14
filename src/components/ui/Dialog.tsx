"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { btn, btnDanger, btnPrimary, input } from "@/components/ui/styles";

/** Accessible modal: Esc and the backdrop close it, focus moves inside, scroll is locked. */
export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    const first = panel.current?.querySelector<HTMLElement>("input, textarea, select, button[data-autofocus], button");
    first?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={`max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-white shadow-xl sm:rounded-xl ${wide ? "sm:max-w-2xl" : "sm:max-w-md"}`}
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-h2 font-bold text-slate-900">{title}</h2>
        </div>
        <div className="px-5 py-4 text-body text-slate-700">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-3 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>
  );
}

type Pending =
  | { kind: "confirm"; title: string; body: React.ReactNode; confirmLabel: string; danger: boolean; resolve: (v: boolean) => void }
  | { kind: "prompt"; title: string; label: string; initial: string; type: string; confirmLabel: string; resolve: (v: string | null) => void };

/**
 * In-app replacements for window.confirm / window.prompt.
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
        setPending({ kind: "prompt", title: opts.title, label: opts.label, initial: opts.initial ?? "", type: opts.type ?? "text", confirmLabel: opts.confirmLabel ?? "Save", resolve });
      }),
    [],
  );

  const close = () => {
    if (pending?.kind === "confirm") pending.resolve(false);
    if (pending?.kind === "prompt") pending.resolve(null);
    setPending(null);
  };
  const accept = () => {
    if (pending?.kind === "confirm") pending.resolve(true);
    if (pending?.kind === "prompt") pending.resolve(value.trim());
    setPending(null);
  };

  const dialogs = (
    <Dialog
      open={pending !== null}
      title={pending?.title ?? ""}
      onClose={close}
      footer={
        <>
          <button type="button" className={btn} onClick={close}>Cancel</button>
          <button
            type="button"
            className={pending?.kind === "confirm" && pending.danger ? btnDanger : btnPrimary}
            onClick={accept}
            disabled={pending?.kind === "prompt" && !value.trim()}
          >
            {pending?.confirmLabel}
          </button>
        </>
      }
    >
      {pending?.kind === "confirm" && pending.body}
      {pending?.kind === "prompt" && (
        <form onSubmit={(e) => { e.preventDefault(); if (value.trim()) accept(); }}>
          <label className="mb-1.5 block font-medium text-slate-700" htmlFor="dialog-input">{pending.label}</label>
          <input id="dialog-input" type={pending.type} value={value} onChange={(e) => setValue(e.target.value)} className={`${input} w-full`} />
        </form>
      )}
    </Dialog>
  );
  return { confirm, prompt, dialogs };
}
