# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**→ For complete project documentation, see [`docs/README.md`](docs/README.md) — the single source of truth for architecture, design, and development.**

## What this is

> **Osaka** — Graph AI Operating System. An AI knowledge-graph workspace that continuously ingests
> data from across a team's tools (email, documents, meetings, messages, calendars, CRM, notes) and
> builds a living graph of people, companies, topics, projects, activities and workflows — then
> reasons over it to surface insights, learn recurring processes and turn them into automations.
>
> Domain: a graph-AI operating system — an exploration-first knowledge workspace, not a document
> manager. Every screen should reinforce that the system understands context, relationships and
> evolving knowledge rather than merely storing information.

The live identity source is `src/data/brand.ts` → `brand.identity`: screens import it, so a rename
inside the app is one edit there. Files that can't import a TS module (`index.html`,
`storybook.html`, `package.json`, `README.md`, this file) carry the name literally.

### Domain rules

These apply because of what Osaka is — an AI system that infers, predicts and acts over a graph
built from a team's private data. They bind every screen:

- **Inference is never presented as fact.** Extracted entities, clustered entities, inferred
  relationships, insights, predictions and confidence scores are *model output*. Each one carries
  visible provenance (what it was derived from) and its confidence, and is visually distinguishable
  from ingested source data. Never render an inference in the same style as a fact the user
  supplied. Explainable reasoning is a product requirement, not a nice-to-have.
- **Ingested source material is confidential and third-party.** The graph is built from a user's
  email, messages, calendar, CRM and documents — which include people who never used this product.
  Everything in `src/data/` and `src/mocks/` must be *clearly synthetic*: invented people,
  companies, and message content. Never paste real correspondence, contacts, or CRM records into
  the repo, a screenshot, or a fixture.
- **Sandbox is never mistaken for the live graph.** "What-if" simulations modify graph data by
  design, so a sandbox surface carries a persistent, unmissable state indicator, and promoting
  sandbox changes into the live graph is an explicit, confirmed action — never implicit and never
  a side effect of navigation.
- **Agents and automations are reviewed before they act.** A learned process becoming a running
  automation, a generated agent skill, or an agent taking action on the user's behalf requires
  explicit human confirmation before its first run, and stays inspectable, pausable, and
  reversible afterward. Show what an automation *will* do, sourced from the graph, before it runs.
- **Graph mutations are shown in scope.** Merging entity clusters, deleting an entity, or accepting
  a bulk set of inferred relationships rewires many edges at once. Before confirming, state how
  many entities and relationships are affected, and make the action undoable where possible.

These hold for **every** project built on this template, whatever the domain:

- **Never fabricate data that looks authoritative.** Figures, units, labels, names, prices, and
  statistics in an unbuilt product are placeholders — keep them *clearly* synthetic, and flag
  anything that would need a subject-matter expert to sign off.
- **Clarity and accessibility are requirements, not polish.** Legible type, sufficient contrast,
  unambiguous states (error/success/warning), accessible labels on every interactive element.
- **No destructive or irreversible actions without explicit confirmation** in the UI.

## ⛔ Two mandatory skills

**Any UI change — a screen, component, layout, color, spacing, or style — requires loading
`/vuetify-ds` first.** Every time, not just the first. It is the authority on the design system,
the component-selection order, and the tokens-not-hex rule. If a request involves UI and you
haven't loaded it, stop and load it.

**Any chart, graph, plot, or dashboard visualization goes through the chart kit** in
`src/components/charts` (Apache ECharts + `vue-echarts`) — never a raw `<v-chart>`, and
**never a second charting library** (Observable Plot, Chart.js, Carbon/Ant charts). Adding one
is the failure this rule exists to prevent, so it's stated here rather than only in the skill.

**Exception: Network graph visualization uses D3.js.** The interactive knowledge graph is a core
product screen (on every page) and requires sophisticated force-directed simulation, hierarchical
edge bundling, and interactive layout switching that ECharts cannot support. D3.js is the only
specialized visualization library allowed beyond the chart kit; components live in `src/components/graphs/`.
Vue owns data state and component lifecycle; D3 owns DOM rendering and physics simulation.

Everything else about charts — the preset list, the selection order, `src/data/chartTheme.ts` as the
only source of chart color/type, status-colors-are-for-state, and the load-bearing `categorical`
palette order — lives in `/vuetify-ds` → *Chart / data-viz selection logic*, which the rule above
already requires you to load. `Storybook.vue`'s **Data viz** section shows correct usage of each
preset.

## Skills

`vuetify-ds` is the **one authority** on this project's design conventions; every other skill
defers to it. Skills auto-activate on their descriptions — this table is the tie-breaker.

| The task is… | Skill | Timing |
|---|---|---|
| Colors, spacing, radius, type, choosing/composing a Vuetify component | **vuetify-ds** | always, first (mandatory) |
| How a screen is *arranged* — composition, hierarchy, structure, UX copy | **frontend-design** | while designing |
| Auditing a finished screen — a11y, forms, focus, states, motion, copy | **web-design-guidelines** | after building |
| Vue/TS *code* — component typing, watchers, Volar/vue-tsc, defineModel | **vue-best-practices** | while coding |
| Starting a new project or rebranding this one | **new-project** | at project start |

When several apply to one screen: **vuetify-ds** (styling, always) → **frontend-design** (arrange)
→ build → **web-design-guidelines** (audit).

- **Reviewer skills must never define a design language.** Any critique skill is a *reviewer only* —
  don't let one generate a competing `design.md`, invent a palette or type scale, or ask the
  designer to define a design language. The DS already exists in `vuetify.ts` + `settings.scss` +
  `src/data/brand.ts`; point every review back at it.
- **The vue-ecosystem reference skills** (vuetify/vue/pinia/router) are for **upstream API facts
  only** — never for project conventions.

## Commands

All commands run from the **repo root** — the app lives at the root, not in a subfolder.

```bash
corepack pnpm install
corepack pnpm dev            # product app — Vite dev server on port 3000; boots MSW mocks first
corepack pnpm dev:storybook  # standalone DS Storybook on port 3001 (no router/MSW)
corepack pnpm dev:all        # both of the above at once (product :3000 + Storybook :3001)
corepack pnpm build          # type-check + vite build (product app only; Storybook has no build)
corepack pnpm preview        # serve dist/
node_modules/.bin/vue-tsc --build   # type-check only
```

- Use **`corepack pnpm`**, not bare `pnpm`.
- For type-check prefer `node_modules/.bin/vue-tsc --build` — the `corepack pnpm run type-check`
  wrapper currently fails a pre-run dep check.
- **There is no test suite and no runnable linter.** `eslint.config.js` references
  `eslint-config-vuetify`, which is not installed and has no npm script. Don't claim tests/lint
  passed; type-check + a dev-server smoke check is the available verification.
- After editing `src/styles/settings.scss` or `src/styles/_tokens.scss`, **restart the dev server**
  (Sass is build-time; theme colors and component defaults in `vuetify.ts` hot-reload).

## Architecture

**Frontend-only engagement.** This codebase owns the UI layer, not the backend/auth/DB. It is built
*against* a backend via typed contracts plus a mock layer, so a real backend drops in by matching
the shapes.

Stack: Vue 3 + Vite + TypeScript, **Vuetify 4**, Pinia, vue-router 5, MSW. Icons: **IBM Carbon**
(`@carbon/icons-vue`), referenced by semantic key from `src/icons/carbon.ts`.
`@/*` aliases to `src/*`. Form validation uses Vuetify's built-in field `:rules` — no extra dep.

### Two components that are infrastructure, not product code

- **`src/components/AppIcon.vue`** is Vuetify's **global icon renderer**, wired in `vuetify.ts`
  (`component: props => h(AppIcon, …)`). Every `<v-icon>` and every component-internal icon routes
  through it. **Deleting it breaks the entire icon layer.** It looks like a product component; it
  isn't.
- **`src/components/AppPictogram.vue`** is imported by the Storybook.

Their key maps are `src/icons/carbon.ts` and `src/icons/pictograms.ts`. Add a key there — never
import a Carbon component straight into a screen.

### What exists today (keep this section current as the app grows)

**The stable base — don't rebuild it:** the design system (`src/plugins/vuetify.ts` +
`src/styles/`), the chart kit (`src/components/charts/` + `src/data/chartTheme.ts` +
`src/data/chartSamples.ts` — note the palette lives in `src/data/`, not in the charts folder), the
Storybook, the brand preset (`src/data/brand.ts`), the two icon components above, and the seams
(`src/api/`, `src/mocks/`, `src/stores/`, `src/router/`).

**Not built yet — as of this writing:** product screens (`src/screens/` holds only `Storybook.vue`,
which is not a route) · shared chrome (top bar, backdrop, nav shell) · a logo component · product
datasets in `src/data/` · anything in `src/assets/`, which is empty. **Update these two lists as
things land** — a stale list here is worse than none.

Because no product screens exist yet, **`src/router/index.ts` currently has an empty `routes`
array.** The first screen added is also the first route. The auth guard, session rehydration, and
catch-all are intact and switch themselves on as routes appear: the guard keys off
`meta.requiresAuth` / `meta.public` (not paths), each redirect is `hasRoute`-guarded so a missing
target can't crash navigation, and the catch-all only registers once a route named `home` exists.
Read that file's header before adding the first route.

While `routes` is empty, `corepack pnpm dev` renders a blank `<RouterView>` and vue-router logs
*"No match found for location /"* — expected in that state, but **once routes exist, that message
is a real routing bug, not the baseline.** The Storybook on port 3001 is unaffected — it doesn't
use the router.

### Boot chain

`main.ts` → (dev only) `await startMocks()` from `src/mocks/browser.ts` so the very first API call
is intercepted → `createApp(App)` → `registerPlugins()` (`src/plugins/index.ts`: vuetify, then
Pinia, then **router last** because its auth guard reads the auth store) → mount.

`App.vue` is nearly empty by design: just a `<RouterView>`. Screens are reached through the router,
not through `App.vue`.

The DS **Storybook** (`src/screens/Storybook.vue`) is **not part of the product app** — it is a
separate standalone app with its own entry (`storybook.html` → `src/storybook.ts`, which mounts
`Storybook.vue` with only Vuetify + Pinia — no router, no MSW). It runs on its own dev server on
**port 3001** via `corepack pnpm dev:storybook` (the product app stays on 3000); `corepack pnpm
dev:all` runs both at once. There is intentionally **no Storybook build script**, no product route,
and no in-app link to it, so it can never ship in the product bundle. See
`vite.storybook.config.mts`.

### How screens are composed

`src/router/index.ts` is the single place URLs map to screens. Adding a page = drop a `.vue` in
`src/screens/` + one route entry; no `App.vue` edit. Keep the landing and sign-in screens eagerly
imported; make every other screen lazy (`() => import(...)`) so each is its own chunk.

There is **no shared shell wrapper**, by design. Each screen is self-contained: it declares its own
`<v-app>` and its own chrome. If a project needs a persistent top bar or background, build it as a
component in `src/components/` and import it explicitly into each screen — the template ships none,
so nothing constrains what a given product's chrome looks like.

**Toasts are per-screen.** Each screen owns a local `<v-snackbar>` bound to a `snack` ref plus a
`notify(text, color)` helper, and passes `notify` down to child components that need it. There is
**no** app-wide snackbar and no injection contract — every screen that needs toasts declares its
own. Pre-auth screens omit the authenticated chrome; `Storybook.vue` owns its own `<v-app>` as a
standalone app.

### ⚠️ Local components are NOT auto-imported

**`unplugin-vue-components` is not installed.** Only Vuetify `<v-*>` components auto-import (via
`vite-plugin-vuetify`); every local component needs an explicit
`import X from '@/components/X.vue'`. Kebab-case tags in templates still resolve to that import.
See `src/components/README.md`.

### API seam

Screens and stores **never call `fetch`**. The layering:

- `src/api/types.ts` — the contracts. These types *are* the spec a backend team wires into. Keep
  them transport-agnostic: data shapes only.
- `src/api/client.ts` — one typed fetch wrapper; the only place that knows `BASE_URL`
  (`VITE_API_BASE_URL ?? '/api'`) and error shape. Non-2xx throws `ApiException` carrying
  `{ code, message, status }`, with a UI-safe fallback message.
- `src/api/<domain>.ts` — named callers (e.g. `auth.ts` → `login()`), so the operation set is
  discoverable in one place.
- `src/mocks/handlers.ts` — MSW implements those contracts in-memory; `src/mocks/browser.ts` boots
  the worker (needs `public/mockServiceWorker.js`, `onUnhandledRequest: 'bypass'`).

Swapping mocks → real API is a `VITE_API_BASE_URL` change; **no call site changes**. All mock data
is synthetic — **never put real user data in `src/mocks/`.** Note the dev login handler accepts
*any* credentials on purpose so the app is reachable without demo data.

Stores wrap the callers and add UI-safe error handling — see `stores/auth.ts` re-throwing network
failures as a friendly `ApiException` (never leak internals to a user-facing surface).

### State

Pinia option-stores in `src/stores/`: `auth` (user + token, persisted to `localStorage` under
`app.token`) and `app` (an empty scaffold to extend). Product state — carts, filters, wizards — is
added per project.

## Where to build new code

| Building… | Goes in | Notes |
|---|---|---|
| A **full screen / page** | `src/screens/` | One `.vue` per screen; declare its own `<v-app>` and its own chrome. Add a route in `src/router/index.ts`. Import components explicitly. |
| A **reusable component** | `src/components/` | Must be imported explicitly (see above). |
| A **chart / data viz** | `src/components/charts/` | Use a kit preset first; new presets go here on `BaseChart` + `useChartTheme.ts`. Colors/type/mark geometry are never set here — they come from `src/data/chartTheme.ts`. See the chart mandate above. |
| A **screen's dataset** | `src/data/<screen>.ts` | A typed contract + a synthetic data object. See the house rule below. |
| **API contracts / callers** | `src/api/` | `types.ts` · `client.ts` · `<domain>.ts`. |
| **Mock endpoints** | `src/mocks/handlers.ts` | Implement the contract; synthetic data only. |
| **Shared state** | `src/stores/` | Pinia. |

## Reference map

- `src/data/brand.ts` — the brand preset (`/new-project` writes it); `brand.identity` is live.
- `src/plugins/vuetify.ts` — the design control panel: theme colors (light/dark) + component
  defaults. Hot-reloads. Covers components only — **chart series colors live in
  `src/data/chartTheme.ts`** (below).
- `src/styles/_tokens.scss` — the raw radius scale (`$radius-sm…2xl`). **Edit radius here**, not in
  `settings.scss`: a Sass `with(…)` block can't reference the vars it configures, so this separate
  module is what keeps the `$rounded` scale and `$border-radius-root` coupled. Restart required.
- `src/styles/css-tokens.scss` — republishes that scale as `--radius-*` CSS custom properties for
  plain CSS and `<style>` blocks. Imported by `main.ts` + `storybook.ts` before `overrides.css`.
  **Never put a px literal in it** — it exists to remove duplicates, not add one.
- `src/styles/settings.scss` — spacing / sizing / type Sass vars, plus the Vuetify radius wiring
  (it references `_tokens.scss`; don't put radius numbers here). Restart required.
- `src/styles/overrides.css` — small documented fixes for Vuetify quirks with no prop/token lever;
  imported last in `main.ts` so it wins. Also defines `.section-panel` / `--section-radius`.
- `src/styles/sass-variables-reference.md` — the full ~764-var Sass catalog (reference only).
- `src/screens/Storybook.vue` — the DS Storybook: a standalone app on port 3001, and **the
  reference for every component and chart here**. Its *Colors* section renders the live theme, so
  any token not filed into `colorGroups` shows up under *Uncategorised*.
- `src/data/chartTheme.ts` — **the data-viz control panel**, what `vuetify.ts` is to components:
  the series colors (`categorical` / `sequential` / `diverging`) plus chart type sizes and mark
  geometry. Every chart reads it through `src/components/charts/useChartTheme.ts`, which pulls
  ink / surface / status colors *live* from the Vuetify theme instead — so those are **not**
  duplicated here. Hot-reloads. Its hexes **and the `categorical` order** are validated
  colorblind-safe against both card surfaces; no validator ships in this repo, so load the
  `dataviz` skill before retuning.
- `src/data/chartSamples.ts` — the synthetic datasets the Storybook charts render; the shape
  reference for the chart-kit props.
- `src/components/README.md` — what's in that folder and the explicit-import rule. Where it and
  this file disagree, this file wins.

## House rules

- Follow existing code style; keep code in TypeScript. Files carry substantial header comments
  explaining *why* — match that density when editing them.
- Use theme tokens + Vuetify utility classes, never hardcoded hex/px.
- **Never hardcode the product name.** Read `brand.identity` from `src/data/brand.ts` and
  interpolate it (`` `${brand.identity.shortName} Settings` ``). A find-and-replace rename must
  never be necessary.
- **Screens are dataset-driven.** Every screen renders from a typed dataset in `src/data/` (a
  contract + a synthetic data object) — no figures, labels, names, counts, or copy hardcoded in
  the template. Import the dataset, bind the template to it, and wrap mutable UI state in refs
  seeded from it. This keeps each screen a pure view, so a real backend drops in by producing the
  same shape (see the API seam in `src/api/`). Applies to *every* page as it's built.

## Documentation is the Source of Truth

**All project documentation lives in [`docs/`](docs/README.md).** This is not optional — it's how the team scales.

**When implementing:**
- Before starting: Read the relevant documentation in `docs/`
- While building: Follow patterns documented there
- When done: Update documentation if your changes affect existing behavior

**Documentation must be updated when:**
- You change the architecture (e.g., graph layers, state management)
- You modify interaction patterns (e.g., selection, highlighting, focus)
- You add new layout algorithms, designs, or features
- You discover gaps in existing documentation

**If documentation is wrong or outdated:**
1. Fix it immediately (don't work around it)
2. Commit the documentation update as part of the same task
3. Never implement against stale docs

**Documentation hierarchy (in priority order):**
1. `docs/` — project-specific architecture, design, and implementation
2. This file (`CLAUDE.md`) — codebase overview and house rules
3. Code comments — explain *why*, not *what*
4. Commit messages — record decisions and context

**Quick links:**
- **Graph system:** [`docs/architecture/`](docs/architecture/README.md)
- **Design system:** [`docs/design/`](docs/design/README.md)
- **Development:** [`docs/development/`](docs/development/README.md)
- **Full index:** [`docs/README.md`](docs/README.md)
