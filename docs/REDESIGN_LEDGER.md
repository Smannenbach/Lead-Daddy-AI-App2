# Lead Daddy Redesign Ledger (GOAL PROMPT v4)

> Resume from this file daily; never restart. v3 (`docs/PRODUCTION_READINESS.md`) security/compliance wins on conflict.
> "Done" = Figma frame link + merged PR + screenshots at 3 widths + Lighthouse/axe numbers.

## Tool probe (Day 1, 2026-11-09)

| Tool | Status | Evidence / notes |
|---|---|---|
| Figma MCP | OK | `whoami`: Stephen Mannenbach, MIB Agency (pro, Full seat, admin), code layers + specs enabled |
| Mobbin MCP | OK | `list_collections`: only "All saved" (empty) — "Lead Daddy Redesign" collection to be created |
| Canva MCP | OK | `list-brand-kits`: 1 brand kit (`kAEh51VFx2Q`) |
| Adobe for Creativity MCP | OK | `adobe_mandatory_init` returned routing doc; Express HTML export + fonts tools available |
| Artifact tool | OK | available (quickstart required per new artifact) |
| Claude in Chrome / built-in browser | OK (not yet exercised) | screenshots at 3 widths |
| Higgsfield | DOWN | MCP 401 AUTH_HEADER_REJECTED — fallback: Canva / Adobe for imagery |
| Playwright plugin | DOWN | connection skipped (cached failure) — fallback: built-in browser |
| Kapture | DOWN | connect timeout — fallback: built-in browser / Chrome |
| Local `next build` | CONSTRAINED | machine near commit-memory limit; builds proven on CI + Vercel previews |

## Screens and system items

| ID | Area | Screen/Item | Mobbin refs | Figma link | Code PR | Flag | A11y/Lighthouse | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| RD-000 | System | Tool probe + ledger | — | — | — | — | — | Done | table above |
| RD-001 | System | UI audit: routes, token sprawl, component inventory, brand/trademark strings | — | — | — | — | — | Done | `docs/redesign/AUDIT_2026-11-09.md`: Track B ~93 route entries / 66 components; 65 hex colors, 367 color utilities, 3% semantic tokens; 8 competitor names in visible copy; light-only |
| RD-002 | System | Mobbin collection "Lead Daddy Redesign" (15 screens, 5 flows) | [collection](https://mobbin.com/collections/3ff95631-e00f-415a-ae78-6574349ba80e/mobile/screens) | — | — | — | — | Done | 44 screens + 10 flows; `docs/redesign/MOBBIN_REFS.md` |
| RD-003 | System | FigJam IA: current vs proposed | — | [FigJam](https://www.figma.com/board/9nnfsvM9znEvejHLCIoUzi) | — | — | — | Done (proposal) | current: 6 groups/55+ links; proposed: 7 app items + agency switcher, platform admin out of nav |
| RD-004 | System | Figma "Before" baseline | — | | — | — | — | Pending | needs live-page capture of leaddaddy.ai routes |
| RD-005 | System | 3 visual directions (Artifact gallery) — **Steve picks (gated)** | RD-002 collection | — | — | — | — | Awaiting Steve | [gallery](https://claude.ai/artifact/BMZNALEMLaxx899gzzeUi8) (A Switchboard, B Open Line, C House Brand); source `docs/redesign/directions.html` |
| RD-006 | System | Figma library (variables light/dark/white-label, styles, components) | | | | — | | Pending | |
| RD-007 | System | Tokens + components in code (Track B first) + Code Connect | | | | — | | Pending | |
| RD-010 | Revenue | Marketing home | | | | — | | Pending | |
| RD-011 | Revenue | /pricing | | | | — | | Pending | |
| RD-012 | Revenue | /signup (server-side org assignment — blocked on v3 L-14/GP-1) | | | | — | | Blocked | v3 L-14 |
| RD-013 | Revenue | /redeem (AppSumo) — same block as RD-012 | | | | — | | Blocked | v3 L-14 |
| RD-014 | Revenue | First-run onboarding | | | | `ui_v2` | | Pending | |

## Work log

- 2026-11-09: Direction gallery published (private); gated on Steve's pick. v3 conflict logged: competitor names (GoHighLevel/GHL/HubSpot) in 8 visible Track B strings must go before PPC.
- 2026-11-09: Audit, Mobbin collection and FigJam IA done. Figma "Before" baseline deferred (needs live-page capture).
- 2026-11-09: Branch `design/redesign-phase0` (Track A). Tools probed (above). Ledger created.
