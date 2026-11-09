"use client";

import { useEffect, useRef, useState } from "react";
import { STAGES, fieldValue, type CrmRecord, type FieldDef, type StageKey } from "@/lib/crm/model";
import { StageChip, StatusText, Tag, money, shortDate } from "@/components/crm/ui";

export function CellDisplay({ record, field }: { record: CrmRecord; field: FieldDef }) {
  const v = fieldValue(record, field.key);
  if (field.type === "stage") return <StageChip stage={record.stage} />;
  if (field.type === "status") return <StatusText value={String(v ?? "")} />;
  if (field.type === "tags") {
    const tags = Array.isArray(v) ? v : [];
    return tags.length ? (
      <span className="flex gap-1 whitespace-nowrap">{tags.slice(0, 2).map((t) => <Tag key={t}>{t}</Tag>)}{tags.length > 2 && <Tag>+{tags.length - 2}</Tag>}</span>
    ) : <Empty />;
  }
  if (v === null || v === "") return <Empty />;
  if (field.type === "currency") return <span className="tabular-nums">{money(Number(v))}</span>;
  if (field.type === "number") return <span className="tabular-nums">{String(v)}</span>;
  if (field.type === "date") return <span>{shortDate(String(v))}</span>;
  return <span className="truncate">{String(v)}</span>;
}

function Empty() {
  return <span className="text-neutral-700">—</span>;
}

function initialText(record: CrmRecord, field: FieldDef): string {
  const v = fieldValue(record, field.key);
  if (v === null) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (field.type === "date") return String(v).slice(0, 10);
  return String(v);
}

/**
 * Click-to-edit cell. Enter/blur saves, Escape cancels. The parent owns persistence and
 * receives the raw string; validation happens server-side (sanitizePatch) and errors bubble up.
 */
export function EditableCell({
  record,
  field,
  onSave,
}: {
  record: CrmRecord;
  field: FieldDef;
  onSave: (field: FieldDef, value: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  if (!field.editable) return <CellDisplay record={record} field={field} />;

  async function commit(value: string) {
    if (value === initialText(record, field)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const ok = await onSave(field, value);
    setSaving(false);
    if (ok) setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setDraft(initialText(record, field));
          setEditing(true);
        }}
        className="-mx-1 block w-full min-w-0 rounded px-1 py-0.5 text-left hover:bg-neutral-800/70 focus:bg-neutral-800/70 focus:outline-none"
        aria-label={`Edit ${field.label}`}
      >
        <CellDisplay record={record} field={field} />
      </button>
    );
  }

  const common = "w-full rounded border border-neutral-500 bg-neutral-900 px-1.5 py-0.5 text-sm outline-none";
  if (field.type === "stage") {
    return (
      <select
        ref={(el) => { ref.current = el; }}
        value={draft}
        disabled={saving}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => commit(e.target.value as StageKey)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
        className={common}
      >
        {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
    );
  }
  return (
    <input
      ref={(el) => { ref.current = el; }}
      value={draft}
      disabled={saving}
      type={field.type === "date" ? "date" : field.type === "number" || field.type === "currency" ? "text" : field.type === "email" ? "email" : "text"}
      inputMode={field.type === "number" || field.type === "currency" ? "decimal" : undefined}
      placeholder={field.type === "tags" ? "comma, separated" : undefined}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit(draft);
        if (e.key === "Escape") setEditing(false);
      }}
      className={common}
    />
  );
}
