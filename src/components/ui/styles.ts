// Brand and status classes layered on the shadcn/ui components.
// shadcn's own `primary` is near-black, so brand CTAs pass these indigo classes explicitly
// (design system rule). Status colors: text that passes 4.5:1, always with a word or icon.

/** Indigo primary CTA: <Button className={brandCta}>. */
export const brandCta = "bg-indigo-600 text-white shadow hover:bg-indigo-700";
/** Header and toolbar outline buttons: indigo text and border on hover. */
export const headerBtn = "hover:border-indigo-200 hover:bg-white hover:text-indigo-600";
/** Destructive outline (Sign Out, Delete): red-50 fill, red-700 text on hover. */
export const dangerOutline = "border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700";

export const card = "rounded-xl"; // shadcn Card already carries border + shadow
export const h2 = "text-h2 font-bold text-slate-900";
export const muted = "text-body text-slate-600";

/** Badge tones (use with <Badge variant="outline" className={...}>). */
export const tone = {
  brand: "border-transparent bg-indigo-100 text-indigo-800",
  success: "border-transparent bg-emerald-100 text-emerald-800",
  warning: "border-transparent bg-amber-100 text-amber-900",
  danger: "border-transparent bg-red-50 text-red-700",
  neutral: "border-transparent bg-slate-100 text-slate-700",
} as const;
