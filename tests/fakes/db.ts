// In-memory stand-in for the parts of the Supabase query builder the API uses.
// It mimics the live crm_contact triggers that matter for behavior:
//   * BEFORE UPDATE sets updated_date = now() with MICROSECOND precision (set_updated_date)
//   * stage is normalized/checked like normalize_crm_contact_stage + chk_crm_contact_stage
type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

let tick = 0;
/** Postgres-style timestamptz text with 6 fractional digits, always increasing. */
export function pgNow(): string {
  tick += 1;
  const base = new Date(Date.UTC(2026, 10, 13, 2, 0, 0) + Math.floor(tick / 1000));
  const micros = String(123000 + (tick % 1000) * 7).padStart(6, "0"); // never a whole millisecond
  return base.toISOString().replace(/\.\d{3}Z$/, `.${micros}+00:00`);
}

const STAGE_OK = new Set(["Lead", "Prospect", "Application", "Underwriting", "Approved", "Closed", "Lost", "New", "Contacted", "Nurture", "Qualified", "Proposal", "Negotiation", "Won"]);
function normalizeStage(row: Row) {
  if (typeof row.stage !== "string") return;
  const v = row.stage.trim().toLowerCase();
  const cap = v.charAt(0).toUpperCase() + v.slice(1);
  row.stage = STAGE_OK.has(cap) ? cap : row.stage;
  if (!STAGE_OK.has(row.stage as string)) throw new Error('new row for relation "crm_contact" violates check constraint "chk_crm_contact_stage"');
}

function pick(row: Row, cols?: string): Row {
  if (!cols || cols.trim() === "*") return { ...row };
  const out: Row = {};
  for (const c of cols.split(",").map((s) => s.trim()).filter(Boolean)) out[c] = row[c] ?? null;
  return out;
}

type Result = { data: unknown; error: { message: string } | null };

class Query {
  private filters: Filter[] = [];
  private op: "select" | "update" | "insert" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private cols?: string;
  private returnCols?: string;
  private mode: "many" | "single" | "maybe" = "many";
  private limitN?: number;
  constructor(private db: FakeDb, private table: string) {}
  select(cols?: string) { if (this.op === "select") this.cols = cols; else this.returnCols = cols ?? "*"; return this; }
  update(p: Row) { this.op = "update"; this.payload = p; return this; }
  insert(p: Row | Row[]) { this.op = "insert"; this.payload = p; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => String(r[c]) === String(v)); return this; }
  neq(c: string, v: unknown) { this.filters.push((r) => String(r[c]) !== String(v)); return this; }
  is(c: string, v: unknown) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  not(c: string, _op: string, v: unknown) { this.filters.push((r) => (r[c] ?? null) !== v); return this; }
  in(c: string, vs: unknown[]) { const s = new Set(vs.map(String)); this.filters.push((r) => s.has(String(r[c]))); return this; }
  ilike(c: string, pat: string) { const re = new RegExp("^" + pat.replace(/%/g, ".*") + "$", "i"); this.filters.push((r) => re.test(String(r[c] ?? ""))); return this; }
  order() { return this; }
  limit(n: number) { this.limitN = n; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  then(ok?: (v: Result) => unknown, bad?: (e: unknown) => unknown) {
    return Promise.resolve().then(() => this.run()).then(ok, bad);
  }
  private run(): { data: unknown; error: { message: string } | null } {
    const rows = this.db.table(this.table);
    const match = rows.filter((r) => this.filters.every((f) => f(r)));
    try {
      let out: Row[];
      if (this.op === "select") out = match.slice(0, this.limitN ?? match.length).map((r) => pick(r, this.cols));
      else if (this.op === "insert") {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
        out = list.map((p) => {
          const row: Row = { id: crypto.randomUUID(), created_date: pgNow(), updated_date: pgNow(), deleted_at: null, ...p };
          if (this.table === "crm_contact") { normalizeStage(row); row.updated_date = pgNow(); }
          rows.push(row);
          return pick(row, this.returnCols);
        });
      } else if (this.op === "update") {
        out = match.map((r) => {
          const next = { ...r, ...(this.payload as Row) };
          if (this.table === "crm_contact") { normalizeStage(next); next.updated_date = pgNow(); }
          Object.assign(r, next);
          return pick(r, this.returnCols);
        });
      } else {
        for (const r of match) rows.splice(rows.indexOf(r), 1);
        out = match.map((r) => pick(r, this.returnCols));
      }
      this.db.log.push({ table: this.table, op: this.op, count: out.length });
      if (this.mode === "single") return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { message: "not exactly one row" } };
      if (this.mode === "maybe") return { data: out[0] ?? null, error: null };
      return { data: this.op === "select" || this.returnCols ? out : null, error: null };
    } catch (e) {
      return { data: null, error: { message: (e as Error).message } };
    }
  }
}

export class FakeDb {
  tables: Record<string, Row[]> = {};
  log: Array<{ table: string; op: string; count: number }> = [];
  table(name: string): Row[] { return (this.tables[name] ??= []); }
  from(name: string) { return new Query(this, name); }
  seed(name: string, row: Row): Row {
    const r = { id: crypto.randomUUID(), created_date: pgNow(), updated_date: pgNow(), deleted_at: null, ...row };
    this.table(name).push(r);
    return r;
  }
}
