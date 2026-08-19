/**
 * src/components/graphs/expanded/expandedTokens.ts
 *
 * Tokens for the Unstructured graph's CLUSTER DRILL-DOWN state — the focused
 * view a user enters by clicking a Cluster `.node-circle`.
 *
 * Same contract as graphTokens.ts: this file owns every number and every
 * colour of the drill-down layer, and the renderer owns none of them. It is a
 * SEPARATE token set on purpose — the drill-down is an additional focused
 * layer over the normal Unstructured render, never a replacement for it, so
 * nothing here may be read by (or leak into) the base renderer or Structured.
 *
 * Colours are expressed against the existing purple Cluster identity
 * (NODE_STYLING.cluster in graphTokens.ts). The expanded region keeps that
 * identity — dashed purple perimeter, translucent purple fill — only larger,
 * because it IS the same cluster, drawn at drill-down scale.
 *
 * ⚠️ GRAPH CONNECTION GEOMETRY (project-wide design rule): every connection in
 * this layer is a STRAIGHT, SINGLE-SEGMENT line between its two resolved
 * endpoints. No Béziers, no bundling, no waypoints, no elbows. Readability
 * under many overlapping lines is solved with positioning, opacity, and hover
 * isolation — never with curvature. See `.claude/skills/frontend design` and
 * `.claude/skills/vuetify-ds` (Osaka graph-design constraints).
 */

/** The purple the Cluster identity is drawn in — mirrors NODE_STYLING.cluster.stroke. */
const CLUSTER_PURPLE = '#9D7EEA'

export const EXPANDED_CLUSTER = {
  /**
   * The large translucent circular region the clicked Cluster becomes.
   *
   * Radius scales with the region's ACTUAL rendered entity count on a sqrt
   * curve, so a cluster with twice the entities is not twice as wide:
   *   radius = clamp(minRadius, maxRadius, baseRadius + perEntity × √count)
   *
   * Sized for the drill-down's dense population (roughly 12–26 entity points
   * per region, see `demo` below) — substantially larger than a collapsed
   * cluster node, per the reference. The collapsed size is untouched.
   */
  region: {
    minRadius: 80,
    // Headroom for the dense entity tier (see demo.denseMin/denseSpread): at
    // ~42 entities the sqrt curve asks for ~195, so a 180 cap made every
    // dense region saturate to the same size. 200 keeps the radius genuinely
    // count-adaptive across the whole range.
    maxRadius: 200,
    baseRadius: 26,
    perEntity: 26,

    /**
     * A cluster orbits its Source at ~50 data units, so a region drawn at
     * drill-down scale would swallow its own Source node. The region is
     * therefore pushed OUTWARD along the hub→cluster axis until its near edge
     * clears the hub by this much: the cluster still expands from where it sat,
     * and the Source stays visible just outside the circle, as in the reference.
     */
    hubClearance: 30,
    /** Minimum gap kept between two expanded regions when they would overlap. */
    regionGap: 18,
    /**
     * Wider gap between two expanded regions that SHARE an Insight: the seam
     * must fit the Insight node plus the envelope safety clearance on both
     * sides, otherwise "keep the Insight between its clusters" and "keep the
     * Insight outside every envelope" are geometrically incompatible and the
     * Insight oscillates. ≈ 2 × (max insight radius + envelope.safetyGap).
     */
    sharedInsightSeam: 110,

    /**
     * Visible gap between a Source's edge and an expanded region's boundary,
     * used by the DISPLAY-ONLY Source re-anchor (computeHubDisplayPositions).
     *
     * `hubClearance` above pushes the REGION off its hub, but the pairwise
     * region separation that runs after it can slide a region back over a
     * Source — and a region belonging to another hub was never checked
     * against this one at all. So the Source is re-anchored as the last step,
     * once every region centre is final: if it would sit inside a circle it is
     * moved out along the same centre→Source direction to
     * `region radius + Source radius + this gap`.
     *
     * Render-time only. The re-anchor never touches the node's simulation
     * coordinates, so the base force layout, Normal Unstructured mode and
     * Structured mode are all unaffected, and collapsing restores the graph
     * exactly.
     */
    hubDisplayGap: 24,
    /**
     * Exclusion clearance between a re-anchored Source/Document hub and every
     * OTHER visible base node (insights, collapsed clusters, other hubs):
     * the hub keeps `hub radius + obstacle radius + this` distance, so it can
     * never sit on top of a neighbouring node after region clearance moves it.
     */
    hubNodeClearance: 14,

    fill: 'rgba(157, 126, 234, 0.10)',
    /** Contextual (related) regions sit one emphasis step below the primary. */
    fillRelated: 'rgba(157, 126, 234, 0.05)',

    /**
     * GLASS treatment for the expanded circle. Two layers, because SVG cannot
     * blur its own backdrop (measured in the node-glass work: `backdrop-filter`
     * is inert on SVG shapes and `feGaussianBlur in="BackgroundImage"` never
     * shipped):
     * - `backdropBlurPx` — real backdrop blur of the page background (dot
     *   grid) behind the region, via a clipped HTML layer under the <svg>,
     *   exactly like NODE_GLASS but with its own, stronger radius.
     * - `backingBlur` — an SVG-filtered backing disc BEHIND the region circle
     *   (feGaussianBlur on its own purple fill), which softens the region
     *   against the graph content the HTML layer cannot reach. The crisp
     *   dashed perimeter and the translucent fill draw unchanged on top.
     */
    glass: {
      backdropBlurPx: 6,
      backingBlur: 8,
    },

    stroke: CLUSTER_PURPLE,
    /** Same dashed perimeter language as the normal cluster node. */
    strokeDasharray: '6,5',
    strokeWidth: 1,
    strokeOpacity: 0.7,
    strokeOpacityRelated: 0.34,
  },

  /**
   * The Entity points revealed inside a region. Entities are normally not
   * rendered at all in Unstructured mode, so these sizes are the drill-down's
   * own — they are not the base `NODE_DIAMETERS.entity`, which is sized for a
   * node standing alone on the canvas rather than packed inside a container.
   */
  entity: {
    radius: 4,
    /** On-screen floor (px): entity points stay pickable when zoomed out. */
    minVisualRadius: 2.6,
    /**
     * ON-SCREEN px kept between a dot's outer edge and the region's dashed
     * border by the strict containment clamp (useDrilldownRenderer): after
     * every layout/relaxation step, `hypot(dx, dy) ≤ region.radius −
     * renderedDotRadius − containInset / zoomScale` is re-asserted, so no
     * entity dot can ever cross the circle — at any zoom level.
     */
    containInset: 2,
    /** Minimum extra separation enforced by the local packing pass. */
    collidePadding: 8,
    /**
     * SPREAD: the packing's effective collision radius grows to
     * `inner × spreadFill / √count` when that beats the minimum above, so the
     * entities push each other outward and OCCUPY the disc instead of piling
     * in the centre. Count-adaptive — a dense region tightens gracefully — and
     * still organic: golden-angle seeds + collision, never a grid.
     */
    spreadFill: 0.5,
    /**
     * LABEL-AWARE COLLISION: entities with a persistent (cross-cluster) label
     * add half their ESTIMATED text advance to their collision radius —
     * labelled entities sit farther apart, so labels can neither overlap each
     * other nor run across neighbouring dots, while each label stays hard
     * against its own entity. Estimated width = chars × fontSize × estCharWidth,
     * and the extra is capped so one long name cannot hollow out the disc.
     */
    labelCollideFactor: 0.5,
    labelCollideMax: 26,
    estCharWidth: 0.62,
    /** Entities stay this far inside the perimeter so none straddles the edge. */
    innerMargin: 16,
    /** Fixed tick count for the local packing pass — deterministic, no animation. */
    settleTicks: 300,
    /**
     * Weak pull to the region centre — just enough that the packed cloud stays
     * centred. Deliberately small: a stronger pull re-compressed the entities
     * into the central pile the spread exists to prevent.
     */
    centerStrength: 0.006,
    /**
     * OUTER-ANNULUS CONSTRAINT for entities that carry a CROSS-CLUSTER
     * relationship. Such an entity is the endpoint of a line that leaves the
     * region, so it belongs near the perimeter FACING its partner — otherwise
     * the line starts deep inside the disc and crosses the whole cluster on
     * its way out.
     *
     * This is a hard constraint, not a nudge: the packing projects these
     * entities back into the annulus after EVERY settle tick (and once more
     * after the last one), so collision can spread them tangentially but can
     * never pull them back toward the centre.
     *
     *   minRadius = regionRadius × minRadiusFactor
     *   maxRadius = regionRadius − safeInset
     *
     * `safeInset` is ≥ `innerMargin` on purpose, so the final containment
     * clamp (which pulls anything past `innerMargin` back) can never fight
     * this constraint.
     */
    /**
     * FREE-ENTITY RING — where entities WITHOUT a cross-cluster relationship go.
     *
     * They used to pack the disc from the centre out (a sqrt-filled spiral plus
     * a centring pull), which read as a dense blob in the middle of a mostly
     * empty circle. They are now seeded into an outer ANNULUS at even angular
     * slots around the full 360°, so the region reads as filled around its
     * whole circumference with the centred chip sitting in clear space.
     *
     * The band is a hard constraint, re-asserted after every settle tick (the
     * same treatment `externalBias` gets): collision may slide an entity
     * tangentially around the ring, never back toward the centre.
     */
    ring: {
      /**
       * 0.25–0.9: free entities fill the WHOLE usable disc, not just an outer
       * rim. The centred chip's reserved box keeps the middle clear, the
       * area-uniform hashed radius (below) spreads them evenly over the disc's
       * area, and collision guarantees the minimum spacing — together that
       * reads as a balanced fill rather than either a centre blob or a ring.
       * (Externally-connected entities sit farther out, in their own
       * `externalBias` band, facing their targets.)
       */
      minRadiusFactor: 0.25,
      maxRadiusFactor: 0.9,
      /**
       * Per-entity radial variation, from an id hash — NOT a fixed set of
       * strata. A few repeating radii still read as concentric rings; an
       * id-seeded radius per entity reads as an organic scatter that happens
       * to favour the outer area. Deterministic: same entity, same radius.
       *
       * Sampling is area-uniform across the annulus
       * (`r = √(rMin² + u·(rMax² − rMin²))`), which spreads the dots evenly
       * over the band's AREA rather than over its radius — so the outer part,
       * being larger, naturally holds more of them without any extra weighting.
       */
      radialHashMod: 997,
      /** Gentle pull toward the band's mid-radius; the clamp does the rest. */
      strength: 0.05,
      /**
       * If a region's population cannot fit the band at the readability
       * spacing, the band's INNER edge widens inward — down to this floor, and
       * no further — rather than forcing dots to overlap. Keeps the dense tier
       * (up to ~42 entities, see `demo.denseMin/denseSpread`) legible without
       * collapsing back into a centre blob.
       */
      minRadiusFloor: 0.2,
      /** Loose-packing allowance when testing whether the band can fit them. */
      fitSlack: 1.5,
      /**
       * TANGENTIAL DE-OVERLAP passes, run after the settle.
       *
       * The band clamp and the `externalBias` arc clamp both re-assert
       * themselves after every tick, which can out-vote collision: a pair it
       * pushed apart gets snapped back, and two dots end up closer than their
       * own diameter (measured: a 6.9px centre distance between 4px-radius
       * dots — an actual overlap). This pass separates such pairs by ROTATING
       * them apart around the region centre, so each keeps its radius (the
       * band stays satisfied) and biased entities stay on their arc.
       *
       * The floor it enforces is the readable dot gap —
       * `2 × radius + collidePadding` — not the full collision radius, which a
       * dense band cannot satisfy and which would make the pass churn.
       */
      sepPasses: 24,
    },
    externalBias: {
      /**
       * Cross-linked entities sit FARTHER OUT than free ones (whose band is
       * 55–90%): their line leaves the region, so they belong hard against the
       * perimeter on the side facing their partner.
       *
       * ⚠️ The outer bound is `min(maxRadiusFactor · r, r − safeInset)`. The
       * safe inset wins on small regions — at r = 116 it caps the band at
       * ~0.85r — because a dot pushed past `r − safeInset` would straddle the
       * dashed boundary, and the containment clamp would fight the constraint.
       * So this reads as "95% where the region is big enough, the safe inset
       * otherwise", and the band stays outside the free ring either way.
       */
      minRadiusFactor: 0.8,
      maxRadiusFactor: 0.95,
      safeInset: 18, // ≥ innerMargin (16)
      /** Half-width (radians) of the arc an entity may drift across. */
      arcSpread: 0.62, // ~35°
      /** Seeded angular spacing between entities sharing one direction. */
      slotSpacing: 0.17, // ~10°
      /**
       * Per-entity variation so a group facing one way reads as a loose
       * cluster rather than a perfect arc:
       * - `angleJitter` — id-seeded WIDENING of a bucket's slot spacing (a
       *   fraction, so 0.09 = up to +9%). An expansion, never a rotation: it
       *   can only increase the gaps inside a fan.
       * - `radiusTolerance` — the projection pins each entity NEAR its own
       *   id-seeded radius (± this, in band fractions) instead of anywhere in
       *   the band. Without it the settle pushed every one of them onto the
       *   outer cap, which is exactly the perfect arc this avoids.
       */
      angleJitter: 0.09, // ~5°
      radiusTolerance: 0.12,
    },

    opacity: 0.95,
    opacityRelated: 0.72,
    /** Entities unrelated to the hovered entity, inside the expanded view. */
    dimOpacity: 0.14,
  },

  /**
   * Demo population. The generated dataset gives most clusters only 1–4 real
   * entities — too sparse for the drill-down reference. When a cluster's real
   * entity count is below the deterministic target, the LAYER (never the graph
   * data) fills the region with clearly-synthetic demo entities named after the
   * cluster's semantic category. See demoEntities.ts for the naming rules.
   */
  /**
   * ENTITY ↔ ENTITY relation lines. Dashed per the Figma reference: an
   * entity-level relationship is DERIVED, so it must not use the same solid
   * line language as ingested structure (Source → Cluster) or the Insight
   * connections — both of which keep their existing styling. Straight,
   * single-segment geometry is unchanged; only the dash pattern is new.
   */
  entityRelation: {
    /**
     * ROUND DOTS, not dashes: a 1-unit dash with a round linecap renders as a
     * dot of the stroke's own diameter, and the 6-unit gap spaces them out —
     * • • • • • rather than — — —. The renderer already sets
     * `stroke-linecap: round`, which is what turns each dash into a dot.
     */
    strokeDasharray: '1,6',
    strokeLinecap: 'round',
  },

  demo: {
    /**
     * ⚠️ The per-region entity POPULATION tiers moved to the DATASET
     * (src/data/entityFill.ts → ENTITY_POPULATION): the graph now generates
     * the full deterministic entity set once, shared by both modes, and the
     * drill-down simply shows what the dataset holds — no layer-local fill.
     */
    /**
     * Cross-region entity link pairs drawn between two expanded regions.
     *
     * The ONLY entity↔entity relationships this layer draws. Pairs within a
     * single cluster are deliberately absent — siblings never connect to each
     * other (the region they share already says they belong together), so
     * there is no intra-region density knob to tune here.
     */
    crossLinksPerRegionPair: 3,
  },

  /**
   * COLLISION ENVELOPES. While the drill-down is open, each expanded region is
   * a temporary occupied area: a custom force on the EXISTING global
   * simulation pushes nearby Insights, Sources/Documents and non-expanded
   * Clusters out of `region.radius + node radius + safetyGap` — the actual
   * expanded bounds, never a fixed offset. The force is registered on enter
   * and removed on collapse, so global spacing is only ever adjusted while a
   * cluster is expanded and the graph settles back naturally afterwards.
   */
  envelope: {
    /** Clearance kept between an envelope edge and any outside node's edge. */
    safetyGap: 28,
    /**
     * Share of the (capped) overlap resolved per tick. Deliberately NOT
     * alpha-scaled — exactly like d3.forceCollide's correction — so the
     * envelope keeps winning as the reheat cools while every opposing force
     * (orbit, links, charge) decays with alpha. An alpha-scaled push settled
     * into an equilibrium INSIDE the envelope.
     */
    pushStrength: 0.7,
    /** Per-tick overlap-resolution cap: nodes slide out, never teleport. */
    maxStep: 14,
    /**
     * Synchronous warm-start when the force is registered: the envelope
     * resolution is iterated to convergence (bounded) BEFORE the visual
     * settle, so clearance never depends on how many ticks the reheat has
     * left before alphaMin stops the simulation. The per-tick force then only
     * maintains what the warm-start established.
     */
    presettleIterations: 240,
    /**
     * Insights connected to ≥2 expanded regions are eased toward the centroid
     * of those regions, so a shared Insight reads as sitting BETWEEN the
     * clusters it joins (the envelope push keeps it out of both circles, the
     * two together park it in the gap).
     */
    betweenStrength: 0.06,
    /** Gentle LOCAL settle when the force is added (enter) and removed
     *  (collapse) — never a full alpha(1) relayout. */
    reheatAlphaEnter: 0.2,
    reheatAlphaExit: 0.15,
    /**
     * LOCALITY: while a drill-down is open, every simulated node farther than
     * this from the clicked cluster is pinned (fx/fy) at its current spot, so
     * the settle can only rearrange the immediate neighbourhood — expanding a
     * cluster must never make the whole graph jump. The clicked cluster and
     * its hub are pinned too (the composition's anchor). All pins are
     * released on collapse.
     */
    localRadius: 520,
  },

  /**
   * Entity labels stay subtle: only entities participating in a CROSS-CLUSTER
   * relationship carry a persistent name (they explain why two regions are
   * joined); everything else is a dot until hovered. Font size holds a minimum
   * ON-SCREEN size the same way the base source/document labels do.
   */
  entityLabel: {
    /** Persistent label opacity for cross-cluster connected entities. */
    persistentOpacity: 0.82,
    fontFamily: 'Google Sans Flex',
    fontSize: 9,
    minVisualFontSize: 11,
    fontWeight: 500,
    offsetX: 7,
    /** Gap kept between the entity point and the start of its label. */
    gap: 3,
    ink: '#FFFFFF',
    opacity: 0.95,
    textStroke: 'rgba(0, 1, 1, 0.80)',
    textStrokeWidth: 0.5,
    /**
     * Minimum spacing enforced between two label bounding boxes (and between
     * a label and the chip) by the deterministic collision pass in
     * useDrilldownRenderer — labels that cannot keep this gap in any candidate
     * slot are faded out rather than stacked.
     */
    collisionPad: 4,
  },

  /**
   * The category chip that keeps the expanded Cluster's identity visible:
   * `[ • Name  × ]`. The background is OPAQUE (the chip floats over lines and
   * dots, and a translucent pill turned into visual noise) and the width HUGS
   * the measured label — never fixed. The × is the Carbon `close` glyph, the
   * same icon the rest of the app uses via src/icons/carbon.ts.
   */
  chip: {
    fontFamily: 'Google Sans Flex',
    fontSize: 10,
    minVisualFontSize: 11,
    fontWeight: 500,
    paddingX: 8,
    height: 18,
    dotRadius: 1.7,
    /** Gap between the leading dot and the label text. */
    gap: 5,

    /**
     * ── CHIP COLOURS: DS TOKEN NAMES, NOT VALUES ──────────────────────────
     * A solid `graph-accent` pill carrying black marks, per the reference —
     * no translucent purple ground anywhere.
     *
     * These are theme TOKEN NAMES, resolved live against the Vuetify theme by
     * the renderer (`ctx.themeColor`), so the chip follows the design system
     * instead of carrying its own copy of a hex. `graph-accent` /
     * `on-graph-accent` are declared in `src/plugins/vuetify.ts`; the two
     * button tokens already existed there.
     *
     * Primary and contextual chips are styled identically: the pill is solid
     * at 100%, and the emphasis difference between regions is carried by the
     * region fill and perimeter, which already express it.
     */
    fillToken: 'graph-accent',
    /** Dot + label: black on the accent. */
    inkToken: 'on-graph-accent',
    /** Optional hairline so the pill reads as an edge on a bright region. */
    borderToken: 'button-white-10',
    borderWidth: 1,
    /**
     * The × glyph, in the DARKEST colour the design system offers:
     * `on-graph-accent` is opaque `#000000`, declared identically in light and
     * dark, and its own definition in `vuetify.ts` names the close glyph as a
     * consumer ("everything sitting ON the accent … is black"). It is the same
     * token the chip's dot and label already use, so no new colour and no
     * hardcoded black enters the layer.
     *
     * Replaces `button-black-b-40` (black at 40% alpha) — the darkest token
     * available, but only 40% of it, which is why the × read as washed out.
     * The alpha that token used to supply now comes from `close.opacity`.
     */
    closeToken: 'on-graph-accent',
    /**
     * ── CENTERED ANCHOR ───────────────────────────────────────────────────
     * The chip sits INSIDE the region, anchored by its leading dot: the
     * `expanded-chip-dot` is placed exactly at the circle's centre and the
     * pill extends rightward from it. Deliberately CONSTANT — nothing
     * content- or packing-derived — so it holds the same spot on every
     * region and while the graph settles. The whole chip area is a reserved
     * NO-ENTITY zone: the packing pass (useDrilldownModel.packEntities)
     * pushes entity dots out of the chip's rectangle, and entity labels
     * yield around the same box in the renderer.
     */
    /**
     * Maximum rendered width (px at scale 1) of the chip label. Longer
     * category names truncate with an ellipsis instead of stretching the
     * pill indefinitely.
     */
    labelMaxWidth: 180,
    /**
     * Estimated advance per character (× fontSize) for the MODEL-side chip
     * width estimate — the packing pass reserves the chip's rectangle before
     * any text is measured in the DOM. Same estimator convention as
     * entity.estCharWidth.
     */
    estCharWidth: 0.62,
    /**
     * How much LARGER than its unscaled geometry the packing's reserved
     * no-entity box is drawn (a multiplier on the whole box, around the same
     * centre-dot anchor the renderer uses).
     *
     * The chip renders at `chipScale = max(fontSize, minVisualFontSize/zoom) /
     * fontSize` — ≥ 1.1 at zoom 1 and larger when zoomed out — while the
     * packing runs once, with no camera knowledge. An unscaled reserve left
     * the drawn chip's right edge ~7px past the reserved area at the
     * drill-down's own camera (measured: one entity centred inside the drawn
     * chip). 1.6 covers every scale down to zoom ≈ 0.69, the bottom of the
     * drill-down's clamped camera band in practice.
     */
    reserveScale: 1.6,
    /**
     * Padding added around the chip's box when testing whether an entity
     * label would run into it. Entity labels yield (they flip to their other
     * side, staying inside the safe inner region); the chip never moves.
     */
    collisionPad: 6,
    /**
     * Vertical rule between the label and the × — the seam that separates the
     * chip's identity from its action.
     *
     * Colour is NOT its own token: it reuses `borderToken` above, the chip's
     * own outline, so the rule can never drift from the edge it belongs to.
     * 1px wide, spanning the chip's INNER height (the body inside the 1px
     * border), and it participates in the hug-content width like every other
     * element — `gap` is reserved on each side, so label and glyph keep their
     * spacing and the pill simply grows by `gap + width + gap`.
     */
    divider: {
      width: 1,
      /** Space on each side of the rule; matches `close.gap` so it sits evenly. */
      gap: 6,
    },
    /**
     * The close affordance: Carbon `close` glyph (32-unit viewBox, drawn
     * scaled to `size`), right-aligned inside the pill with its own padded
     * hit area and hover/focus states (see the component stylesheet).
     */
    close: {
      /** Rendered glyph box (data units) inside the chip. */
      size: 9,
      /**
       * Space between the divider rule and the glyph. Tightened 6 → 4: the ×
       * sits in its own section behind the rule, and the section was reading as
       * a wide empty bay rather than a compact control. The DIVIDER's own
       * `divider.gap` is untouched, so the label side of the rule is unchanged.
       */
      gap: 4,
      /**
       * Trailing padding after the glyph, replacing the chip's shared
       * `paddingX` on this edge only. Separate from `paddingX` precisely so the
       * close section can be compact WITHOUT narrowing the padding in front of
       * the leading dot, which is what keeps the chip's left edge looking right.
       */
      paddingRight: 5,
      /**
       * Extra invisible hit padding around the glyph, per side. Tightened from
       * 3 → 2 so the control reads as compact: the hit box is
       * `size + 2 × hitPadding` = 13 units inside an 18-unit chip (was 15), so
       * it still extends beyond the 9-unit glyph on every side and stays
       * comfortably clickable, just less sprawling. Chip height is unaffected —
       * this box has never driven it, and it is not part of `chipWidth`.
       */
      hitPadding: 2,
      /**
       * Resting / hover ink opacity. The glyph now paints in the darkest DS
       * token (opaque black, see `closeToken`), so the hover lift has to come
       * from opacity — hence a resting value below 1. Same hover MECHANISM as
       * before (ink lifts to solid on hover/focus, see the component
       * stylesheet), only darker at both ends than the old 40%-alpha token.
       */
      opacity: 0.75,
      opacityHover: 1,
      /** Carbon close/24 path data (viewBox 0 0 32 32) — same glyph as icons key `close`. */
      path: 'M17.4141 16 24 9.4141 22.5859 8 16 14.5859 9.4143 8 8 9.4141 14.5859 16 8 22.5859 9.4143 24 16 17.4141 22.5859 24 24 22.5859 17.4141 16z',
      viewBox: 32,
    },
  },

  /**
   * Connections. EVERY path in this layer is a straight single segment
   * (`M x1 y1 L x2 y2` / `<line>`), trimmed to the visible node/region
   * boundaries — see the geometry rule in the file header.
   */
  links: {
    /**
     * ⚠️ THIS LAYER HAS NO LINE STYLE OF ITS OWN.
     *
     * Stroke, width, dash and the opacity scale all come from the BASE
     * Unstructured link tokens (`LINK_STYLING` + `getLinkStrokeWidth` in
     * graphTokens.ts): the same luminous gradient paint server, the same
     * per-kind width, the same base/hover/hidden opacities. A connection must
     * not change its visual language just because a cluster happens to be
     * open, and a future edit to the graph's link styling has to reach the
     * expanded view for free — which a parallel token set here would break.
     *
     * Geometry stays this layer's own concern (straight, boundary-trimmed
     * segments), which is all that is left below.
     *
     * There is no membership-fan entry: entities do not draw lines back to
     * their Source at all (see the renderer).
     */
    /** Gap kept between a line's end and the node circle it touches. */
    endpointGap: 3,
  },

  /**
   * How far the rest of the graph drops back while drill-down is active. The
   * unrelated graph stays in the DOM and stays visible — it is context, not
   * clutter — so these are low but never zero.
   */
  dim: {
    node: 0.12,
    link: 0.05,
    label: 0.12,
    icon: 0.12,
  },

  /**
   * ENTITY-HOVER isolation. Hovering an `expanded-entity` reduces the whole
   * canvas to that entity's relationship path — the one canonical active set
   * from `deriveHoverActiveSet()` (same isolation philosophy as Structured's
   * hover). Everything outside it drops to the disabled opacities: the base
   * graph to `dim` above, and the drill-down layer's own containers to these.
   */
  hover: {
    /** Inactive expanded-region circles (fill AND stroke) while hovering. */
    regionOpacity: 0.15,
    /** Inactive region chips (whole group) while hovering. */
    chipOpacity: 0.15,
  },

  /**
   * Camera. The fit is deliberately gentle: the focused neighbourhood is
   * framed, but the scale is clamped relative to the normal fit-to-view so the
   * surrounding graph never leaves the canvas entirely.
   */
  camera: {
    /** Padding (data units) around the focused neighbourhood's bounds. */
    padding: 64,
    /** Hard clamp on the drill-down scale, as a factor of the initial fit. */
    minScaleFactor: 0.95,
    maxScaleFactor: 2.1,
    /** Enter/leave camera transition (ms). */
    duration: 620,
  },

  /** Never expand the whole canvas: at most this many contextual regions. */
  maxRelatedRegions: 2,

  /**
   * TEMPORARY UI CONSTRAINT — maximum simultaneous expanded clusters: 4.
   *
   * The expansion list is ordered by click, so the cap behaves as a FIFO
   * window: clicking a fifth cluster expands it and collapses the OLDEST of
   * the four, always leaving the four most recently expanded. The evicted
   * cluster returns to a normal collapsed node-circle (visible, clickable),
   * and the canvas emits `expand-limit` so the screen can explain the
   * automatic collapse in a snackbar. Guards the composition's readability
   * until a smarter multi-region layout lands — revisit when that work happens.
   */
  maxExpandedClusters: 4,
} as const
