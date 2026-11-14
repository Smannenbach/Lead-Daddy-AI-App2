// Lead Daddy design system (light slate + indigo). Matches the shadcn/ui specs used in the
// main app: Button h-9 px-4 rounded-md, Input h-9 px-3, Card rounded-xl, Badge px-2.5.
// Brand indigo is passed explicitly (shadcn's own primary is near-black).

const control = "inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 text-body font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0";

export const btn = `${control} border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-indigo-200 hover:text-indigo-600`;
export const btnPrimary = `${control} bg-indigo-600 text-white shadow hover:bg-indigo-700`;
export const btnDanger = `${control} border border-red-200 bg-white text-red-600 shadow-sm hover:bg-red-50 hover:text-red-700`;
export const btnGhost = `${control} text-slate-600 hover:bg-slate-100 hover:text-slate-900`;
export const btnSm = "h-8 px-3 text-caption";

export const input =
  "h-9 rounded-md border border-slate-200 bg-white px-3 text-body text-slate-900 shadow-sm outline-none placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/40 disabled:pointer-events-none disabled:opacity-50";
export const textarea =
  "rounded-md border border-slate-200 bg-white px-3 py-2 text-body text-slate-900 shadow-sm outline-none placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/40";

export const card = "rounded-xl border border-slate-200 bg-white shadow";
export const cardHeader = "flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3";
export const h2 = "text-h2 font-bold text-slate-900";
export const muted = "text-body text-slate-600";
export const meta = "text-caption text-slate-500";

export const badge = "inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-caption font-semibold";
export const badgeBrand = `${badge} bg-indigo-100 text-indigo-800`;
export const badgeSuccess = `${badge} bg-emerald-100 text-emerald-800`;
export const badgeWarning = `${badge} bg-amber-100 text-amber-900`;
export const badgeDanger = `${badge} bg-red-50 text-red-700`;
export const badgeNeutral = `${badge} bg-slate-100 text-slate-700`;

const result = "mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-body [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0";
export const resultOk = `${result} bg-emerald-100 text-emerald-800`;
export const resultErr = `${result} bg-red-50 text-red-700`;
export const resultWarn = `${result} bg-amber-100 text-amber-900`;
export const resultInfo = `${result} bg-slate-100 text-slate-700`;
