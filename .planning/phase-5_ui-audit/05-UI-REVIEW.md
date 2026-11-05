# Phase 5 — UI Review (Full-App Audit)

**Audited:** 2026-11-04
**Baseline:** Abstract 6-pillar standards (no UI-SPEC.md exists — non-GSD project audited retroactively)
**Scope:** All 8 routes (`/`, `/quincenas`, `/tarjetas`, `/prestamos`, `/ahorro`, `/calendario`, `/calculadora`, `/configuracion`) + app shell
**Screenshots:** Captured (21 files) → `.planning/ui-reviews/05-20261104-231929/` (gitignored). See "Visual Evidence Methodology" for an important caveat.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Strong, specific Spanish copy throughout; English fallback string, dot-vs-comma decimal inconsistency, mismatched table header |
| 2. Visuals | 1/4 | **BLOCKER:** all 5 charts render broken data marks — lines invisible, bars solid black (verified via computed-style probe against served CSS) |
| 3. Color | 2/4 | 116 hardcoded Tailwind palette classes vs. 0 in the preset; only 5 `dark:` variants — semantic colors unreadable/clashing in dark mode |
| 4. Typography | 3/4 | Disciplined hierarchy (Geist + tabular-nums) but 7 sizes + 3 weights and `text-[10px]` below the 12px legibility floor |
| 5. Spacing | 3/4 | Strongly on-scale (333 utilities, 4px rhythm); `pt-5` ×23 fights the preset's 16px card spacing token |
| 6. Experience Design | 2/4 | Excellent skeletons/empty/conflict handling; but zero error boundaries, silent refresh failure, native `confirm()/alert()`, unnamed icon buttons |

**Overall: 14/24**

---

## Top 3 Priority Fixes

1. **Fix the chart color pipeline (BLOCKER)** — Every chart on 4 routes shows no usable data marks: the dashboard loan curve, the calculadora curve, and both préstamos abono-impact lines are **invisible**; utilization and ahorro bars render **solid black** (near-invisible in dark mode). — User impact: the app's core purpose (visualizing debt payoff) silently fails; users see empty grids with axes. — Fix: in all 5 files under `src/components/charts/` plus `src/app/calculadora/page.tsx`, replace every `hsl(var(--chart-N))` / `hsl(var(--muted-foreground))` with the bare `var(--chart-N)` (tokens are oklch/lab/hex — never hsl components, so the `hsl()` wrapper produces an invalid color that Chromium resolves to `stroke: none` / `fill: rgb(0,0,0)`). While there, give the ahorro chart a legend and non-empty tooltip series names (`ahorro-chart.tsx:50-53` returns `""`), and consider non-gray chart tokens — `--chart-1..5` all have zero chroma (`globals.css:70-74`), so even fixed, multi-series charts render indistinguishable grays.

2. **Add dark-mode variants (or tokens) for the semantic color system** — 116 hardcoded `emerald/amber/red/blue/slate-###` classes with only 5 `dark:` variants. In dark mode: calendar chips use `-700` text on dark cards (below WCAG AA contrast), calendar badges keep `-100` pastel backgrounds (clashing bright chips), dashboard payment badges use `-200` borders. — User impact: dark-mode users (a first-class mode with a dedicated toggle) get illegible or visually broken status indicators on 3+ routes. — Fix: either extend the theme with semantic tokens (e.g. `--positive`, `--warning`, `--info` in both `:root` and `.dark`), or systematically add `dark:` variants (the codebase already does this correctly in `prestamos/page.tsx:112` and `loan-abono-simulator.tsx:138-141` — apply that pattern everywhere; `calendar-view.tsx:36-54` and `page.tsx:481-485` are the worst offenders).

3. **Add error boundaries and surface the silent refresh failure** — No `error.tsx`/`global-error.tsx`/`not-found.tsx` anywhere in `src/app`, and `getFinancialState` (`src/lib/state.ts`) has no catch — any Google Sheets outage crashes to Next.js's default English error screen. Separately, "Actualizar datos" (`config-form.tsx:26-38`) swallows non-OK responses: the spinner stops and the user never learns the refresh failed. — User impact: the app's single dependency is a live Google Sheet; its most likely failure mode produces an unhandled, unbranded, English crash page, and the manual recovery action fails silently. — Fix: add `src/app/error.tsx` (Spanish copy + "Intentar de nuevo" retry button), and in `handleRefresh` show an inline error message when `!res.ok`.

---

## Detailed Findings

### Visual Evidence Methodology (read first)

- Dev server was live at `http://localhost:3210` (HTTP 200). Playwright-MCP unavailable; Playwright npm not installed. Captured via the cached `chrome-headless-shell` binary directly: 8 routes × desktop (1440×900) + mobile (375×812), 1 tablet (768×1024), 4 tall (1440×2000) — 21 PNGs in `.planning/ui-reviews/05-20261104-231929/` (directory gitignored before any capture).
- **Caveat:** this audit session's model cannot ingest images, and under the virtual-time headless capture recharts `ResponsiveContainer` never fired its ResizeObserver, so the captured PNGs contain empty chart wrappers (confirmed by DOM dump). Chart findings below were therefore verified by **stronger, deterministic means**: (a) a Chromium `getComputedStyle` probe using the exact token values from the served CSS (`--chart-2: #737373`, `--chart-5: lab(15.204% 0 0)` → `stroke` computes to `none`, `fill` to `rgb(0,0,0)`); (b) full-page pixel histograms of the PNGs (via in-browser canvas analysis) which confirmed no chart marks painted and correctly attributed the only long dark pixel runs to `bg-primary` Progress bars. Recommend a 30-second human eyeball of `/` and `/calculadora` in a real browser to visually confirm the chart defect.

### Pillar 1: Copywriting (3/4)

**Strengths (this is the app's best pillar):**
- Specific, action-first CTAs everywhere: "Hacer permanente" (`loan-abono-simulator.tsx:187`), "Configurar tasa" (`card-rate-dialog.tsx:132`), "Agregar gasto" (`quincena-editor.tsx:204`), "Registrar pago" (`card-payments.tsx:185`), "Borrar tasa configurada" (`card-rate-dialog.tsx:193`), "Editar campos" (`card-edit-dialog.tsx:100`).
- Specific empty states on every list: "No hay pagos próximos." (`page.tsx:467`), "Sin gastos — agrega el primero" (`quincenas/page.tsx:82`), "Aún no hay pagos registrados." (`card-payments.tsx:110`), "Aún no hay abonos registrados." (`loan-abonos-list.tsx:55`), "…no tiene cronograma detallado." (`loan-schedule-tabs.tsx:125`), "No hay eventos para este día." (`calendar-view.tsx:234`), "No hay plan de ahorro activo." (`ahorro/page.tsx:59`).
- Excellent error/conflict copy: "La hoja cambió — valor actual: X" (`sheet-edit.tsx:29-34`), "No se pudo guardar. Intenta de nuevo." (`sheet-edit.tsx:96`), field-level "El concepto es requerido." / "Monto inválido." / "Máximo 60 caracteres." (`quincena-editor.tsx:159-166`), "El monto en RD$ es obligatorio." (`card-payments.tsx:39`), "Simulación no disponible: {reason}" (`card-interest-panel.tsx:55`).
- Trust-building disclosure copy: "los cambios se escriben directamente en la hoja" (`card-edit-dialog.tsx:102`), "Los abonos y tasas se guardan localmente en la app; la hoja sigue siendo la fuente oficial." (`prestamos/page.tsx:199-201`).
- Null → "—" convention consistently applied (`format.ts:13-31`, `MoneyInline`).

**Issues:**
- **WARNING — English fallback in Spanish UI:** `page.tsx:526` renders `{autoLoan ? autoLoan.name : "Auto Loan"}` — an English string as the fallback description of the dashboard's "Curva de saldo" card. Replace with "Préstamo de auto" or omit the description.
- **WARNING — decimal-separator inconsistency:** all currency uses es-DO comma decimals ("RD$ 35.000,00" via `Intl`), but every percentage uses `toFixed` dot decimals ("35.0%", "2.55%"): `format.ts:51-64`, local `percentage()` (`page.tsx:613-616`), `ahorro/page.tsx:101`, chart tooltips (`utilization-chart.tsx:74-77`). Mixed conventions appear side-by-side in the same cards.
- **WARNING — header/content mismatch:** the quincenas table column "Nota" (`quincenas/page.tsx:96`) never shows a note — its cells render the "Facturado en USD" badge (`quincena-editor.tsx:76`). Rename to "Moneda" or render the actual note field.
- Minor: generic "Guardar"/"Cancelar" pair in AddExpenseForm (`quincena-editor.tsx:252,264`) — "Agregar" would match the intent; terse "Sin datos." (`quincenas/page.tsx:168,171`) is below the specificity bar set elsewhere; "Error desconocido." fallback appears in user-facing `alert()` dialogs (`card-payments.tsx:90`, `loan-abonos-list.tsx:32`).

### Pillar 2: Visuals (1/4) — BLOCKER

- **BLOCKER — all 5 charts render broken data marks (4 of 8 routes affected):**
  - Every chart wraps the theme tokens in `hsl()`: `utilization-chart.tsx:41,96` (`hsl(var(--chart-1))`), `loan-balance-chart.tsx:29,55`, `calculadora/page.tsx:160,188` (`hsl(var(--chart-5))`), `loan-abono-impact-chart.tsx:71,75,107,116`, and the tooltip-injected `--color-*` values (`ui/chart.tsx:104`).
  - The tokens are defined as oklch in `globals.css:70-74` and served compiled as `#d4d4d4`/`lab(84.92% 0 0)` etc. — **never hsl components**. `hsl(#737373)` and `hsl(lab(15.204% 0 0))` are invalid CSS.
  - Chromium probe with the exact served values: `stroke="hsl(var(--chart-2))"` → computed `stroke: none` (line charts render **no line at all** — only grid + axes + tooltips); `fill="hsl(var(--chart-2))"` → computed `rgb(0,0,0)` (bars render **solid black**, ignoring the token; near-invisible on dark cards).
  - Affected: dashboard "Curva de saldo de préstamos" (invisible line) + "Utilización por tarjeta" (black bars); calculadora "Curva de saldo" (invisible line); préstamos abono-impact chart (both "Sin abono" and "Con abono" lines invisible — and its legend swatches use the same invalid color, so the legend shows unlabeled lines); ahorro "Depósitos semanales" (two unlabeled black series).
  - Note: recharts' built-in default for a colorless `<Line>` is `#3182bd` (`node_modules/recharts/lib/cartesian/Line.js:140`) — passing the broken value is strictly worse than passing nothing.
- **WARNING — unnamed icon-only buttons:** the calendar month navigation buttons have no `aria-label`/`title`/text (`calendar-view.tsx:177-185`) — screen readers announce "button". The ✓/✕ commit buttons in `sheet-edit.tsx:149-175` rely on `title` only (native tooltip — invisible to keyboard users, unreliable on touch).
- **WARNING — semantic icon misuse:** Préstamos nav item uses `ChevronRight` (`active-nav.tsx:34`) — a "go forward/expand" affordance on a static destination, inconsistent with the 7 other meaningful lucide icons (Landmark is already used for loans elsewhere).
- **WARNING — Badge as prose:** `local-data-card.tsx:61-64` wraps a 100-character sentence in a `Badge` — badges are for short labels; this renders as an odd wrapped pill.
- Positive: clear hierarchy on the dashboard (KPI values `text-2xl font-semibold` under `text-xs` muted labels), tabular-nums on all figures, hover states on cards/rows, calendar today/selected ring states, dashed-border simulation card distinguishing draft from permanent state (`loan-abono-simulator.tsx:83`). Minor: the conditional 7th KPI card (`page.tsx:376-397`) leaves a lone card in the last grid row.

### Pillar 3: Color (2/4)

- **116 hardcoded Tailwind palette classes in app code** (emerald ×61, amber ×21, red ×18, blue ×11, slate ×5) — while the vendored preset (`components/ui/*`) contains **0** and uses 30 `dark:` variants. The app builds a parallel, untokenized semantic system on top of a monochrome (nova) theme.
- **Only 5 `dark:` variants for those 116 uses.** Concrete dark-mode failures:
  - Calendar event chips: `text-blue-700`/`text-amber-700`/`text-red-700` on `/10` backgrounds (`calendar-view.tsx:37-44`) — 700-level text on the dark card (`oklch(0.205)`) lands roughly 2.5-3.5:1 contrast, below WCAG AA for the small text used.
  - Calendar detail badges: `bg-blue-100 text-blue-700` etc. (`calendar-view.tsx:46-54`) — light pastel chips that stay bright in dark mode, clashing with the muted dark aesthetic.
  - Dashboard payment-type badges: `border-blue-200`/`border-amber-200`/`border-red-200` with `-600` text (`page.tsx:481-485`).
  - Inconsistent handling of the same semantic in one panel: `prestamos/page.tsx:102-110` uses `text-emerald-600` without a dark variant, while line 112 correctly uses `text-emerald-700 dark:text-emerald-400`.
- **Chart palette is broken (see Pillar 2) and monochrome by design:** `--chart-1..5` all have zero chroma (`globals.css:70-74`, dark variants `105-109`) — five indistinguishable grays even once the `hsl()` bug is fixed; the abono-impact comparison deliberately uses `muted-foreground` + `chart-2` (two grays).
- Positive: the 60/30/10 discipline otherwise holds — neutrals dominate, the primary token (32 uses) is reserved for active nav, icon chips, and CTAs; destructive is reserved for errors; utilization thresholds (≥80 red / ≥50 amber / else emerald) are applied consistently (`tarjetas/page.tsx:169-175`); light-mode contrast is fine throughout.

### Pillar 4: Typography (3/4)

- **7 distinct font sizes in use** (xs ×106, sm ×56, 2xl ×18, base ×10, lg ×9, xl ×8, 3xl ×1) and **3 weights** (medium ×57, semibold ×42, normal ×3) — exceeds the abstract ≤4 sizes / ≤2 weights guideline, though the distribution is disciplined: xs = labels, sm = body, 2xl = KPI/page values, 3xl only on the calculadora hero figure.
- **WARNING — `text-[10px]` ×3** (`calendar-view.tsx:292,300`, `tarjetas/page.tsx:181`): an arbitrary size below the 12px legibility floor and off the type scale — used for the densest content in the app (calendar chips) where it hurts most. Bump to `text-xs`.
- **WARNING — 10-11px recharts tick labels** set inline (`calculadora/page.tsx:167,169`, `loan-balance-chart.tsx:36-38`, `ahorro-chart.tsx:40,42`, `loan-abono-impact-chart.tsx:84,88`) — tiny axis text; also bypasses the design system.
- Minor: the preset's own `sm` button uses `text-[0.8rem]` (`ui/button.tsx:26`) — off-scale but vendored.
- Positive: Geist Sans/Mono with `tabular-nums` on all money figures, `tracking-tight` on large numerals, consistent `text-2xl font-semibold tracking-tight` page titles across all 8 routes, `capitalize` month label (`calendar-view.tsx:180`).

### Pillar 5: Spacing (3/4)

- 333 spacing utilities, overwhelmingly on-scale: `gap-1/2/3/4/6`, `space-y-1/2/4/6/8`, `p-2/3` — a consistent 4px-base rhythm. Page shell padding is responsive: `p-4 sm:p-6 lg:p-8` (`shell.tsx:83`).
- Only 3 arbitrary spacing/sizing values in app code (the same `[10px]` trio from typography). Very clean.
- **WARNING — `pt-5` ×23 fights the preset's card token:** KPI/totals cards override `CardContent` with `pt-5` (20px) — e.g. `page.tsx:252`, `tarjetas/page.tsx:292`, `ahorro/page.tsx:85` — while the nova Card system spaces content at `--card-spacing` (16px, `ui/card.tsx` / `globals.css` radius+spacing scale). Result: 4px top-padding discrepancy between card types across pages.
- Positive: responsive grids everywhere (`grid gap-4 sm:grid-cols-2 lg:grid-cols-3/4`), calendar `min-h-20 sm:min-h-28` cells, sticky detail panel (`lg:sticky lg:top-4`, `calendar-view.tsx:226`), `overflow-x-auto` table wrapper (`ui/table.tsx:10`) so 9-column schedules scroll rather than break on mobile.

### Pillar 6: Experience Design (2/4)

**Strengths:**
- Loading: every route wraps its content in a shaped `<Suspense>` skeleton (all 8 pages) plus `NavSkeleton` for the shell (`shell.tsx:15-26`) — 77 loading-indicator references; skeletons mirror final layout (KPI card grids, tables, calendar).
- Empty states handled on every list (13 distinct matches — see Pillar 1).
- Pending/disabled: all mutating buttons disable + swap to `Loader2` spinners while saving; inline field validation with per-field error messages (`quincena-editor.tsx:156-172`).
- Concurrency: 409 conflict handling with inline message + auto-refresh after 1.5s (`sheet-edit.tsx:91-93`) — sophisticated for a Google-Sheet-backed app; blur-safe editing with `onMouseDown` preventDefault so ✓/✕ don't lose focus (`sheet-edit.tsx:154,169`).
- Destructive confirmation: inline two-step "¿Eliminar?" for expenses (`quincena-editor.tsx:79-106`); `confirm()` guards for payments/abonos.
- Keyboard: Enter commits / Escape cancels in all inline editors (`sheet-edit.tsx:103-111`).
- Live draft simulation in the abono simulator (no page round-trip) with explicit "Hacer permanente" escalation.

**Issues:**
- **BLOCKER-adjacent WARNING — zero error boundaries:** no `error.tsx`, `global-error.tsx`, or `not-found.tsx` anywhere in `src/app` (verified by glob), and `getFinancialState` has no catch (`src/lib/state.ts` — zero `catch|throw|Error` matches). Any Sheets API failure crashes every route to Next.js's default English error screen — no Spanish, no retry, no brand.
- **WARNING — silent failure on "Actualizar datos":** `config-form.tsx:26-38` ignores non-OK responses (`if (res.ok)` with no else) — the button stops spinning and nothing else happens; the user cannot distinguish success from failure.
- **WARNING — native `confirm()`/`alert()` ×4** (`card-payments.tsx:78,90`, `loan-abonos-list.tsx:20,32`): browser-chrome dialogs with English OK/Cancel on many systems, inconsistent with the app's own inline-confirm pattern, and errors surfaced via `alert()` instead of the inline error spans used everywhere else.
- **WARNING — a11y gaps:** placeholder-only inputs in the payment form (`card-payments.tsx:148-173` — no `<label>`/`aria-label`, unlike the labeled `AddExpenseForm`); mobile menu trigger lacks `aria-expanded` (`shell.tsx:46-53`) and `MobileNav` has no Escape/backdrop close; calendar prev/next unnamed (see Pillar 2).
- Minor: `Money` export is dead code and would render "RD$ 0.00" for all-null inputs (`money.tsx:29` vs. `MoneyInline`'s correct "—") — remove it; no FOUC guard for dark-theme users (class applied in effect, `theme-provider.tsx:45-47`) — brief light flash on load.

---

## Registry Safety

`components.json` exists (style `radix-nova`, `registries: {}`, official shadcn registry only), but the registry audit protocol requires a UI-SPEC.md listing third-party registries — none exists for this project. **Registry audit: not applicable — no third-party registry blocks in use; all `components/ui/*` are official shadcn (radix-nova preset) vendored files.**

---

## Visual Evidence Artifacts

Stored in `.planning/ui-reviews/05-20261104-231929/` (gitignored):
- 21 route screenshots (8 desktop 1440×900, 8 mobile 375×812, 1 tablet 768×1024, 4 tall 1440×2000)
- `color-probe.html` — Chromium computed-style proof of the chart color defect (run with `--dump-dom`)
- `dashboard-dom.html` — rendered DOM dump of `/`
- `analyze-stats.ps1`, `analyze-pixels.ps1`, `build-pixel-html.ps1`, `capture-tall.ps1` — audit tooling
- `pixel-analyze.html` — in-browser canvas pixel histograms of the tall screenshots

---

## Files Audited

**Routes (src/app/):** `page.tsx`, `quincenas/page.tsx`, `tarjetas/page.tsx`, `prestamos/page.tsx`, `ahorro/page.tsx`, `calendario/page.tsx`, `calculadora/page.tsx`, `configuracion/page.tsx`, `layout.tsx`, `globals.css`
**Shell/shared (src/components/):** `shell.tsx`, `active-nav.tsx`, `footer.tsx`, `theme-provider.tsx`, `sheet-edit.tsx`, `money.tsx`, `quincena-editor.tsx`, `calendar-view.tsx`, `card-edit-dialog.tsx`, `card-rate-dialog.tsx`, `card-payments.tsx`, `card-interest-panel.tsx`, `loan-abono-simulator.tsx`, `loan-abonos-list.tsx`, `loan-schedule-tabs.tsx`, `config-form.tsx`, `local-data-card.tsx`, `charts/utilization-chart.tsx`, `charts/loan-balance-chart.tsx`, `charts/ahorro-chart.tsx`, `charts/loan-abono-impact-chart.tsx`
**UI primitives (src/components/ui/):** `button.tsx`, `table.tsx`, `progress.tsx`, `chart.tsx`
**Lib:** `format.ts`, `state.ts` (error-path grep)
**Config:** `package.json`, `components.json`, `node_modules/shadcn/dist/tailwind.css` (existence), `node_modules/recharts/lib/cartesian/{Bar,Line}.js` (default color behavior), served CSS from the live dev server
