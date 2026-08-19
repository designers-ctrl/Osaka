# Cluster Drill-Down (Unstructured)

**Status:** implemented · **Scope:** Unstructured layout only · **Owner files:** `src/components/graphs/expanded/`

The drill-down is the focused state a user enters by clicking a Cluster on the
Unstructured canvas: the clicked cluster opens into a large translucent circular
region holding its entities (real ones first, deterministic synthetic demo fill
where the dataset is sparse), its neighbourhood stays emphasized, and the
rest of the graph dims back into context.

It is **not a layout mode.** `layoutMode` stays `'unstructured'` throughout, the
dataset is unchanged, the base render is unchanged, and the global force
simulation is never restarted. Everything is derived, drawn on top, and thrown
away again on exit.

---

## The state

One ref, in `NetworkGraphD3.vue`:

```ts
const expandedClusterIds = ref<string[]>([])
```

**Expansion is explicit only.** An id enters the list when the user clicks that
cluster and leaves it when they collapse it (clicking its region, or its chip's
×). Related clusters are NEVER auto-expanded — not for a direct cluster link,
not for an entity cross-link, not for a shared Insight. They stay collapsed as
normal `node-circle`s, fully visible (emphasized, never dimmed or disabled) and
clickable; a second region appears only when the user clicks that cluster.
While collapsed, the layer draws straight lines from entities inside an
expanded region to the related cluster's node-circle (`EntityRelation.bKind:
'cluster'`); those lines re-target to its entities when it is expanded — with
seeds derived from the SORTED cluster-id pair, so the A-side picks stay put
regardless of click order.

Nothing about the expansion is written into the graph data — no flags on nodes,
no extra nodes, no extra links. Everything else (which entities to show, which
clusters are related, what stays bright) is derived from `expandedClusterId`
plus the live `nodes` / `links` on every entry.

**Maximum simultaneous expanded clusters: 4** (`EXPANDED_CLUSTER.maxExpandedClusters`
— a TEMPORARY UI constraint). Because the list is click-ordered, the cap is a
FIFO window: expanding a fifth cluster opens it and collapses the OLDEST of the
four, always leaving the four most recently expanded. The evicted cluster
returns to a normal collapsed node-circle — visible and clickable like any
other related collapsed cluster — and the canvas emits `expand-limit` so the
screen can explain the automatic collapse ("Up to 4 clusters can be expanded at
the same time.") in its auto-dismissing snackbar.

**Enter/grow:** click a collapsed Cluster `.node-circle` (adds it).
**Shrink:** click an expanded region or its chip's × (removes just that one).
**Leave entirely:** empty canvas, `Esc`, or any non-cluster node. A data change
(Timeline filter, layout switch, unmount) tears it down.

The component emits `cluster-expand` with the id (or `null`) so the host screen
can mirror the state; `GraphWorkspace.vue` uses it for its toast and no longer
treats a cluster click as navigation to an unbuilt details route.

---

## How everything is derived from existing data

`useDrilldownModel.ts` — pure functions, no DOM, no data creation.

| Derived set | Read from |
|---|---|
| **Entities of a cluster** | the generated `{clusterId}-e{i}` entity nodes and their `{ source: clusterId, target: entityId }` links, which already exist in the dataset and are merely *filtered out* of the normal Unstructured render (`kind !== 'entity'`). Drill-down reveals them. |
| **Owning Source / Document** | the `kind: 'overlap'` ownership link. Fallback: strip the `-s<N>` suffix (same convention as `useD3Force.clusterOwnerId()`). |
| **Related clusters** | clusters joined to an expanded one through the live links: a shared Insight (`cluster → insight → cluster`) or a direct cluster↔cluster link. Ranked per region, capped at `EXPANDED_CLUSTER.maxRelatedRegions` (2) for line drawing; all of them emphasized. **They stay COLLAPSED** — context only, never auto-expanded. **Siblings of the same Source do not count** — every cluster of a hub would qualify and the whole canvas would open. |
| **Emphasized set** | clicked cluster + its entities + its Source + its directly connected Insights + the related clusters, their Sources, and the Insights the relationship actually runs through. |
| **Category chip** | the cluster's existing semantic `category` (`People`, `Messages`, `Events`, …), assigned deterministically in `graphWorkspace.ts`. No new categories are introduced; a cluster without one shows no chip. |

**Entity labels:** only entities participating in a CROSS-CLUSTER relationship
carry a persistent label — they explain why two regions are joined; purely
internal entities stay dot-only until hovered. All names are stable synthetic
display names: demo entities carry theirs from `demoEntities.ts`, and real
dataset entities (which have no `label`) get an id-seeded synthetic name from
the same category pool (`syntheticNameFor`), so no raw ids leak into the canvas
and nothing changes between renders. Labels sit on the entity's outward side
(start-anchored right half, end-anchored left half) so they point out of the
dense disc instead of colliding across its centre.

**Strict dot containment:** after every layout step that can move a dot
(packing offsets, the per-frame external angle resolution), the renderer
re-asserts `hypot(dx, dy) ≤ region.radius − renderedDotRadius −
containInset / zoomScale` for every entity — the RENDERED (zoom-inflated) dot
radius, plus a constant-screen inset off the dashed border. A violating dot is
projected back along its own angle, so external entities keep their
perimeter-bias direction; internal placements restart from their packed
offsets each pass, so a low-zoom clamp relaxes on zoom-in. No entity dot ever
crosses the region border, at any zoom.

**Label collision pass:** labels never overlap each other or the chip. After
entity positions are final (every `update()`), a deterministic relaxation pass
re-slots each label around its OWN dot — outward side, inward side, above,
below, then vertically nudged variants — taking the first slot that stays
inside the region circle (where possible) and keeps `entityLabel.collisionPad`
clear of the chip and of every label already placed, measured with the text's
actual `getBBox()` at the current font size (never character-count estimates).
Placement is globally aware (one absolute-coordinate list across all expanded
regions, so labels reaching across a seam can't collide either) and ordered
cross-linked-first then by entity id, so it is stable across renders. A label
with no clear slot in the whole ladder FADES (`labelSuppressed`, consumed by
the opacity pass) instead of stacking — and since higher-priority labels place
first, the faded one is always the lower-priority of the pair. The hovered
entity's own label always shows: hover empties the label field around it.
Entity dots are never moved to solve text overlap.

**Demo entities:** the generated dataset gives most clusters only 1–4 real
entities — too sparse for the reference density. When a region opens below its
deterministic target (`demo.targetMin + hash % targetSpread`, ≈12–20), the
LAYER fills it with clearly-synthetic demo entities named after the cluster's
semantic category (People → invented person names, Messages → topic snippets,
Events → event names, …) from `demoEntities.ts`. They are plain layer-local
objects — never pushed into the graph's nodes, links, or the force simulation.
Real dataset entities carry no `label`, so their hover label falls back to the
real id; demo entities show their synthetic names.

---

## Geometry

- **Region radius** scales with the region's rendered entity count (real +
  demo fill) on a sqrt curve, clamped between `minRadius` (80) and `maxRadius`
  (180) — substantially larger than a collapsed cluster node, whose size is
  untouched.
- **Region centre** starts at the cluster's own position, then is pushed
  *outward* along the Source→cluster axis until the circle clears the Source by
  `hubClearance`. Clusters orbit their Source closely, so without this the
  Source would end up *inside* the expanded circle — it must stay visible,
  beside it. Recomputed every tick, so dragging a Source carries its region.
- **Region separation:** overlapping regions are pushed apart, the primary
  moving least.
- **Source re-anchor (display only):** the two steps above are not enough on
  their own — the separation pass runs *after* the `hubClearance` push and can
  slide a region back over a Source, and a region belonging to a *different*
  hub is never checked against this Source at all. So once every centre is
  final, `computeHubDisplayPositions()` checks each Source against every
  region: if it falls within `region radius + Source radius + hubDisplayGap`
  (24), it is **drawn** at exactly that distance along the same centre→Source
  direction, preserving its angular relationship to its cluster. Its circle,
  icon, label and every base link/endpoint terminating on it are re-anchored
  together, so lines still meet its visible edge.

  ⚠️ Render-time only: the node's simulation coordinates are never written, so
  the global force layout, Normal Unstructured mode and Structured mode are
  unaffected, and collapsing restores the graph exactly.
- **Entity packing** is a *local* pass over that one cluster's entities,
  stepped a fixed number of ticks and clamped inside the perimeter. It never
  touches the global simulation and never runs on other nodes. Placement is an
  ORGANIC OUTER SCATTER, not a disc fill and not a clean ring:
  - free entities fill the WHOLE usable disc (**25–90 % of radius**,
    `entity.ring`), at even angular slots around the full 360° with an
    id-hashed, area-uniform radius per entity — a balanced fill, not a centre
    blob and not an outer rim. The radial force targets each entity's OWN
    radius, so the hashed variation survives the settle;
  - cross-linked entities sit **farther out (80–95 %, capped by `safeInset` on
    small regions)** on the side facing their external target, each at its own
    id-seeded depth (`externalBias.radiusFraction`, held ± `radiusTolerance`),
    with the bucket fan widened by an id-seeded factor (`angleJitter` — an
    expansion, never a rotation) so the group is not a stamped arc;
  - the renderer's live angle resolution enforces a **minimum angular gap**
    (`slotSpacing`) across a region's whole external group, because model-side
    offsets cannot prevent live-resolved angles from converging;
  - id hashes pass through an avalanche mixer (`hashFraction`) — the sibling
    ids this layer generates differ by one character, and the raw rolling hash
    mapped them to near-identical fractions;
  - the centred chip's reserved no-entity box is the chip's SCALED footprint
    (`chip.reserveScale` — the renderer draws the chip at `chipScale` ≥ 1.1,
    while the packing runs once with no camera knowledge; an unscaled reserve
    measurably let one entity under the drawn chip).

**Region glass:** the expanded circle carries a two-layer blur
(`region.glass`), because SVG cannot blur its own backdrop: an HTML layer
under the `<svg>` (clipped to the region circles, `backdropBlurPx`) blurs the
page's dot grid, and an SVG `feGaussianBlur` backing disc behind each circle
(`backingBlur`) softens the region against the graph content. The dashed
perimeter and translucent fill draw crisp on top, and the backing disc dims in
lockstep with its circle during hover isolation.

Determinism: seeds are closed-form, d3-force uses its own seeded LCG, and
`Math.random()` is banned in this repo — the same click produces the same
picture on every reload. (The re-anchored lines' absolute coordinates still track
the base force layout, which settles fractionally differently per load; that is
pre-existing base-graph behaviour, not drill-down state.)

---

## Layout invariants (Unstructured)

Reusable rules the layout upholds — they also live, designer-facing, in
`.claude/skills/frontend design/SKILL.md` → *Unstructured layout invariants*:

1. links are always straight (single segment, boundary-trimmed);
2. nodes move to protect line-of-sight — the layout adjusts, lines never bend;
3. Source clusters use orbital positioning (`forceClusterOrbit`);
4. externally connected Cluster nodes face their target/Insight;
5. multi-group Insights pull their related groups closer (`crossGroup` links);
6. unrelated groups must not occupy the space between Insight-connected groups;
7. expanded Cluster bounds act as collision envelopes (`radius + safetyGap`);
8. nearby Insights/Sources move away from expanded envelopes;
9. multiple expanded clusters connected through one Insight form a readable,
   non-overlapping composition, the Insight approximately between them —
   region pairs sharing an Insight separate by `sharedInsightSeam`, wide
   enough to fit the Insight plus envelope clearance on both sides (with the
   normal `regionGap`, "between the clusters" and "outside every envelope"
   are geometrically incompatible and the Insight oscillates in the seam);
10. expanded entity labels appear only for cross-cluster connected entities.

### The envelope force (invariants 7–9)

`forceExpandedEnvelope(model, nodeById, nodeRadiusOf)` in
`useDrilldownModel.ts` is a custom D3 force in the same pattern as
`useD3Force`'s `forceClusterOrbit`, registered on the EXISTING global
simulation by `NetworkGraphD3.vue` when a drill-down opens and set to `null`
when it closes — both with a gentle `alpha` reheat
(`envelope.reheatAlphaEnter` / `reheatAlphaExit`), so:

- while expanded, every simulated node outside the composition is softly
  pushed out of each region's `radius + its own radius + safetyGap` — the
  ACTUAL expanded bounds, recomputed from live positions every tick;
- the expanded clusters and their owning hubs are excluded (they anchor the
  regions; each region clears its own hub via `hubClearance`);
- Insights joining ≥2 regions get an opposing centroid pull
  (`betweenStrength`): the push keeps them out of every circle, the pull keeps
  them BETWEEN the clusters they connect;
- on collapse the force disappears and the reheat lets the graph settle back
  naturally — global spacing is never permanently changed. The envelope
  resolves overlap POSITIONALLY: a capped share of the overlap per tick
  (`pushStrength` × `maxStep`), not alpha-scaled, so it converges within any
  remaining tick budget — a velocity push settled into an equilibrium inside
  the envelope because the opposing orbit/link pulls only decay with alpha.
  User-fixed (dragged) nodes are exempt; the between-pull stays a gentle
  alpha-scaled velocity nudge.

---

## Connections

**Graph connection geometry (project design rule):** every connection is ONE
STRAIGHT, SINGLE-SEGMENT line between its two resolved endpoints — no Béziers,
no bundling, no waypoints, no elbows. The rule is recorded as an Osaka
graph-design constraint in `.claude/skills/frontend design/SKILL.md` and
`.claude/skills/vuetify-ds/SKILL.md`. Overlap readability is solved with
positioning, opacity, layering, and hover isolation — never curvature.

- **Membership fan** (entity → its Source): one straight `<line>` per revealed
  entity, trimmed from the dot edge to the Source's node boundary. Real
  entities always draw theirs (their cluster→entity link exists in the data);
  synthetic ones are hash-gated so the fan stays a fan.
- **Entity ↔ entity relationships**: straight `<line>`s, dot edge → dot edge,
  **cross-region only**. The dataset has no entity-level links, so these are
  sparse demo relationships — layer-local, deterministic per reload.

  ⚠️ **Sibling rule:** two entities of the *same* parent cluster never draw a
  connection to each other. The region containing them both already states
  that they belong together, so a line between them restates it, and at region
  density it hides the cross-cluster relationships that do carry meaning.
  Allowed instead: entity → entity in another cluster, entity → Insight →
  entity/cluster, and the other cross-cluster paths.

  This is enforced as a **filter in the model** (`sameParentCluster()` in
  `useDrilldownModel.ts`), not as an opacity treatment — a forbidden pair never
  enters `entityRelations`, so no element exists for it and no later state
  (hover, focus, a future emphasis mode) can reveal one. The check is on the
  entities' actual parent cluster ids, so it holds for real graph links too,
  not only for how the demo pairs happen to be generated.
- **External links** that the base layer drew into a now-expanded cluster are
  hidden there (opacity 0) and re-drawn as straight `<line>`s re-anchored on
  the region *perimeter* / node boundary (`trimmedSegment()` in the model).
- **Insight links anchor to an entity, not the circle**: when an expanded
  region's link partner is an Insight, the region end lands on ONE
  deterministically chosen entity dot inside the region (id-hash of the
  insight+cluster pair → `RoutedLink.sourceAnchorEntityId` /
  `targetAnchorEntityId`) — an Insight is derived from specific signals, so it
  reads `Insight → entity`, never `Insight → whole cluster`. A COLLAPSED
  cluster keeps its normal node-level Insight link, drawn by the base layer.
- Link **topology is never modified** — only where existing segments end.

## Emphasis / dimming

`applyDrilldownEmphasis()` writes **opacity only** across the base render:
node circles, both link layers, link endpoints, source/document labels and
icons. Nothing is removed from the DOM and no geometry is recomputed, so the
unrelated graph stays visible behind the focused area as context.

The Source of an expanded cluster stays fully visible, and so do the Source's
OTHER clusters: they are emphasized (an emphasized hub with dimmed satellites
would read as a broken neighbourhood) but stay COLLAPSED, clickable, and are
never auto-expanded — no relation lines are drawn to them; being lit is what
they get.

Two exceptions: the expanded clusters' own `.node-circle`s are hidden
(`opacity 0`) and stop taking pointer events — the large regions are the marks
that stand in for them. `clearDrilldownEmphasis()` restores the base values.

While the drill-down is open, the base hover highlight is suppressed
(`handleNodeHover` returns early) so the two emphasis systems can't fight.
Hover inside the focused view is owned by the layer, and by ONE canonical
calculation: `deriveHoverActiveSet(model, entityId)` (same isolation philosophy
as the Structured renderer's hover). It returns the hovered entity + its
directly connected entities (any region), the regions/chips containing them,
and the base nodes genuinely on the relationship path — the active regions'
Sources, Insights whose routed link anchors to an active entity, and collapsed
clusters the active entities line to. Every surface consumes that one set;
no renderer computes its own opacity rules:

- active entity dots + labels stay full; all other dots/labels dim;
- only relation lines whose BOTH endpoints are active keep the hover opacity;
- routed Insight lines stay only when anchored to an active entity;
- inactive region circles and chips drop to `hover.regionOpacity`/`chipOpacity`;
- the base graph is re-dimmed via `applyHoverBaseDim` — everything outside the
  path (including the resting emphasis's Source siblings and related collapsed
  clusters) drops to the disabled opacity.

`mouseleave` re-runs `applyDrilldownEmphasis`, restoring the exact pre-hover
expanded state (verified byte-identical).

---

## Category chip

The expanded cluster's identity chip reads `[ • Name  × ]`: an OPAQUE pill
(`chip.fill`) whose width HUGS the measured label (`getComputedTextLength` +
paddings + dot + close glyph — never fixed), anchored at a FIXED point on the
perimeter: the top-left diagonal (`chip.angle` = −135°), pushed
`chip.anchorOffset` (14) further out so it hangs just outside the dashed
boundary and never covers the entity content area (entities live inside
`radius − innerMargin`).

The anchor is deliberately constant — not derived from the Source direction,
the packing, or anything else that moves — so the chip holds its place while
the graph settles. Collision protection runs the other way round: an entity
label that would hit the chip's box (inflated by `chip.collisionPad`) FLIPS to
its other side, back into the safe inner region; the chip itself never moves. The × is the Carbon `close` glyph (the same icon the
app's icon layer maps to the `close` key), with its own padded hit area,
hover/focus states, and keyboard activation; `pointerdown` is swallowed so the
× can never start a canvas pan or node drag. Clicking it clears
`expandedClusterId` and restores the normal Unstructured view. Only the primary
region's chip carries the ×; related chips are context.

## Camera

On enter, the focused neighbourhood is fitted with padding, but the scale is
**clamped to a band around the normal fit-to-view transform**
(`minScaleFactor` … `maxScaleFactor`), so the surrounding graph never leaves the
canvas. The pre-drill-down transform is stored and restored on exit. The
first-load settle-follow refit (`followInitialFit`) is switched off on entry;
the normal initial fit behaviour is untouched.

---

## What this feature must never do

- switch `layoutMode`, or touch Structured mode / its renderer;
- modify graph data generation, the Source data, or the global link dataset;
- create duplicate entity nodes or synthetic entities/links;
- restart or perturb the global force simulation;
- remove unrelated groups from the DOM;
- expand every cluster on the canvas.

---

## Files

| File | Role |
|---|---|
| `expanded/expandedTokens.ts` | every number and colour of the layer (radii, opacities, curvature, camera clamps). Nothing here is read by the base renderer. |
| `expanded/useDrilldownModel.ts` | derivation + pure geometry (membership, related clusters, emphasis, packing, region centres, path builders). |
| `expanded/useDrilldownRenderer.ts` | the D3 layer (`g.expanded-layer`) + the base dim/restore passes. |
| `NetworkGraphD3.vue` | owns `expandedClusterId`, enter/exit, click & Esc wiring, and calls `update()` from the existing tick and zoom handlers. |
