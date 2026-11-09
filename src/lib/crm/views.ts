// Saved views persist per browser (localStorage). They are a per-user convenience, not
// shared state — the live schema has no views table and we never run DDL against it.
// Every storage access is wrapped: private windows / blocked storage must not break the page.
import { DEFAULT_VIEW, PRESET_VIEWS, type ViewState } from "@/lib/crm/model";

const KEY = "ld.crm.views.v1";
const ACTIVE = "ld.crm.activeView.v1";

function isView(v: unknown): v is ViewState {
  const x = v as ViewState;
  return !!x && typeof x.id === "string" && typeof x.name === "string" && (x.mode === "table" || x.mode === "kanban") &&
    Array.isArray(x.filters) && Array.isArray(x.sort) && Array.isArray(x.hidden) && typeof x.search === "string";
}

export function loadSavedViews(): ViewState[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter(isView).slice(0, 50) : [];
  } catch {
    return [];
  }
}

export function storeSavedViews(views: ViewState[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(views.slice(0, 50)));
  } catch {
    /* storage unavailable — views live for this session only */
  }
}

export function loadActiveViewId(): string {
  try {
    return window.localStorage.getItem(ACTIVE) ?? DEFAULT_VIEW.id;
  } catch {
    return DEFAULT_VIEW.id;
  }
}

export function storeActiveViewId(id: string): void {
  try {
    window.localStorage.setItem(ACTIVE, id);
  } catch {
    /* ignore */
  }
}

export function allViews(saved: ViewState[]): ViewState[] {
  return [...PRESET_VIEWS, ...saved];
}

export function isPreset(id: string): boolean {
  return PRESET_VIEWS.some((v) => v.id === id);
}

export function newViewId(): string {
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
