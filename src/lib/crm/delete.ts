// Delete, bulk delete, merge duplicates and privacy purge for leads; delete for notes
// and campaigns. Server only: callers must pass requireUser() first.
//
// Soft delete everywhere (the repo already uses crm_contact.deleted_at), except the
// privacy purge, which really removes the person's data. Every action writes an audit
// row to lead_event, and soft deletes also add an Activity entry on the lead.
import { organizationId } from "@/lib/supabase/org";
import { createServiceClient } from "@/lib/supabase/server";
import { appendTimeline, timelineEntryId, type TimelineEntry } from "@/lib/crm/model";
import { readAudience } from "@/lib/campaigns/recipients";

type Db = ReturnType<typeof createServiceClient>;
type Row = Record<string, unknown>;

export async function audit(db: Db, eventType: string, detail: string, data: Row): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await db.from("lead_event").insert({
    event_type: eventType,
    detail,
    data: data as never,
    organization_id: organizationId(),
    created_date: now,
    updated_date: now,
  });
  if (error) console.error("[audit] lead_event insert failed", error.message);
}

/** Drops lead ids from every campaign's recipient list (drafts and live). */
async function removeFromCampaigns(db: Db, leadIds: string[], replaceWith?: string): Promise<number> {
  const { data } = await db.from("marketing_campaign").select("id, target_audience").eq("organization_id", organizationId());
  let touched = 0;
  const drop = new Set(leadIds);
  for (const c of (data ?? []) as Row[]) {
    const ta = (c.target_audience && typeof c.target_audience === "object" ? c.target_audience : {}) as Row;
    const ids = readAudience(ta).leadIds;
    if (!ids.some((id) => drop.has(id))) continue;
    let next = ids.filter((id) => !drop.has(id));
    if (replaceWith && !next.includes(replaceWith)) next = [...next, replaceWith];
    await db.from("marketing_campaign").update({ target_audience: { ...ta, leadIds: next } as never }).eq("id", c.id as string);
    touched += 1;
  }
  return touched;
}

export interface DeleteResult {
  deleted: string[];
  notFound: string[];
}

export async function softDeleteLeads(ids: string[], actor: string | null, db: Db = createServiceClient()): Promise<DeleteResult> {
  const orgId = organizationId();
  const { data } = await db
    .from("crm_contact")
    .select("id, engagement_history")
    .eq("organization_id", orgId)
    .in("id", ids)
    .is("deleted_at", null);
  const found = (data ?? []) as Row[];
  const now = new Date().toISOString();
  for (const row of found) {
    const entry: TimelineEntry = { type: "system", at: now, by: actor, detail: "Lead deleted" };
    await db
      .from("crm_contact")
      .update({ deleted_at: now, engagement_history: appendTimeline(row.engagement_history, [entry]) as never })
      .eq("id", row.id as string)
      .eq("organization_id", orgId);
  }
  const deleted = found.map((r) => r.id as string);
  if (deleted.length > 0) {
    await removeFromCampaigns(db, deleted);
    await audit(db, "lead_deleted", `${deleted.length} lead(s) deleted`, { leadIds: deleted, by: actor });
  }
  return { deleted, notFound: ids.filter((id) => !deleted.includes(id)) };
}

const MERGE_COLUMNS = ["first_name", "last_name", "company", "job_title", "email", "phone", "lead_source", "assigned_to", "next_follow_up", "lead_score", "estimated_value", "notes"] as const;

/**
 * Merges duplicates INTO the primary lead: the primary keeps its values, empty
 * primary fields are filled from the duplicates (in the order given), tags and
 * custom fields are combined (primary wins), Activity is combined, and campaigns
 * that listed a duplicate now list the primary. Duplicates are soft deleted with
 * merged_into set. Consent is never copied between people: the primary keeps its own.
 */
export async function mergeLeads(primaryId: string, duplicateIds: string[], actor: string | null, db: Db = createServiceClient()) {
  const orgId = organizationId();
  const all = [primaryId, ...duplicateIds.filter((d) => d !== primaryId)];
  const { data } = await db.from("crm_contact").select("*").eq("organization_id", orgId).in("id", all).is("deleted_at", null);
  const rows = (data ?? []) as Row[];
  const primary = rows.find((r) => r.id === primaryId);
  const dups = duplicateIds.map((id) => rows.find((r) => r.id === id)).filter((r): r is Row => Boolean(r) && r!.id !== primaryId);
  if (!primary) return { ok: false as const, status: 404, code: "not_found", error: "The lead to keep no longer exists." };
  if (dups.length === 0) return { ok: false as const, status: 400, code: "nothing_to_merge", error: "Pick at least one other lead to merge in." };

  const now = new Date().toISOString();
  const update: Row = {};
  for (const col of MERGE_COLUMNS) {
    if (primary[col] !== null && primary[col] !== undefined && primary[col] !== "") continue;
    const donor = dups.find((d) => d[col] !== null && d[col] !== undefined && d[col] !== "");
    if (donor) update[col] = donor[col];
  }
  const tags = new Set<string>();
  for (const r of [primary, ...dups]) if (Array.isArray(r.tags)) for (const t of r.tags) if (typeof t === "string") tags.add(t);
  update.tags = [...tags].slice(0, 25);

  const pcf = (primary.custom_fields ?? {}) as Row;
  const crmFields: Row = {};
  const labels: Row = {};
  for (const r of [...dups].reverse().concat(primary)) {
    const cf = (r.custom_fields ?? {}) as Row;
    Object.assign(crmFields, (cf.crm_fields ?? {}) as Row);
    Object.assign(labels, (cf.crm_field_labels ?? {}) as Row);
  }
  update.custom_fields = { ...pcf, crm_fields: crmFields, crm_field_labels: labels, merged_from: [...((pcf.merged_from as string[]) ?? []), ...dups.map((d) => d.id)] };

  const history = [primary, ...dups].flatMap((r) => (Array.isArray(r.engagement_history) ? r.engagement_history : []));
  const seen = new Set<string>();
  const combined = history
    .filter((e) => {
      const id = timelineEntryId(e);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((a, b) => String((a as Row).at ?? (a as Row).date ?? "").localeCompare(String((b as Row).at ?? (b as Row).date ?? "")));
  const name = (r: Row) => [r.first_name, r.last_name].filter(Boolean).join(" ") || (r.email as string) || "a lead";
  update.engagement_history = appendTimeline(combined, [{ type: "system", at: now, by: actor, detail: `Merged in ${dups.map(name).join(", ")}` }]);

  const { error } = await db.from("crm_contact").update(update as never).eq("id", primaryId).eq("organization_id", orgId);
  if (error) return { ok: false as const, status: 500, code: "server_error", error: "The merge didn't save. Try again." };

  for (const d of dups) {
    const cf = (d.custom_fields ?? {}) as Row;
    await db
      .from("crm_contact")
      .update({
        deleted_at: now,
        custom_fields: { ...cf, merged_into: primaryId } as never,
        engagement_history: appendTimeline(d.engagement_history, [{ type: "system", at: now, by: actor, detail: `Merged into ${name(primary)}` }]) as never,
      })
      .eq("id", d.id as string)
      .eq("organization_id", orgId);
  }
  await removeFromCampaigns(db, dups.map((d) => d.id as string), primaryId);
  await audit(db, "lead_merged", `Merged ${dups.length} duplicate(s) into one lead`, { primaryId, mergedIds: dups.map((d) => d.id), by: actor });
  return { ok: true as const, primaryId, merged: dups.map((d) => d.id as string) };
}

/**
 * Privacy deletion request: removes the person for real. Deletes the crm_contact row,
 * their verification rows, form submissions (unified_lead) and campaign references.
 * The audit row keeps no personal data, only the lead id and who ran it.
 * Not covered: copies already sent to email/SMS providers, AI logs, backups.
 */
export async function purgeLead(id: string, actor: string | null, db: Db = createServiceClient()) {
  const orgId = organizationId();
  const { data: row } = await db.from("crm_contact").select("id, email, phone").eq("organization_id", orgId).eq("id", id).maybeSingle();
  if (!row) return { ok: false as const };
  const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
  const phone = typeof row.phone === "string" ? row.phone.trim() : "";
  const removed: Row = {};
  if (email) {
    removed.email_verification = (await db.from("email_verification").delete().eq("organization_id", orgId).eq("email", email).select("id")).data?.length ?? 0;
    removed.unified_lead_by_email = (await db.from("unified_lead").delete().eq("organization_id", orgId).eq("email", email).select("id")).data?.length ?? 0;
  }
  if (phone) {
    removed.phone_verification = (await db.from("phone_verification").delete().eq("organization_id", orgId).eq("phone_number", phone).select("id")).data?.length ?? 0;
    removed.unified_lead_by_phone = (await db.from("unified_lead").delete().eq("organization_id", orgId).eq("phone", phone).select("id")).data?.length ?? 0;
  }
  removed.campaigns = await removeFromCampaigns(db, [id]);
  await db.from("crm_contact").delete().eq("organization_id", orgId).eq("id", id);
  await audit(db, "lead_purged", "Lead permanently deleted on a privacy request", { leadId: id, by: actor, removed });
  return { ok: true as const, removed };
}

export async function deleteNote(leadId: string, noteId: string, actor: string | null, db: Db = createServiceClient()) {
  const orgId = organizationId();
  const { data: row } = await db.from("crm_contact").select("id, engagement_history").eq("organization_id", orgId).eq("id", leadId).is("deleted_at", null).maybeSingle();
  if (!row) return { ok: false as const, status: 404, code: "not_found", error: "Lead not found." };
  const history = Array.isArray(row.engagement_history) ? (row.engagement_history as unknown[]) : [];
  const idx = history.findIndex((e) => timelineEntryId(e) === noteId);
  if (idx < 0) return { ok: false as const, status: 404, code: "not_found", error: "That note is already gone." };
  const entry = history[idx] as Row;
  const type = String(entry.type ?? "");
  if (type !== "note" && !type.includes("note")) return { ok: false as const, status: 400, code: "not_a_note", error: "Only notes can be deleted. System Activity is kept." };
  const now = new Date().toISOString();
  const next = [...history.slice(0, idx), ...history.slice(idx + 1)];
  await db
    .from("crm_contact")
    .update({ engagement_history: appendTimeline(next, [{ type: "system", at: now, by: actor, detail: "A note was deleted" }]) as never })
    .eq("id", leadId)
    .eq("organization_id", orgId);
  await audit(db, "note_deleted", "Note deleted from a lead", { leadId, noteId, by: actor });
  return { ok: true as const };
}

export async function softDeleteCampaign(id: string, actor: string | null, db: Db = createServiceClient()) {
  const orgId = organizationId();
  const { data: c } = await db.from("marketing_campaign").select("id, name, status, target_audience").eq("organization_id", orgId).eq("id", id).maybeSingle();
  if (!c || readAudience(c.target_audience).deletedAt) return { ok: false as const };
  const now = new Date().toISOString();
  const ta = (c.target_audience && typeof c.target_audience === "object" ? c.target_audience : {}) as Row;
  // status 'deleted' also stops the cron runner, which only advances 'live' campaigns.
  await db
    .from("marketing_campaign")
    .update({ status: "deleted", updated_date: now, target_audience: { ...ta, deleted_at: now, status_before_delete: c.status } as never })
    .eq("id", id)
    .eq("organization_id", orgId);
  await audit(db, "campaign_deleted", "Campaign deleted", { campaignId: id, previousStatus: c.status, by: actor });
  return { ok: true as const };
}
