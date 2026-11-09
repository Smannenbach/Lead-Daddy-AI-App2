# GOAL PROMPT v4: Lead Daddy Full Redesign (Design System → Marketing → App)

> Paste this whole file into Claude Code, opened on the PC with both repos. Say `go` to start.
> Re-run it daily: **resume from `docs/REDESIGN_LEDGER.md`, never restart.**
> This runs **alongside** GOAL_PROMPT v3 (production readiness). v3's P0/P1 security and compliance items
> always win. If the two prompts conflict, v3 wins and you log the conflict.

## MISSION

Redesign Lead Daddy end to end so it looks and feels like a premium, category-defining white-label CRM.
It must convert PPC traffic and AppSumo buyers during Black Friday / Cyber Monday (Nov 27–30) and let
every white-label client feel it is *their* product.

Order of work: **design system first, then the revenue path (marketing → pricing → signup → AppSumo
redeem → onboarding), then the app.** Every screen is evidence-backed: a real-world reference pattern
(Mobbin), a Figma design, and shipped code that matches it, verified in a browser.

Team: Steve Mannenbach (owner/approver), Mykoal DeShazo. The product is **Lead Daddy**
(https://leaddaddy.ai). Credentials come from env vars and the secrets doc, never from this prompt.

---

## THE TWO APPS (same as v3)

| | Track A: lean app | Track B: main app |
|---|---|---|
| Repo / local | `Smannenbach/LeadDaddy.ai` · `C:\Users\steve\Projects\lead-daddy-rebuild` | `Smannenbach/leaddaddy` · `C:\Users\steve\leaddaddy` (**WIP in working tree: use worktrees, never touch it**) |
| Stack | Next.js 16 + Tailwind v4 + Supabase | Vite React SPA + shadcn/Radix + Tailwind + Supabase |
| Prod | app2.leaddaddy.ai | leaddaddy.ai, app.leaddaddy.ai (Cloudflare proxy → Vercel) |
| Gate | `npm run lint && npx tsc --noEmit && npm test && npm run build` | `npm run gate` + `npm run typecheck` |

The marketing site, /pricing, /signup and the AppSumo redeem flow live in **Track B** (leaddaddy.ai is the
domain PPC and AppSumo point at). Track A adopts the same tokens and components afterwards.

---

## DESIGN TOOLKIT: USE ALL OF IT, EACH FOR WHAT IT'S BEST AT

Probe each tool on Day 1 and record which ones respond in the ledger. If a tool is down or needs auth,
say so once, fall back to the next one, and keep going.

| Tool | Use it for | Notes |
|---|---|---|
| **Mobbin** (`mobbin` MCP: `search_screens`, `search_flows`, `search_sections`; skills `best-practices`, `redesign-screen`, `search`) | Real shipped patterns for every screen and flow before designing it: CRM tables, pipelines, inbox, dashboards, onboarding, pricing, checkout, settings, white-label/agency switchers | Load `best-practices` first. Save references into a Mobbin collection "Lead Daddy Redesign" (`create_collection`, `save_content`). Cite 2–5 references per screen in the ledger |
| **Figma** (`figma` MCP; skills `figma-use`, `figma-generate-library`, `figma-generate-design`, `figma-design-to-code`, `figma-code-connect`, `figma-generate-diagram`, `figma-code-workflows`, `figma-create-new-file`) | The design-system library (variables, text/color/effect styles, components), every screen design, Code Connect mappings, FigJam IA/flow diagrams | MIB Agency team. `create_session` before any file tool. One file: "Lead Daddy — Design System"; one file: "Lead Daddy — Screens". Load each mandatory skill before its tool |
| **Figma code → design** (`generate_figma_design`, `send_code_to_figma`, `html_to_figma`) | Pull the **current** UI into Figma as the "before" baseline, and push shipped components back so Figma never drifts from code | Baseline first, so before/after is visible |
| **FigJam** (`generate_diagram`) | Information architecture, nav consolidation (LD-021), signup → redeem → onboarding flows, role/permission map | Do this before designing screens |
| **Modern Web Guidance** (skill `modern-web-guidance`) | Platform features: `<dialog>`, Popover API, View Transitions, container queries, `:has()`, `light-dark()`, anchor positioning, Core Web Vitals | Prefer Baseline-available features over JS libraries |
| **frontend-design**, **ui-ux-pro-max**, **web-design-guidelines**, **design-system**, **ui-styling**, **theme-factory**, **composition-patterns** (skills) | Aesthetic direction, token architecture (primitive → semantic → component), shadcn/Radix/Tailwind v4 styling, theming, React composition | Load before writing UI code |
| **dataviz** (skill) | Every chart, KPI tile, sparkline and dashboard | Load before any chart code. Every number traces to a query (v3 rule) |
| **Canva** (`create-design`, `generate-design`, `list-brand-kits`, `export-design`) | PPC ad creatives, AppSumo listing images, social launch assets in the new brand | Pull the brand kit; never invent logos that conflict with the Figma library |
| **Artifact** (Design / Design System types via `quickstart`) | Shareable review pages: moodboards, direction options, before/after galleries for Steve's sign-off | Publish privately; Steve shares if he wants |
| **Browsers** (Claude in Chrome, built-in browser, Playwright MCP) | Screenshot every live screen for the audit, verify shipped screens at 375 / 768 / 1280 / 1920, check dark mode | Use Vercel preview URLs for verification, never prod writes |
| **Firecrawl / web search** | Competitor positioning research (copy, pricing structure, feature naming) | Ideas only. See the trademark rules |
| **Higgsfield** (skills `higgsfield-brandkit`, `higgsfield-generate`) | Optional: brand imagery, hero visuals, launch video | Its MCP was failing auth (401). Skip unless Steve re-authenticates |
| **Lighthouse / Vercel Speed Insights** | Perf + a11y scores before and after for each key page | Target ≥ 90 perf and ≥ 95 a11y on marketing pages, ≥ 90 on app pages |

---

## NON-NEGOTIABLE DESIGN RULES

1. **Original, not a clone.** Study GoHighLevel, HubSpot, Attio, Close, Pipedrive and others for patterns,
   but never copy their layout, names, icons, illustrations or copy. **No competitor trademarks anywhere in
   the UI** (fixes LD-024: no "GHL Creator Studio", "Gong Deal Risk Radar", "Mutiny-class", etc.).
2. **White-label first.** Every color, logo, favicon, font choice and product name comes from tokens that
   an org's branding overrides at runtime (CSS variables). Zero hardcoded "Lead Daddy" strings or brand
   colors inside the authenticated app. A client org must never see Lead Daddy branding (L-11, LD-030).
   Mortgage-specific route names and copy go behind a vertical setting (LD-031).
3. **Tokens in three layers:** primitive → semantic → component. Light and dark from day one
   (`light-dark()` / class strategy). One spacing scale, one type scale, one radius scale, one elevation
   scale, one motion scale (with `prefers-reduced-motion`).
4. **Accessibility is part of done:** WCAG 2.2 AA, keyboard paths for every flow, visible focus, 4.5:1 text
   contrast checked for every brand theme (white-label themes must pass or be auto-adjusted), labels on
   every input, no color-only status.
5. **Honest UI.** No fake metrics, no simulated numbers dressed as real, no "Live" badge without a health
   check (LD-001/005/017). Empty, loading, error and permission-denied states are designed for every screen.
6. **Compliance stays visible.** TCPA consent capture, STOP/opt-out status, quiet-hours and A2P state are
   first-class UI, not buried. Business-purpose-only positioning for loan copy. No legal/tax/investment
   advice. Entity branding stays separate (Barrett Financial / Loan Daddy LLC / MIB Agency). Never mention
   American Pacific Mortgage.
7. **Don't break what's live.** All app-shell changes ship behind a feature flag (`ui_v2`), per org,
   default off. Marketing pages can ship directly after preview sign-off. Keep the Track A API contract frozen.
8. **No copyleft code.** MIT/Apache components only (shadcn/ui, Radix, Lucide, Tailwind). Mobbin and
   Figma Community content is reference only unless its license says otherwise.

---

## REQUIRED READING (Day 1, before designing)

1. `docs/PRODUCTION_READINESS.md` (v3 ledger), especially LD-004/005/009/010/012/014/015/021/022/024/026–031.
2. `LeadDaddy_Bug_List_2026-11-08.csv` and the bug-fix plan PDF (rasterize the pages; the text layer is garbled).
3. Track B: `src/components/ui/*`, `tailwind.config.*`, `src/index.css`, `Layout.jsx`, the router and nav.
   Track A: `src/app/**`, `globals.css`.
4. `~/.ai-memory/HIVE.md` and `topics/leaddaddy-inventory.md`. The LaunchGrid component library on the
   Desktop (176 JSX components) is reference material for softphone, verifiers and the CRM.

Create **`docs/REDESIGN_LEDGER.md`** in Track A: one row per screen or system item:
`ID | Area | Screen/Item | Mobbin refs | Figma link | Code PR | Flag | A11y/Lighthouse | Status | Evidence`.
"Done" needs: Figma frame link + merged PR + screenshot at 3 widths + Lighthouse/axe numbers.

---

## PLAN

**Phase 0: Audit and baseline (Day 1)**
- Screenshot every route in both apps (59 Track B routes) at desktop and mobile. Pull the current UI into
  Figma "Before" pages with `generate_figma_design`.
- Inventory components, colors, font sizes and spacings actually in use (grep plus computed styles).
  Report the sprawl as numbers, e.g. "47 distinct grays".
- FigJam: current IA vs proposed IA. Collapse the duplicates: one CRM entry with tabs, one Site Builder with
  modes, distinct names for the two content studios, lowercase canonical routes with redirects.
- Mobbin: build the reference collection for the top 15 screens and the 5 key flows.

**Phase 1: Direction and design system (Days 2–3)**
- Produce **3 distinct visual directions** (type pairing, color system, density, illustration/iconography
  stance, motion) as an Artifact gallery with a hero, a dashboard and a CRM table mock for each.
  **Steve picks one (gated).**
- Build the Figma library with `figma-generate-library`: variables (light/dark + a sample white-label theme),
  text/color/effect styles, and components for button, input, select, combobox, checkbox, switch, tabs,
  badge/status, table (sortable, selectable, sticky header, virtualized), kanban card, record panel,
  timeline, KPI tile, chart frames, empty/error/loading states, toast, dialog, popover, command palette,
  sidebar nav, org switcher, page header, pricing card, plan comparison, stepper.
- Ship the same tokens and components in code (Track B first, Tailwind v4 theme + CSS variables).
  Map them with Code Connect so Figma ↔ code stay in sync.

**Phase 2: Revenue path (Days 3–5), the BFCM-critical part**
- Public marketing home, **/pricing** (plans from one shared config), **/signup** (Stripe checkout or
  invite), **/redeem** (AppSumo code → org + plan tier, stackable codes), and **first-run onboarding**
  (org setup → branding → import contacts → connect a number with A2P status → first campaign).
- These pages are why PPC money converts: design for speed (LCP < 2.0s), clarity, social proof that is
  **real** (no invented testimonials or logos), and accessible forms. Instrument conversion events
  (consent-aware) for Google Ads and Meta.
- Canva: produce the matching PPC ad set and AppSumo listing images in the chosen direction.
- **Coordinate with v3:** signup and redeem must assign the org **server-side**. v3 found every table
  defaults `organization_id` to the Go Buy Leads org; that P0 must be fixed before signup goes live.

**Phase 3: App shell and core workspaces (Days 5–9), behind `ui_v2`**
- Shell: sidebar + org/sub-account switcher (LD-010), command palette (⌘K), notifications, consistent page
  headers, single H1 per page.
- In order: Dashboard (real aggregates only, LD-005/006/008) → CRM (Records Workspace + pipeline/kanban +
  record panel; server pagination, LD-018) → Inbox/Conversations (SMS/email/call with consent state) →
  Campaigns/Sequences → Phone numbers & softphone (LD-025/028) → Agency Portal & White Label (branding
  save + live preview, LD-004/014/032; one domain model, LD-009) → Team & Roles (one role enum, LD-011/012)
  → Settings → Reports.
- For each screen: Mobbin refs → Figma frame (desktop + mobile + empty/error states) → code → browser
  verification → ledger row.

**Phase 4: Track A adoption + polish (Days 9–11)**
- Apply the same tokens and components to Track A (login, console, CRM workspace, campaigns).
- Motion pass (View Transitions for route changes, reduced-motion safe), dark-mode pass, white-label
  stress test with 3 sample brands (including a low-contrast brand color, to prove auto-adjust).

**Phase 5: Verification and handoff (Day 12)**
- Before/after gallery Artifact (every redesigned screen, both themes, mobile).
- Lighthouse + axe report per key page; fix anything under target.
- Figma ↔ code drift check (`send_code_to_figma` on shipped components, compare to library).
- `docs/DESIGN_SYSTEM.md`: tokens, component usage, white-label theming guide, contribution rules.
- Flip `ui_v2` on for Steve's org only. Steve decides the rollout (gated).

If time slips, **cut Phase 4 polish and lower-traffic app screens first, never Phase 2.** Report cuts explicitly.

---

## HOUSE RULES (v3 rules still apply in full)

1. **Gated (ask Steve, batch the asks):** choosing the visual direction; any Track B production deploy or
   merge to `main`; turning `ui_v2` on beyond Steve's org; DNS changes; purchases (fonts, stock imagery,
   paid Figma/Mobbin/Canva add-ons); publishing anything public (ads, AppSumo listing, social posts).
2. **Branch → PR → gate → preview → review.** Small PRs, one screen or system piece each. Never push to `main`.
3. **Evidence over assertions.** Screenshots at 375/768/1280, Lighthouse/axe numbers and Figma links in
   every PR description and ledger row.
4. **Secrets:** never print or commit them. gitleaks before every push.
5. **Memory:** after each work block, update `~/.ai-memory/HIVE.md` and `topics/learnings.md`.
6. **Daily report (≤ 15 lines):** screens shipped (links), Figma progress, what is blocked on Steve,
   what was cut, and risk to the BFCM revenue path.

---

## DEFINITION OF DONE

- [ ] Steve picked a direction; the Figma library is published with light, dark and a white-label sample theme
- [ ] Tokens and components shipped in Track B and Track A, with Code Connect mappings
- [ ] Marketing home, /pricing, /signup, /redeem and onboarding live, Lighthouse ≥ 90 / a11y ≥ 95,
      conversion events firing, org assigned server-side
- [ ] Every app screen in the plan redesigned behind `ui_v2` with designed empty/error/loading states
- [ ] Zero competitor trademarks, zero hardcoded brand strings in the authenticated app, zero fake metrics
- [ ] WCAG 2.2 AA verified on key flows, including keyboard-only signup and a white-label low-contrast theme
- [ ] Before/after gallery, `DESIGN_SYSTEM.md` and `REDESIGN_LEDGER.md` complete
