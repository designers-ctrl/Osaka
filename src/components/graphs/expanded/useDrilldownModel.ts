/**
 * src/components/graphs/expanded/useDrilldownModel.ts
 *
 * The DERIVATION half of the Cluster drill-down: pure functions that read the
 * live graph (the same `nodes` / `links` the Unstructured renderer already
 * has) and produce everything the focused layer needs to draw.
 *
 * ⚠️ NOTHING HERE MUTATES GRAPH DATA.
 * Every set below is read out of the existing dataset, plus LAYER-LOCAL
 * synthetic demo entities (see demoEntities.ts) that fill sparse regions to
 * the reference density without ever touching the graph's nodes/links:
 *
 * - cluster → entity  : the generated `{clusterId}-e{i}` entity nodes and their
 *                       `{ source: clusterId, target: entityId }` links, which
 *                       already exist in the dataset and are merely FILTERED OUT
 *                       of the normal Unstructured render (entities are hidden
 *                       there by design). Drill-down reveals them; demo
 *                       entities top the region up to a deterministic target.
 * - cluster → source  : the `kind: 'overlap'` ownership link the dataset emits
 *                       for every cluster. The `-s<N>` suffix strip is only a
 *                       fallback, and matches useD3Force's `clusterOwnerId()`.
 * - cluster → cluster : two clusters are RELATED when the live link data joins
 *                       them — directly, or through a shared Insight. There is
 *                       no other notion of relatedness invented here, and
 *                       siblings of the same Source do NOT count (every cluster
 *                       of a hub would qualify, and the whole canvas would open).
 * - category          : the cluster's existing semantic `category` field.
 * - entity ↔ entity   : the dataset has no entity-level relationships, so the
 *                       demo links between revealed entity points are id-hash
 *                       gated — sparse, layer-local, and identical per reload.
 *
 * Positions are derived too, never authored: entity placement inside a region
 * is a LOCAL packing pass (seeded golden-angle spiral + a bounded d3-force
 * collide run) constrained to that one circle. It touches no other node, never
 * runs on the global graph, and is deterministic — d3-force uses its own
 * seeded LCG, and the seed positions are a closed-form spiral — so a reload
 * reproduces the same picture.
 *
 * ⚠️ CONNECTION GEOMETRY: every relationship this model describes is drawn by
 * the renderer as ONE STRAIGHT SEGMENT between two resolved endpoints — the
 * model exposes endpoints only, never control points or waypoints.
 */

import * as d3 from 'd3'
import type { NetworkNode, NetworkLink } from '@/components/charts'
import { EXPANDED_CLUSTER } from './expandedTokens'
import { hashId, syntheticNameFor } from './demoEntities'
import { deriveCrossClusterEntityPairs, entityClusterId, sameParentCluster } from './crossClusterRelations'

/** Endpoint id, whether or not d3-force has already resolved it to a node. */
export function linkEndId(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') return String((value as any).id ?? '')
  return ''
}

/**
 * The key the base renderer joins its link elements on
 * (`${source.id}-${target.id}`) — drill-down matches on it to hide the base
 * lines it re-anchors, so the two can never disagree about which line is which.
 */
export function linkKey(sourceId: string, targetId: string): string {
  return `${sourceId}-${targetId}`
}

/**
 * The cluster an entity belongs to, from its id. Both entity id schemes encode
 * their parent: the dataset generates `{clusterId}-e{i}` (graphWorkspace's
 * clusterEntities()) and the layer-local fill generates `{clusterId}-demo-{i}`
 * (demoEntities.ts). Anything else is returned unchanged, so an unrecognised
 * id can never be mistaken for a sibling of another.
 */
export { entityClusterId, sameParentCluster } from './crossClusterRelations'

/** An entity shown inside a region: a real graph node or a layer-local demo one. */
export type ExpandedEntityNode = NetworkNode

/** One entity revealed inside a region, at its packed offset from the centre. */
export interface EntityPlacement {
  node: ExpandedEntityNode
  /** Offset from the region centre, in data units. */
  dx: number
  dy: number
  /**
   * Present only for entities with a CROSS-CLUSTER relationship. Such an
   * entity is pinned to the outer annulus on the side facing its partner, and
   * the side has to be re-resolved on every render tick: the post-expand
   * settle moves clusters, hubs and therefore the DRAWN region centres, so a
   * direction fixed at model-build time goes stale within a second (it was
   * landing entities on the far side of the disc).
   *
   * The model owns what is deterministic — which entities are constrained,
   * their tangential slot and the radial band — and the renderer owns the live
   * direction (see useDrilldownRenderer's update()).
   */
  external?: {
    /** Partner ids: entities in other regions, or collapsed cluster nodes. */
    targetIds: string[]
    /** Deterministic tangential offset so co-directional entities fan out. */
    slotOffset: number
    minRadius: number
    maxRadius: number
  }
}

/** A cluster drawn as a large circular region. */
export interface DrilldownRegion {
  cluster: NetworkNode
  /** The clicked cluster (strongest emphasis) vs. a contextual related one. */
  primary: boolean
  radius: number
  /** The cluster's existing semantic category, when the data carries one. */
  category: string | null
  /** Owning Source/Document hub id — the node that must NOT disappear. */
  hubId: string | null
  entities: EntityPlacement[]
}

/**
 * A straight cross-cluster relationship drawn by the layer. The A side is
 * always an entity inside an EXPANDED region. The B side is either an entity
 * in another expanded region (`bKind: 'entity'`) or a related cluster that is
 * still COLLAPSED (`bKind: 'cluster'`, `bEntityId` holds the cluster id) — the
 * line then lands on that cluster's normal node-circle, and re-targets to its
 * entities only when the user explicitly expands it.
 */
export interface EntityRelation {
  key: string
  aRegionId: string
  aEntityId: string
  /** Empty string when the B side is a collapsed cluster (no region). */
  bRegionId: string
  bEntityId: string
  bKind: 'entity' | 'cluster'
}

/** A base link that ran into a now-expanded cluster, re-anchored as a straight line. */
export interface RoutedLink {
  key: string
  sourceId: string
  targetId: string
  kind?: string
  /** Both endpoints are part of the focused neighbourhood. */
  emphasized: boolean
  /**
   * When an endpoint is an EXPANDED region and the far endpoint is an
   * Insight, the line anchors on a deterministically chosen entity dot
   * INSIDE the region rather than on the big circle's perimeter — an Insight
   * is derived from specific signals, so the connection reads
   * `Insight → entity`, not `Insight → whole cluster`. (Collapsed clusters
   * keep their normal node-level link — the base layer draws it.)
   */
  sourceAnchorEntityId?: string
  targetAnchorEntityId?: string
}

export interface DrilldownModel {
  /** The most recently clicked expanded cluster (strongest emphasis). */
  primaryId: string
  /** Every EXPLICITLY expanded cluster id, in click order. */
  expandedIds: string[]
  regions: DrilldownRegion[]
  regionById: Map<string, DrilldownRegion>
  /**
   * Clusters related to the composition that remain COLLAPSED — normal
   * node-circles, fully visible and clickable, never dimmed and never
   * auto-expanded. Expansion is only ever an explicit user click.
   */
  relatedCollapsedIds: Set<string>
  /** Straight entity↔entity relationship lines the layer draws. */
  entityRelations: EntityRelation[]
  /**
   * Entities participating in a CROSS-CLUSTER relationship — the only ones
   * that carry a persistent label (they explain why two regions are joined);
   * purely internal entities stay dot-only until hovered.
   */
  crossLinkedEntityIds: Set<string>
  /**
   * Insight id → the expanded region ids it connects to. Insights joining ≥2
   * regions are eased between them by the envelope force, so a shared Insight
   * reads as the pivot of its cluster composition.
   */
  insightRegions: Map<string, string[]>
  /** Base-graph nodes that stay at full emphasis behind/around the regions. */
  emphasizedIds: Set<string>
  /** Base link elements the expanded layer takes over (hidden in the base). */
  routedKeys: Set<string>
  routedLinks: RoutedLink[]
}

/** Region radius from the region's ACTUAL rendered entity count (see tokens). */
export function getRegionRadius(entityCount: number): number {
  const { minRadius, maxRadius, baseRadius, perEntity } = EXPANDED_CLUSTER.region
  const raw = baseRadius + perEntity * Math.sqrt(Math.max(0, entityCount))
  return Math.max(minRadius, Math.min(maxRadius, raw))
}

/**
 * Pack a region's entities inside its circle.
 *
 * Seeded with a golden-angle spiral (even disc fill, no spoke artefacts), then
 * relaxed by a LOCAL d3-force run — collision for spacing, a (deliberately
 * tiny) centring pull so the cloud stays centred — stepped a fixed number of
 * ticks and clamped inside the perimeter. Local by construction: the
 * simulation only ever sees this cluster's own entities, so the global graph
 * simulation is neither restarted nor perturbed.
 *
 * Two spacing rules (see the tokens for the numbers):
 * - SPREAD: the collision radius is at least `inner × spreadFill / √count`,
 *   so the entities push each other outward until they OCCUPY the disc — no
 *   dense central pile — while staying organic (seeds + collision, no grid).
 * - LABEL-AWARE: `collideExtraOf` adds half the estimated text advance for
 *   entities that carry a persistent label, so labelled entities sit farther
 *   apart and labels neither overlap each other nor cross neighbouring dots,
 *   while every label stays hard against its own entity.
 */
/**
 * The outward direction an externally-connected entity should face, plus the
 * tangential slot that keeps entities sharing a direction from stacking.
 */
export interface ExternalBias {
  /** Preferred angle (radians) from the region centre toward the partner(s). */
  angle: number
  /** Deterministic offset within the arc, so co-directional entities spread. */
  slotOffset: number
  /**
   * This entity's own target position ACROSS the band, 0 = inner edge,
   * 1 = outer edge. Id-seeded, so a group facing one direction lands at
   * different depths instead of collapsing onto the outer cap as one arc.
   */
  radiusFraction: number
  /** Partner ids, handed to the placement for live re-resolution each tick. */
  targetIds: string[]
}

/**
 * A stable fraction in [0, 1) for an entity, per `salt`. The salt lets one id
 * drive several INDEPENDENT variations (its radius and its angular jitter)
 * without the two correlating — hashing the same id twice would otherwise give
 * the same number and couple them. Deterministic by construction, like every
 * other derived value here (Math.random() is banned in this repo).
 */
function hashFraction(id: string, salt: string): number {
  // ⚠️ `hashId` alone is NOT usable here. It is a polynomial rolling hash, so
  // ids that differ only in a trailing character (…-demo-0 / -1 / -2 — exactly
  // this layer's naming) land 1–2 apart, and a plain `% mod` maps them to
  // almost the same fraction. Measured: three sibling entities drew an
  // "independent" angular jitter of −4.28° / −4.27° / −4.26°, i.e. no variation
  // at all. This adds an integer avalanche finalizer (xorshift-multiply, the
  // standard 32-bit mixer) so one character of difference redistributes across
  // the whole range. Still pure integer arithmetic — fully deterministic.
  let h = hashId(`${salt}~${id}`) | 0
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d) | 0
  h ^= h >>> 12
  h = Math.imul(h, 0x297a2d39) | 0
  h ^= h >>> 15
  const mod = EXPANDED_CLUSTER.entity.ring.radialHashMod
  return ((h >>> 0) % mod) / mod
}

/** Shortest signed angular difference a→b, in (−π, π]. */
export function angleDiff(a: number, b: number): number {
  let d = b - a
  while (d > Math.PI) d -= 2 * Math.PI
  while (d <= -Math.PI) d += 2 * Math.PI
  return d
}

/** An axis-aligned rectangle in region-local coordinates. */
export interface ReservedBox { x1: number, y1: number, x2: number, y2: number }

/**
 * Build the OUTER-ANNULUS biases for a region's externally-connected entities:
 * each gets a preferred angle toward its partner(s), a tangential slot so
 * co-directional entities spread along the arc instead of stacking on one
 * point, and an id-seeded depth across the band.
 *
 * SHARED between the Unstructured drill-down (deriveDrilldown) and the
 * Structured focus layer — one implementation of "externally connected
 * entities sit on the edge facing their target", so the two modes cannot
 * drift apart.
 *
 * Angular variation is a fan EXPANSION, never a rotation: the bucket's slot
 * spacing is widened by an id-seeded factor, so the group is not a stamped
 * arc, while every intra-bucket gap can only grow. (Rotating instead regressed
 * spacing — a lone entity's rotation can walk it into a neighbouring bucket's
 * entity; two collapsed to a 2.2px gap that way, against a 6.9px baseline.)
 */
export function deriveExternalBiases(
  entries: Array<{ id: string, targets: Array<{ x: number, y: number }>, targetIds: string[] }>,
  anchor: { x: number, y: number },
): Map<string, ExternalBias> {
  const { arcSpread, slotSpacing, angleJitter } = EXPANDED_CLUSTER.entity.externalBias
  const biases = new Map<string, ExternalBias>()
  const directed = entries
    .map((entry) => {
      // Several partners → the average direction (their barycentre).
      const mx = entry.targets.reduce((sum, t) => sum + t.x, 0) / entry.targets.length
      const my = entry.targets.reduce((sum, t) => sum + t.y, 0) / entry.targets.length
      return { ...entry, angle: Math.atan2(my - anchor.y, mx - anchor.x) }
    })
    // Deterministic order: by angle, ties broken by id.
    .sort((a, b) => a.angle - b.angle || (a.id < b.id ? -1 : 1))

  // Bucket co-directional entities, then fan each bucket symmetrically
  // around its shared angle.
  const buckets = new Map<number, typeof directed>()
  for (const entry of directed) {
    const key = Math.round(entry.angle / (slotSpacing * 2))
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(entry)
  }
  for (const bucket of buckets.values()) {
    const half = (bucket.length - 1) / 2
    const spread = slotSpacing * (1 + hashFraction(bucket[0].id, 'angle') * angleJitter)
    bucket.forEach((entry, index) => {
      const offset = (index - half) * spread
      biases.set(entry.id, {
        angle: entry.angle,
        // Never seed outside the arc the projection would clamp to anyway.
        slotOffset: Math.max(-arcSpread, Math.min(arcSpread, offset)),
        radiusFraction: hashFraction(entry.id, 'radius'),
        targetIds: entry.targetIds,
      })
    })
  }
  return biases
}



/**
 * The CENTERED category chip's reserved rectangle — a hard NO-ENTITY zone.
 *
 * The renderer pins the chip's leading dot to the region centre with the pill
 * extending rightward; entity dots must never sit under it. The packing runs
 * before any DOM text exists, so the chip width is ESTIMATED from the
 * category (chars × fontSize × chip.estCharWidth, capped at labelMaxWidth —
 * the renderer truncates to the same cap) plus the same fixed slots the
 * renderer lays out: paddingX │ dot │ gap │ label │ divider │ close │ paddingX.
 * The box is inflated so a dot's EDGE (radius + collide padding) clears the
 * chip's own collision pad, matching the label-avoidance box in the renderer.
 */
export function chipReservedBox(category: string | null | undefined): ReservedBox | null {
  if (!category) return null
  const chip = EXPANDED_CLUSTER.chip
  const entity = EXPANDED_CLUSTER.entity
  const textEst = Math.min(category.length * chip.fontSize * chip.estCharWidth, chip.labelMaxWidth)
  const width = chip.paddingX + chip.dotRadius * 2 + chip.gap + textEst
    + chip.divider.gap + chip.divider.width + chip.close.gap + chip.close.size
    + chip.paddingX
  const left = -(chip.paddingX + chip.dotRadius) // dot at the region centre
  const pad = chip.collisionPad + entity.radius + entity.collidePadding
  // The renderer draws the chip SCALED (see `chip.reserveScale`): reserve the
  // scaled footprint, around the same centre-dot anchor, then pad.
  const s = chip.reserveScale
  return {
    x1: left * s - pad,
    y1: (-chip.height / 2) * s - pad,
    x2: (left + width) * s + pad,
    y2: (chip.height / 2) * s + pad,
  }
}

/*
 * ⚠️ SHARED with the Structured focus layer (structuredFocus.ts): a cluster
 * opened in Structured renders THIS packing inside its expanded region, so the
 * two modes' expanded clusters are one layout implementation. Changing the
 * packing changes both — which is the point.
 */
export function packEntities(
  clusterId: string,
  entities: ExpandedEntityNode[],
  radius: number,
  collideExtraOf: (node: ExpandedEntityNode) => number = () => 0,
  biasOf: (node: ExpandedEntityNode) => ExternalBias | null = () => null,
  reserve: ReservedBox | null = null,
): EntityPlacement[] {
  const { collidePadding, spreadFill, innerMargin, settleTicks, radius: dotRadius, externalBias, ring } = EXPANDED_CLUSTER.entity
  const count = entities.length
  if (count === 0) return []

  const inner = Math.max(radius - innerMargin, radius * 0.5)

  // ── OUTER-ANNULUS BAND for externally-connected entities ─────────────────
  // Farther out than the free ring. The safe inset caps it on small regions —
  // see the note on `externalBias.maxRadiusFactor`.
  const annulusMax = Math.min(
    inner,
    radius - externalBias.safeInset,
    radius * externalBias.maxRadiusFactor,
  )
  const annulusMin = Math.min(radius * externalBias.minRadiusFactor, annulusMax)
  /** This entity's own depth in the band, from its id-seeded fraction. */
  const biasRadiusOf = (bias: ExternalBias) =>
    annulusMin + bias.radiusFraction * (annulusMax - annulusMin)

  const biases = entities.map(node => biasOf(node))

  // Spacing radius, hoisted: it sizes the collision AND decides how wide the
  // free-entity ring has to be to hold this population without overlaps.
  // Count-adaptive: fills a sparse region, tightens gracefully for a dense one,
  // never below the readability minimum.
  const fillRadius = Math.max(
    dotRadius + collidePadding,
    (inner * spreadFill) / Math.sqrt(Math.max(1, count)),
  )

  // ── OUTER RING for free entities (see `entity.ring`) ─────────────────────
  const freeCount = biases.filter(b => !b).length
  const ringMax = Math.min(inner, radius * ring.maxRadiusFactor)
  let ringMin = Math.min(radius * ring.minRadiusFactor, ringMax)
  if (freeCount > 0) {
    // Can the band hold them at `fillRadius` spacing? Compare areas (÷π):
    // band = ringMax² − ringMin², population ≈ count × fillRadius² × slack.
    // If not, widen the band INWARD to the radius that fits — bounded by the
    // floor, so a very dense region never collapses back to a centre blob.
    const needed = freeCount * fillRadius * fillRadius * ring.fitSlack
    const fitMin = Math.sqrt(Math.max(0, ringMax * ringMax - needed))
    ringMin = Math.max(radius * ring.minRadiusFloor, Math.min(ringMin, fitMin))
  }
  /**
   * Each free entity's own target radius across the band — area-uniform from
   * its id hash (see `ring.radialHashMod`).
   *
   * ⚠️ The radial force below pulls toward THIS, not toward the band's mid
   * radius. Aiming every entity at the mid collapsed the whole hashed spread
   * into one narrow ring at mid-depth (measured: 15 of 32 dots inside a single
   * 5%-of-radius bucket, centred exactly on the mid) — the opposite of the
   * organic scatter the hash exists to produce.
   */
  const freeRadiusOf = (node: ExpandedEntityNode) => {
    const u = hashFraction(node.id, 'radius')
    return Math.sqrt(ringMin * ringMin + u * (ringMax * ringMax - ringMin * ringMin))
  }
  /** Even angular phase for this cluster's ring — id-seeded, so it is stable. */
  const ringPhase = (hashId(clusterId) % 360) * (Math.PI / 180)

  /**
   * Keep a free entity inside the ring: radius clamped into the band, angle
   * untouched so collision can slide it freely around the full 360°. Called
   * after every tick — the same hard-constraint treatment `projectBias` gives
   * externally-connected entities.
   */
  const projectRing = (seed: { x: number, y: number }, slotAngle: number) => {
    const r = Math.hypot(seed.x, seed.y)
    if (r < 1e-6) {
      // Degenerate (collision drove it onto the centre): put it back on its
      // own slot rather than pick an arbitrary direction.
      seed.x = Math.cos(slotAngle) * ringMin
      seed.y = Math.sin(slotAngle) * ringMin
      return
    }
    const clamped = Math.min(Math.max(r, ringMin), ringMax)
    if (clamped !== r) {
      seed.x *= clamped / r
      seed.y *= clamped / r
    }
  }

  /**
   * Project a constrained entity back into its band: radius clamped into the
   * annulus, angle clamped to within `arcSpread` of its preferred direction.
   * Called after EVERY tick, so collision can move these entities along the
   * arc but never back toward the centre.
   */
  const projectBias = (seed: { x: number, y: number }, bias: ExternalBias) => {
    const target = bias.angle + bias.slotOffset
    let r = Math.hypot(seed.x, seed.y)
    let a = r > 1e-6 ? Math.atan2(seed.y, seed.x) : target
    // Held near its OWN depth (± tolerance), not merely inside the band: with
    // only the band bounds to obey, the settle pressed every cross-linked
    // entity onto the outer cap and they read as one perfect arc.
    const own = biasRadiusOf(bias)
    const tol = (annulusMax - annulusMin) * externalBias.radiusTolerance
    r = Math.min(Math.max(r, Math.max(annulusMin, own - tol)), Math.min(annulusMax, own + tol))
    const drift = angleDiff(target, a)
    if (Math.abs(drift) > externalBias.arcSpread) {
      a = target + Math.sign(drift) * externalBias.arcSpread
    }
    seed.x = Math.cos(a) * r
    seed.y = Math.sin(a) * r
  }

  /**
   * Hard no-entity zone under the centered chip: a point inside the reserved
   * rectangle is pushed out through its NEAREST edge (least penetration), so
   * entities part around the chip instead of teleporting. Runs after every
   * tick (after the annulus projection — a slight radial drift off the band
   * is acceptable, a dot under the chip is not) and on the final placement.
   */
  const pushOutOfReserve = (p: { x: number, y: number }) => {
    if (!reserve) return
    if (p.x <= reserve.x1 || p.x >= reserve.x2 || p.y <= reserve.y1 || p.y >= reserve.y2) return
    const penetrations = [p.x - reserve.x1, reserve.x2 - p.x, p.y - reserve.y1, reserve.y2 - p.y]
    const m = Math.min(...penetrations)
    if (m === penetrations[0]) p.x = reserve.x1
    else if (m === penetrations[1]) p.x = reserve.x2
    else if (m === penetrations[2]) p.y = reserve.y1
    else p.y = reserve.y2
  }

  /**
   * Each free entity's own slot angle, in FREE-entity order (not overall
   * order), so the free population divides the full 360° evenly however many
   * of its siblings happen to be externally constrained. Kept for the
   * degenerate case in projectRing.
   */
  const slotAngles = new Array<number>(count).fill(0)
  let freeSlot = 0
  const seeds = entities.map((node, i) => {
    const bias = biases[i]
    if (bias) {
      // Seeded straight onto its slot AND its own depth — collision only
      // fine-tunes tangentially from there.
      const a = bias.angle + bias.slotOffset
      const r = biasRadiusOf(bias)
      return { id: node.id, x: Math.cos(a) * r, y: Math.sin(a) * r }
    }
    // Free entities ring the circle: an even angular slot around the full
    // 360°, at one of a few deterministic radii inside the band so the ring
    // has depth instead of reading as a single drawn circle.
    const k = freeSlot++
    const a = ringPhase + (k / Math.max(1, freeCount)) * Math.PI * 2
    slotAngles[i] = a
    // Area-uniform radius from this entity's own hash: spreads the dots evenly
    // over the band's AREA (so the wider outer part holds proportionally more)
    // and, being per-entity rather than a repeating stratum, reads as an
    // organic scatter instead of concentric rings.
    const r = freeRadiusOf(node)
    return { id: node.id, x: Math.cos(a) * r, y: Math.sin(a) * r }
  })
  // Clear the chip zone before the settle so collision starts from legal seeds
  seeds.forEach(seed => pushOutOfReserve(seed))

  if (count > 1) {
    const collideRadiusOf = (seed: { id: string }, i: number) =>
      fillRadius + collideExtraOf(entities[i])
    const sim = d3.forceSimulation(seeds as any)
      .force('collide', d3.forceCollide()
        .radius((seed: any, i: number) => collideRadiusOf(seed, i))
        // Extra iterations: label-inflated radii create harder constraints
        // than uniform dots; more passes per tick keep the resolve clean.
        .iterations(2))
      // Free entities are held on the RING, not pulled to the centre: a gentle
      // radial pull toward the band's mid-radius, with the per-tick clamp
      // below as the hard edge. Externally-constrained entities get 0 — their
      // own annulus projection owns them and any extra pull would fight it.
      .force('ring', d3.forceRadial((_d: any, i: number) => freeRadiusOf(entities[i]), 0, 0)
        .strength((_d: any, i: number) => biases[i] ? 0 : ring.strength))
      .stop()
    for (let tick = 0; tick < settleTicks; tick++) {
      sim.tick()
      // Re-assert the constraints after every tick: collision resolves
      // overlaps (spreading co-directional entities tangentially), then the
      // annulus projection pulls constrained radial positions back into the
      // band, then the chip's no-entity zone gets the LAST word — projecting
      // last is what stops the settle from undoing a constraint.
      for (let i = 0; i < seeds.length; i++) {
        const bias = biases[i]
        if (bias) projectBias(seeds[i], bias)
        else projectRing(seeds[i], slotAngles[i])
        pushOutOfReserve(seeds[i])
      }
    }
  }

  // ── TANGENTIAL DE-OVERLAP ────────────────────────────────────────────────
  // Last word on spacing. Both hard constraints re-assert after every tick and
  // can undo a collision resolve, leaving two dots closer than their own
  // diameter. Rotating a too-close pair apart AROUND THE CENTRE fixes the gap
  // without touching either radius, so neither the band nor an arc constraint
  // is disturbed. Fixed pair order + fixed pass count = deterministic.
  //
  // The pair minimum is LABEL-AWARE: entities that carry a persistent label
  // add their estimated half-advance (the same collideExtraOf the settle
  // collision uses), so a labelled pair separates far enough for both texts —
  // dots-only spacing left labels stacking on neighbouring dots.
  const pairMinGap = (i: number, j: number) =>
    dotRadius * 2 + collidePadding + collideExtraOf(entities[i]) + collideExtraOf(entities[j])
  const tangentialDeOverlap = () => {
    if (count <= 1) return
    for (let pass = 0; pass < ring.sepPasses; pass++) {
      let moved = false
      for (let i = 0; i < seeds.length; i++) {
        for (let j = i + 1; j < seeds.length; j++) {
          const a = seeds[i]
          const b = seeds[j]
          const minCenterGap = pairMinGap(i, j)
          const d = Math.hypot(a.x - b.x, a.y - b.y)
          if (d >= minCenterGap || d < 1e-9) continue
          moved = true
          const ra = Math.hypot(a.x, a.y)
          const rb = Math.hypot(b.x, b.y)
          if (ra < 1e-6 || rb < 1e-6) continue
          let aa = Math.atan2(a.y, a.x)
          let ab = Math.atan2(b.y, b.x)
          // Half the shortfall each, converted to an angle at each radius.
          // `angleDiff(x, y)` is y − x, so `dir` is the sign of (aa − ab):
          // each entity rotates FURTHER in the direction it already sits
          // relative to the other. (Negating these two moves them together —
          // measured as a no-op on the overlap it is meant to fix.)
          const push = (minCenterGap - d) / 2
          const dir = Math.sign(angleDiff(ab, aa)) || 1
          aa += (push / ra) * dir
          ab -= (push / rb) * dir
          a.x = Math.cos(aa) * ra
          a.y = Math.sin(aa) * ra
          b.x = Math.cos(ab) * rb
          b.y = Math.sin(ab) * rb
          // Re-assert the owning constraint for each — a rotation must not
          // walk a biased entity off its arc, or anything under the chip.
          if (biases[i]) projectBias(a, biases[i]!)
          else projectRing(a, slotAngles[i])
          if (biases[j]) projectBias(b, biases[j]!)
          else projectRing(b, slotAngles[j])
          pushOutOfReserve(a)
          pushOutOfReserve(b)
        }
      }
      if (!moved) break
    }
  }
  tangentialDeOverlap()

  // ── FINAL PROJECTIONS, THEN ONE MORE RELAXATION ─────────────────────────
  // The final constraint pass (annulus / ring / containment / chip zone) is
  // applied to every seed IN PLACE first, and the de-overlap then runs once
  // more — otherwise those projections would be the last writers and could
  // quietly stack two entities after the spacing pass already finished.
  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[i]
    const bias = biases[i]
    if (bias) {
      projectBias(seed, bias)
    } else {
      projectRing(seed, slotAngles[i])
      // Containment: anything the relaxation pushed past the perimeter is
      // pulled back onto it, so no entity can ever escape its cluster
      // boundary. The chip zone is re-asserted AFTER the pull-back (which
      // moves points toward the centre and could otherwise drop one back
      // under the chip) — of the two constraints, the no-entity zone wins.
      const dist = Math.hypot(seed.x, seed.y)
      if (dist > inner && dist > 0) {
        const scale = inner / dist
        seed.x *= scale
        seed.y *= scale
      }
    }
    pushOutOfReserve(seed)
  }
  tangentialDeOverlap()

  return entities.map((node, i) => {
    const seed = seeds[i]
    const bias = biases[i]
    if (bias) {
      return {
        node,
        dx: seed.x,
        dy: seed.y,
        external: {
          targetIds: bias.targetIds,
          slotOffset: bias.slotOffset,
          minRadius: annulusMin,
          maxRadius: annulusMax,
        },
      }
    }
    return {
      node,
      dx: seed.x,
      dy: seed.y,
    }
  })
}

/**
 * Build the drill-down model for the EXPLICITLY expanded clusters, or null
 * when none of the ids is an expandable cluster in the CURRENT (time-filtered)
 * graph.
 *
 * ⚠️ EXPANSION IS EXPLICIT ONLY. `clusterIds` is exactly the set of clusters
 * the user has clicked open, in click order (the last is the primary — the
 * strongest emphasis). Related clusters are derived for CONTEXT — they stay
 * collapsed, fully visible and clickable — and are never expanded here, not
 * for a direct cluster link, not for an entity cross-link, not for a shared
 * Insight. A second region appears only when the user clicks that cluster.
 */
export function deriveDrilldown(
  nodes: NetworkNode[],
  links: NetworkLink[],
  clusterIds: string[],
): DrilldownModel | null {
  const nodeById = new Map<string, NetworkNode>(nodes.map(n => [n.id, n]))
  // Only ids that are clusters in the current graph expand; click order kept.
  const expandedIds = clusterIds.filter(id => nodeById.get(id)?.kind === 'cluster')
  if (expandedIds.length === 0) return null
  const primaryId = expandedIds[expandedIds.length - 1]

  // ── Adjacency over the live link list ───────────────────────────────────
  // Built once, from the existing links only. d3-force may already have
  // resolved endpoints to node objects, hence linkEndId().
  const neighbors = new Map<string, Set<string>>()
  const ownerOf = new Map<string, string>() // cluster → hub, from 'overlap' links
  const addEdge = (a: string, b: string) => {
    if (!neighbors.has(a)) neighbors.set(a, new Set())
    neighbors.get(a)!.add(b)
  }
  for (const link of links) {
    const s = linkEndId(link.source)
    const t = linkEndId(link.target)
    if (!s || !t) continue
    addEdge(s, t)
    addEdge(t, s)
    if (link.kind === 'overlap') {
      const sk = nodeById.get(s)?.kind
      const tk = nodeById.get(t)?.kind
      if (tk === 'cluster' && (sk === 'source' || sk === 'document')) ownerOf.set(t, s)
      if (sk === 'cluster' && (tk === 'source' || tk === 'document')) ownerOf.set(s, t)
    }
  }

  const neighborsOf = (id: string) => neighbors.get(id) ?? new Set<string>()
  const kindOf = (id: string) => nodeById.get(id)?.kind

  /** The cluster's real entities, from the existing membership links. */
  const entitiesOf = (id: string): NetworkNode[] =>
    [...neighborsOf(id)]
      .map(nid => nodeById.get(nid))
      .filter((n): n is NetworkNode => !!n && n.kind === 'entity')
      // Stable order → stable packing → identical picture after a reload.
      .sort((a, b) => a.id.localeCompare(b.id))

  /**
   * The Source/Document that owns a cluster. The ownership link is the truth;
   * the id-suffix strip is only a fallback for a filtered-out link, and uses
   * the same convention as useD3Force.clusterOwnerId().
   */
  const hubOf = (id: string): string | null => {
    const owner = ownerOf.get(id)
    if (owner) return owner
    const fallback = id.replace(/-s\d+$/, '')
    return fallback !== id && nodeById.has(fallback) ? fallback : null
  }

  const insightsOf = (id: string) =>
    [...neighborsOf(id)].filter(nid => kindOf(nid) === 'insight')

  // ── Related clusters: joined by the live links, never by proximity ──────
  // Derived for CONTEXT ONLY — these stay collapsed (see the header note).
  const expandedSet = new Set(expandedIds)

  /** Clusters related to `id` (shared Insight or direct link), scored. */
  const relatedScoreFor = (id: string): Map<string, number> => {
    const score = new Map<string, number>()
    for (const insightId of insightsOf(id)) {
      for (const nid of neighborsOf(insightId)) {
        if (nid === id || kindOf(nid) !== 'cluster') continue
        score.set(nid, (score.get(nid) ?? 0) + 1)
      }
    }
    // A direct cluster↔cluster link is the strongest possible relationship.
    for (const nid of neighborsOf(id)) {
      if (kindOf(nid) === 'cluster') score.set(nid, (score.get(nid) ?? 0) + 2)
    }
    return score
  }

  /**
   * Per expanded cluster: its top related clusters that are NOT themselves
   * expanded (capped for line-drawing; emphasis covers all of them below).
   */
  const relatedByRegion = new Map<string, string[]>()
  const relatedCollapsedIds = new Set<string>()
  for (const id of expandedIds) {
    const ranked = [...relatedScoreFor(id).entries()]
      .filter(([nid]) => !expandedSet.has(nid))
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
      .map(([nid]) => nid)
    ranked.forEach(nid => relatedCollapsedIds.add(nid))
    relatedByRegion.set(id, ranked.slice(0, EXPANDED_CLUSTER.maxRelatedRegions))
  }

  /** Are two EXPANDED clusters related (direct link or shared Insight)? */
  const expandedPairRelated = (aId: string, bId: string): boolean => {
    if (neighborsOf(aId).has(bId)) return true
    for (const insightId of insightsOf(aId)) {
      if (neighborsOf(insightId).has(bId)) return true
    }
    return false
  }

  // ── Regions: ONE per explicitly expanded cluster, nothing more ──────────
  // Built in two steps: PROTO regions (entity lists, no positions yet), then —
  // once the cross-cluster relations say which entities carry a persistent
  // label — the actual packing, so label bounds can join the collision pass.
  interface ProtoRegion {
    cluster: NetworkNode
    primary: boolean
    radius: number
    category: string | null
    hubId: string | null
    shown: ExpandedEntityNode[]
  }
  const buildProto = (id: string, isPrimary: boolean): ProtoRegion | null => {
    const cluster = nodeById.get(id)
    if (!cluster) return null
    const real = entitiesOf(id)
    const category = ((cluster as any).category as string | undefined) ?? null
    // The DATASET is the one source of the entity population (entityFill.ts
    // generates the full deterministic per-cluster count with labels), so the
    // drill-down shows exactly the entities the graph holds — the same set
    // the Structured focus shows. No layer-local fill.
    const shown: ExpandedEntityNode[] = real
    return {
      cluster,
      primary: isPrimary,
      radius: getRegionRadius(shown.length),
      category,
      hubId: hubOf(id),
      shown,
    }
  }

  const protoRegions: ProtoRegion[] = []
  for (const id of expandedIds) {
    const proto = buildProto(id, id === primaryId)
    if (proto) protoRegions.push(proto)
  }
  if (protoRegions.length === 0) return null

  // ── Entity↔entity relationships (straight lines) ────────────────────────
  // ⚠️ SIBLING RULE: two entities of the SAME parent cluster never draw a
  // connection to each other. Membership in one cluster is already expressed
  // by the region that contains them both — a line between siblings restates
  // it, and at region density it reads as a hairball that hides the
  // relationships that DO carry meaning. Only cross-cluster pairs qualify:
  // entity → entity in another cluster, or a path through an Insight.
  //
  // This is a FILTER, not an opacity treatment: a forbidden pair is never
  // added to the model, so no element is created for it and nothing can
  // reveal it later (hover, focus, or a future emphasis mode).
  //
  // The dataset carries no entity-level links, so these are deterministic
  // demo relationships. Layer-local — never written into the graph's link
  // list. Two shapes:
  //
  // 1. EXPANDED ↔ EXPANDED: entity↔entity pairs between every pair of
  //    expanded regions that are actually related (direct link or shared
  //    Insight). Seeded from the SORTED pair of cluster ids, so the same two
  //    clusters produce the same pairs regardless of which was clicked first.
  // 2. EXPANDED → RELATED COLLAPSED: an entity inside the region connects to
  //    the related cluster's normal node-circle. This is how "connections
  //    from Entities inside A to B" show while B stays collapsed — the line
  //    re-targets to B's entities only when the user explicitly expands B.
  const entityRelations: EntityRelation[] = []
  const { crossLinksPerRegionPair } = EXPANDED_CLUSTER.demo

  // The expanded↔expanded pairing itself lives in crossClusterRelations.ts —
  // ONE deterministic implementation, shared with the Structured cluster focus
  // so the same two clusters relate the same two entities in either view (and
  // after any reload). The sibling rule and the seeding are documented there.
  for (const pair of deriveCrossClusterEntityPairs(
    protoRegions.map(r => ({ clusterId: r.cluster.id, entityIds: r.shown.map(e => e.id) })),
    expandedPairRelated,
    crossLinksPerRegionPair,
  )) {
    entityRelations.push({
      key: pair.key,
      aRegionId: pair.aClusterId,
      aEntityId: pair.aEntityId,
      bRegionId: pair.bClusterId,
      bEntityId: pair.bEntityId,
      bKind: 'entity',
    })
  }

  for (const proto of protoRegions) {
    const a = proto.shown
    if (a.length === 0) continue
    for (const collapsedId of relatedByRegion.get(proto.cluster.id) ?? []) {
      // Same seed construction as the entity↔entity pairs (sorted ids), so
      // the A-side picks stay put when the collapsed side is later expanded.
      const [firstId, secondId] = [proto.cluster.id, collapsedId].sort()
      const pairSeed = hashId(`${firstId}~${secondId}`)
      const pairCount = Math.min(crossLinksPerRegionPair, a.length)
      for (let k = 0; k < pairCount; k++) {
        const ai = (pairSeed + k * 7) % a.length
        const aId = a[ai].id
        const key = `${aId}~${collapsedId}`
        if (entityRelations.some(r => r.key === key)) continue
        // Sibling rule, cluster form: never connect an entity to its OWN cluster.
        if (entityClusterId(aId) === collapsedId) continue
        entityRelations.push({
          key,
          aRegionId: proto.cluster.id,
          aEntityId: aId,
          bRegionId: '',
          bEntityId: collapsedId,
          bKind: 'cluster',
        })
      }
    }
  }

  // Cross-cluster connected entities — the only ones labelled persistently.
  // An entity lines to a collapsed related cluster counts too: it participates
  // in a cross-cluster relationship even though the far side isn't open yet.
  const crossLinkedEntityIds = new Set<string>()
  for (const rel of entityRelations) {
    crossLinkedEntityIds.add(rel.aEntityId)
    if (rel.bKind === 'entity') crossLinkedEntityIds.add(rel.bEntityId)
  }

  // ── Pack the regions, LABEL-AWARE ───────────────────────────────────────
  // Now that the cross-linked set is known, entities that will carry a
  // persistent label pack with an inflated collision radius (half their
  // estimated text advance, capped) — labelled entities sit farther apart, so
  // labels can't overlap each other or run across neighbouring dots.
  const { labelCollideFactor, labelCollideMax, estCharWidth } = EXPANDED_CLUSTER.entity
  const labelFontSize = EXPANDED_CLUSTER.entityLabel.fontSize
  const collideExtraFor = (category: string | null) => (node: ExpandedEntityNode): number => {
    if (!crossLinkedEntityIds.has(node.id)) return 0
    const text = node.label || syntheticNameFor(node.id, category)
    return Math.min(labelCollideMax, text.length * labelFontSize * estCharWidth * labelCollideFactor)
  }

  /*
   * ── PERIMETER BIAS FOR EXTERNALLY-CONNECTED ENTITIES ────────────────────
   *
   * An entity that owns a cross-cluster relation is the endpoint of a line
   * that LEAVES the region, so it must sit near the perimeter on the side
   * facing its partner — otherwise the line starts deep in the disc and cuts
   * across the whole cluster on its way out.
   *
   * Resolving "which side" needs the partner's position, and for a partner
   * inside another expanded region that position is itself a packing result.
   * Hence TWO passes:
   *
   *   1. pack every region unbiased → provisional positions for every entity;
   *   2. read each partner's provisional position, average the directions for
   *      entities with several partners, then re-pack with the annulus
   *      constraint (see packEntities).
   *
   * Both passes are pure and seeded, so the result is identical on reload.
   * Region ANCHORS here are the cluster node positions; the renderer shifts a
   * region slightly (hub clearance, region separation) but those shifts are
   * small next to the distance between two regions, so the chosen side holds.
   */
  const protoById = new Map(protoRegions.map(proto => [proto.cluster.id, proto]))
  const positionOf = (nodeId: string) => {
    const node = nodeById.get(nodeId)
    return { x: node?.x ?? 0, y: node?.y ?? 0 }
  }

  // Insight → the expanded regions it joins. Needed here (not just in the
  // final model) because computeRegionCenters widens the seam between regions
  // that share an Insight, so the centres below depend on it.
  const insightRegions = new Map<string, string[]>()
  for (const proto of protoRegions) {
    for (const insightId of insightsOf(proto.cluster.id)) {
      if (!insightRegions.has(insightId)) insightRegions.set(insightId, [])
      insightRegions.get(insightId)!.push(proto.cluster.id)
    }
  }

  /*
   * ⚠️ ANCHOR ON THE DRAWN CENTRES, NOT THE CLUSTER NODES.
   *
   * A region is not drawn at its cluster's position: computeRegionCenters
   * pushes it outward until the circle clears its own hub (up to
   * `radius + hubClearance`, which for a large region is ~200 units) and then
   * separates overlapping regions. Anchoring the direction on the raw cluster
   * positions therefore pointed entities at where the partner *used to be* —
   * on a close pair that came out ~180° wrong, i.e. exactly the "deep inside,
   * long crossing line" symptom. The SAME pure function the renderer uses is
   * called here so the model and the picture agree.
   */
  const centersModel = {
    regions: protoRegions.map(proto => ({
      cluster: proto.cluster,
      primary: proto.primary,
      radius: proto.radius,
      category: proto.category,
      hubId: proto.hubId,
      entities: [],
    })),
    insightRegions,
  } as unknown as DrilldownModel
  const regionCenters = computeRegionCenters(centersModel, nodeById)
  /** Where a region is actually DRAWN (falls back to its cluster position). */
  const centerOf = (regionId: string) => regionCenters.get(regionId) ?? positionOf(regionId)

  // Pass 1 — provisional, unbiased.
  const provisional = new Map<string, { dx: number, dy: number }>()
  for (const proto of protoRegions) {
    for (const placement of packEntities(proto.cluster.id, proto.shown, proto.radius, collideExtraFor(proto.category), () => null, chipReservedBox(proto.category))) {
      provisional.set(placement.node.id, { dx: placement.dx, dy: placement.dy })
    }
  }
  /** Provisional ABSOLUTE position of an entity: its region anchor + offset. */
  const provisionalAbs = (entityId: string): { x: number, y: number } | null => {
    const regionId = entityClusterId(entityId)
    const offset = provisional.get(entityId)
    if (!protoById.has(regionId) || !offset) return null
    const anchor = centerOf(regionId)
    return { x: anchor.x + offset.dx, y: anchor.y + offset.dy }
  }

  // Every entity's external target positions (an entity in another region, or
  // a related collapsed cluster's own node).
  const externalTargets = new Map<string, Array<{ x: number, y: number }>>()
  const externalTargetIds = new Map<string, string[]>()
  const addTarget = (entityId: string, targetId: string, position: { x: number, y: number } | null) => {
    if (!position) return
    if (!externalTargets.has(entityId)) externalTargets.set(entityId, [])
    externalTargets.get(entityId)!.push(position)
    if (!externalTargetIds.has(entityId)) externalTargetIds.set(entityId, [])
    externalTargetIds.get(entityId)!.push(targetId)
  }
  for (const rel of entityRelations) {
    if (rel.bKind === 'entity') {
      addTarget(rel.aEntityId, rel.bEntityId, provisionalAbs(rel.bEntityId))
      addTarget(rel.bEntityId, rel.aEntityId, provisionalAbs(rel.aEntityId))
    } else {
      // Collapsed cluster: its own node position is the direction to face.
      addTarget(rel.aEntityId, rel.bEntityId, positionOf(rel.bEntityId))
    }
  }

  /*
   * ── INSIGHT ANCHORS, DECIDED BEFORE THE BIAS PASS ────────────────────────
   * An Insight linked to an expanded region lands on ONE entity inside it
   * (`Insight → entity`). That anchor used to be picked further down, AFTER
   * packing — so the chosen entity had no idea it carried an outward line and
   * stayed wherever the internal distribution put it, and the line cut clean
   * across the disc to reach it.
   *
   * The pick is made here instead, keyed by the same (insight, cluster) hash,
   * and registered as an EXTERNAL TARGET. From that point the existing bias
   * pass owns it: outer annulus, facing the insight, fanned against
   * co-directional siblings, then the same collision pass everything else
   * goes through. Nothing new positions anything.
   *
   * The map is what `anchorFor` reads later, so the entity the line lands on
   * and the entity that was pulled outward are the same one by construction.
   */
  const insightAnchors = new Map<string, string>()
  const anchorKey = (insightId: string, regionId: string) => `${insightId}~${regionId}`
  for (const link of links) {
    const s = linkEndId(link.source)
    const t = linkEndId(link.target)
    if (!s || !t) continue
    for (const [regionId, farId] of [[s, t], [t, s]] as const) {
      const proto = protoById.get(regionId)
      if (!proto || proto.shown.length === 0) continue
      if (nodeById.get(farId)?.kind !== 'insight') continue
      const key = anchorKey(farId, regionId)
      if (insightAnchors.has(key)) continue
      const pick = hashId(key) % proto.shown.length
      const anchorId = proto.shown[pick].id
      insightAnchors.set(key, anchorId)
      // Face the insight's own position — the direction the line will leave in.
      addTarget(anchorId, farId, positionOf(farId))
    }
  }

  // Preferred angle per entity + a tangential slot so entities heading the
  // same way spread along the arc instead of stacking on one point — through
  // the SHARED bias builder (deriveExternalBiases), which the Structured focus
  // layer also uses for its expanded regions.
  const biasByEntity = new Map<string, ExternalBias>()
  for (const proto of protoRegions) {
    const anchor = centerOf(proto.cluster.id)
    const perRegion = deriveExternalBiases(
      proto.shown
        .filter(node => externalTargets.has(node.id))
        .map(node => ({
          id: node.id,
          targets: externalTargets.get(node.id)!,
          targetIds: externalTargetIds.get(node.id) ?? [],
        })),
      anchor,
    )
    for (const [id, bias] of perRegion) biasByEntity.set(id, bias)
  }

  // Pass 2 — the packing that ships, with the annulus constraint applied.
  const regions: DrilldownRegion[] = protoRegions.map(proto => ({
    cluster: proto.cluster,
    primary: proto.primary,
    radius: proto.radius,
    category: proto.category,
    hubId: proto.hubId,
    entities: packEntities(
      proto.cluster.id,
      proto.shown,
      proto.radius,
      collideExtraFor(proto.category),
      node => biasByEntity.get(node.id) ?? null,
      chipReservedBox(proto.category),
    ),
  }))
  const regionById = new Map(regions.map(r => [r.cluster.id, r]))

  // ── Emphasis: the focused neighbourhood ─────────────────────────────────
  // Every EXPANDED cluster + its entities + its Source + its directly
  // connected Insights, plus the related COLLAPSED clusters and their Sources
  // — a connected cluster is never disabled just because it is not expanded.
  // Only genuinely unrelated groups dim.
  const emphasizedIds = new Set<string>()
  const emphasize = (id: string | null | undefined) => { if (id && nodeById.has(id)) emphasizedIds.add(id) }

  for (const id of expandedIds) {
    emphasize(id)
    const hubId = hubOf(id)
    emphasize(hubId)
    insightsOf(id).forEach(emphasize)
    // The Source's OTHER clusters stay fully visible too: an emphasized hub
    // with dimmed satellites would read as a broken neighbourhood. They stay
    // COLLAPSED — visible and clickable, never auto-expanded (the sibling rule
    // still keeps them out of relatedCollapsedIds, so no relation lines are
    // drawn to them; being lit is what they get).
    if (hubId) {
      for (const nid of neighborsOf(hubId)) {
        if (kindOf(nid) === 'cluster') emphasize(nid)
      }
    }
  }
  for (const id of relatedCollapsedIds) {
    emphasize(id)
    emphasize(hubOf(id))
  }
  for (const region of regions) {
    for (const placement of region.entities) {
      // Demo entities are layer-local — only real graph nodes join the set.
      if (nodeById.has(placement.node.id)) emphasizedIds.add(placement.node.id)
    }
  }

  // ── Links the expanded layer takes over ─────────────────────────────────
  // Any base line touching an expanded cluster would end under the region's
  // fill (it was drawn to the small cluster circle), so the drill-down hides
  // it and re-draws it as a straight line re-anchored on the region
  // perimeter. Topology is untouched — only where the segment ends.
  const routedLinks: RoutedLink[] = []
  const routedKeys = new Set<string>()
  for (const link of links) {
    const s = linkEndId(link.source)
    const t = linkEndId(link.target)
    if (!s || !t) continue
    if (!regionById.has(s) && !regionById.has(t)) continue
    const sNode = nodeById.get(s)
    const tNode = nodeById.get(t)
    if (!sNode || !tNode) continue
    // Entity membership is drawn by its own straight-line pass, not here.
    if (sNode.kind === 'entity' || tNode.kind === 'entity') continue
    const key = linkKey(s, t)
    if (routedKeys.has(key)) continue
    routedKeys.add(key)

    /**
     * Insight ↔ expanded-region links anchor INSIDE the region: pick one of
     * the region's entities by an id-hash of the (insight, cluster) pair —
     * stable per reload and per re-expansion, never the whole circle.
     */
    /*
     * The anchor is the entity the bias pass already pulled to the perimeter
     * FACING this insight — by construction the closest point in the region to
     * the target, so the line leaves from the nearest edge instead of cutting
     * across the interior.
     *
     * ⚠️ A scored re-pick (shortest line + penalties for grazing the chip or
     * other dots) was tried here and measured WORSE: it kept selecting
     * interior entities whose lines then crossed more dots than the perimeter
     * one did (unrelated-node crossings 6 → 16, chip 2 → 4). The bias pass
     * already solves the placement problem; a second selection just undoes it.
     */
    const anchorFor = (regionId: string, farId: string): string | undefined =>
      insightAnchors.get(anchorKey(farId, regionId))

    routedLinks.push({
      key,
      sourceId: s,
      targetId: t,
      kind: link.kind,
      emphasized: emphasizedIds.has(s) && emphasizedIds.has(t),
      sourceAnchorEntityId: regionById.has(s) ? anchorFor(s, t) : undefined,
      targetAnchorEntityId: regionById.has(t) ? anchorFor(t, s) : undefined,
    })
  }

  return {
    primaryId,
    expandedIds,
    regions,
    regionById,
    relatedCollapsedIds,
    entityRelations,
    crossLinkedEntityIds,
    insightRegions,
    emphasizedIds,
    routedKeys,
    routedLinks,
  }
}

// ── EXPANDED-ENVELOPE FORCE (registered on the EXISTING simulation) ───────

/**
 * Custom D3 force, same pattern as useD3Force's `forceClusterOrbit`: while the
 * drill-down is open, each expanded region is a temporary OCCUPIED AREA, and
 * every other simulated node is softly pushed out of
 * `region.radius + its own radius + safetyGap` — collision against the actual
 * expanded bounds, never a fixed offset.
 *
 * Two deliberate exclusions ANCHOR the composition instead of being pushed:
 * - the expanded clusters themselves (the regions ride them);
 * - their owning Source/Document hubs (each region already clears its hub via
 *   `hubClearance`, and pushing the anchor would feed back into the region).
 *
 * Insights joining ≥2 expanded regions get a second, opposing nudge toward the
 * centroid of those regions: the envelope push keeps them out of both circles,
 * the centroid pull keeps them BETWEEN the clusters they connect — together
 * they park a shared Insight in the gap of a readable multi-cluster
 * composition, with unrelated nodes pushed outside the combined envelope.
 *
 * Lifecycle is owned by the component: added on drill-down enter with a gentle
 * reheat, removed (set to null) on collapse with another gentle reheat so the
 * graph settles back naturally. Global spacing is therefore never permanently
 * changed. The envelope resolves overlap POSITIONALLY (capped per tick, not
 * alpha-scaled — see inline note) so it converges within any remaining tick
 * budget; user-fixed (dragged) nodes are exempt. The between-pull stays a
 * gentle alpha-scaled velocity nudge, as an organizer rather than a constraint.
 */
export function forceExpandedEnvelope(
  model: DrilldownModel,
  nodeById: Map<string, NetworkNode>,
  nodeRadiusOf: (node: NetworkNode) => number,
) {
  const t = EXPANDED_CLUSTER.envelope
  const anchored = new Set<string>()
  for (const region of model.regions) {
    anchored.add(region.cluster.id)
    if (region.hubId) anchored.add(region.hubId)
  }

  let simNodes: any[] = []

  /**
   * One pass of POSITIONAL overlap resolution against every envelope, capped
   * per pass, NOT alpha-scaled. Positional because a velocity-based push
   * settled into an equilibrium inside the envelope (the opposing orbit/link
   * pulls are alpha-scaled and strong at high alpha), and the reheat can hit
   * alphaMin and stop before a velocity push converges. User-fixed (pinned or
   * dragged) nodes are exempt — a drag into the envelope is the user's call.
   * Returns whether anything still overlapped (drives presettle convergence).
   */
  const resolveOverlapsOnce = (): boolean => {
    // Regions ride their (simulated) clusters — recompute the envelopes from
    // the live positions every pass, exactly like the renderer does.
    const centers = computeRegionCenters(model, nodeById)
    const envelopes = model.regions.map(region => {
      const c = centers.get(region.cluster.id)!
      return { x: c.x, y: c.y, r: region.radius }
    })

    let anyOverlap = false
    for (const node of simNodes) {
      if (anchored.has(node.id)) continue
      if (node.fx != null || node.fy != null) continue
      const nodeRadius = nodeRadiusOf(node)

      for (const envelope of envelopes) {
        let dx = (node.x || 0) - envelope.x
        let dy = (node.y || 0) - envelope.y
        let dist = Math.hypot(dx, dy)
        if (dist < 1e-3) {
          // Node sitting exactly on the envelope centre: push in a stable,
          // id-derived direction rather than not at all (or randomly).
          const angle = (hashId(node.id) % 360) * (Math.PI / 180)
          dx = Math.cos(angle)
          dy = Math.sin(angle)
          dist = 1
        }
        const minDist = envelope.r + nodeRadius + t.safetyGap
        if (dist >= minDist) continue
        anyOverlap = true
        const ux = dx / dist
        const uy = dy / dist
        const resolve = Math.min(minDist - dist, t.maxStep) * t.pushStrength
        node.x = (node.x || 0) + ux * resolve
        node.y = (node.y || 0) + uy * resolve
        // Kill the node's INWARD radial momentum: link/orbit pulls (applied
        // earlier this tick — this force is registered last) otherwise
        // integrate the node straight back into the envelope faster than the
        // capped resolution can expel it. Tangential velocity is untouched,
        // so nodes still slide around the envelope naturally.
        const inward = (node.vx || 0) * ux + (node.vy || 0) * uy
        if (inward < 0) {
          node.vx = (node.vx || 0) - ux * inward
          node.vy = (node.vy || 0) - uy * inward
        }
      }
    }
    return anyOverlap
  }

  const force = (alpha: number) => {
    // Maintain the clearance the warm-start established (see presettle).
    resolveOverlapsOnce()

    // Live region centers for the shared-insight centroid pull below
    // (resolveOverlapsOnce computes its own copy internally).
    const centers = computeRegionCenters(model, nodeById)

    for (const node of simNodes) {
      if (anchored.has(node.id)) continue

      // Shared Insights ease toward the centroid of the regions they join.
      if (node.kind === 'insight') {
        const joined = model.insightRegions.get(node.id)
        if (joined && joined.length >= 2) {
          let mx = 0
          let my = 0
          for (const regionId of joined) {
            const c = centers.get(regionId)!
            mx += c.x
            my += c.y
          }
          mx /= joined.length
          my /= joined.length
          node.vx = (node.vx || 0) + (mx - (node.x || 0)) * t.betweenStrength * alpha
          node.vy = (node.vy || 0) + (my - (node.y || 0)) * t.betweenStrength * alpha
        }
      }
    }
  }

  force.initialize = (nodes: any[]) => { simNodes = nodes }

  /**
   * Synchronous warm-start: iterate the resolution to convergence (bounded by
   * `presettleIterations`) the moment the force is registered, so envelope
   * clearance never depends on how many ticks the visual reheat has left.
   * The per-tick force then merely maintains it against the decaying pulls.
   */
  force.presettle = () => {
    for (let i = 0; i < t.presettleIterations; i++) {
      if (!resolveOverlapsOnce()) break
    }
  }

  return force
}

// ── ENTITY-HOVER ACTIVE SET (the ONE canonical calculation) ───────────────

/**
 * Everything that stays prominent while an `expanded-entity` is hovered.
 * Same philosophy as the Structured renderer's hover isolation: ONE derivation
 * owns the active set, and every drawing surface (entity dots, labels,
 * relation/membership/routed lines, region circles, chips, AND the dimmed
 * base graph underneath) consumes it — no renderer computes its own.
 */
export interface HoverActiveSet {
  hoveredId: string
  /** Hovered entity + every entity directly connected to it (any region). */
  entityIds: Set<string>
  /** Expanded regions containing an active entity (their circle + chip stay lit). */
  regionIds: Set<string>
  /**
   * Base-graph nodes genuinely on the relationship path: collapsed clusters
   * the active entities line to, the active regions' own Sources, and
   * Insights whose routed link is anchored to an active entity, and every
   * Insight connected to the hovered entity's own region (its cluster's
   * Insight links — the entity's real Insight relationships). Everything else
   * in the base graph drops to the disabled opacity.
   */
  baseNodeIds: Set<string>
  /**
   * Keys of the routed connection lines that are part of this relationship —
   * the Insight lines of the hovered entity's region, plus any line anchored
   * to an active entity. The renderer lights exactly these, so line visibility
   * and Insight visibility can never disagree.
   */
  routedKeys: Set<string>
}

/** Derive the hover active set for `entityId`. Pure — reads the model only. */
export function deriveHoverActiveSet(
  model: DrilldownModel,
  entityId: string,
): HoverActiveSet {
  const entityIds = new Set<string>([entityId])
  const baseNodeIds = new Set<string>()

  // Directly connected entities (both directions), and collapsed clusters the
  // hovered entity lines to (bKind 'cluster' → the far side is a base node).
  for (const rel of model.entityRelations) {
    if (rel.bKind === 'entity') {
      if (rel.aEntityId === entityId) entityIds.add(rel.bEntityId)
      if (rel.bEntityId === entityId) entityIds.add(rel.aEntityId)
    } else if (rel.aEntityId === entityId) {
      baseNodeIds.add(rel.bEntityId) // a related COLLAPSED cluster
    }
  }

  // Regions that contain an active entity — their container and chip stay lit,
  // and their Source is part of the path (the membership fan ends on it).
  const regionIds = new Set<string>()
  for (const region of model.regions) {
    if (!region.entities.some(e => entityIds.has(e.node.id))) continue
    regionIds.add(region.cluster.id)
    if (region.hubId) baseNodeIds.add(region.hubId)
  }

  // Insights whose connection is anchored to an active entity — the routed
  // `Insight → entity` line is exactly the relationship being inspected.
  for (const link of model.routedLinks) {
    if (link.sourceAnchorEntityId && entityIds.has(link.sourceAnchorEntityId)) {
      baseNodeIds.add(link.targetId)
    }
    if (link.targetAnchorEntityId && entityIds.has(link.targetAnchorEntityId)) {
      baseNodeIds.add(link.sourceId)
    }
  }

  // ── INSIGHTS CONNECTED TO THE HOVERED ENTITY ────────────────────────────
  // Read from the GRAPH RELATIONS, never from what happens to be drawn near
  // the cursor: an entity belongs to its cluster, and that cluster's Insight
  // links ARE that entity's Insight relationships. `model.insightRegions` is
  // exactly that mapping (insight → the expanded regions it connects to),
  // derived from the live link data.
  //
  // This is deliberately NOT the anchor test above. A routed Insight line is
  // drawn to ONE hash-picked entity inside the region — a rendering choice
  // about where the segment lands, not a statement about which entity the
  // Insight relates to. Keying visibility off it meant hovering any of the
  // region's other entities dimmed an Insight that is genuinely connected to
  // the cluster the entity belongs to. Region membership is the real relation,
  // so every entity in a region resolves the same Insight set.
  //
  // Scoped to the HOVERED entity's own region(s): Insights belonging to a
  // cross-linked partner's region are one relationship further out and stay
  // dimmed, exactly as before.
  const hoveredRegionIds = new Set<string>()
  for (const region of model.regions) {
    if (region.entities.some(e => e.node.id === entityId)) {
      hoveredRegionIds.add(region.cluster.id)
    }
  }
  const insightIds = new Set(model.insightRegions.keys())
  for (const [insightId, joinedRegionIds] of model.insightRegions) {
    if (joinedRegionIds.some(rid => hoveredRegionIds.has(rid))) baseNodeIds.add(insightId)
  }

  // The routed lines that ARE this relationship, so the renderer lights exactly
  // these instead of re-deriving its own rule: any line anchored to an active
  // entity, plus every Insight line of the hovered entity's own region.
  const routedKeys = new Set<string>()
  for (const link of model.routedLinks) {
    const anchored = (link.sourceAnchorEntityId && entityIds.has(link.sourceAnchorEntityId))
      || (link.targetAnchorEntityId && entityIds.has(link.targetAnchorEntityId))
    const sourceIsHoveredRegion = hoveredRegionIds.has(link.sourceId)
    const targetIsHoveredRegion = hoveredRegionIds.has(link.targetId)
    const farId = sourceIsHoveredRegion
      ? link.targetId
      : targetIsHoveredRegion ? link.sourceId : null
    const insightOfHoveredRegion = !!farId && insightIds.has(farId)
    if (anchored || insightOfHoveredRegion) routedKeys.add(link.key)
  }

  return { hoveredId: entityId, entityIds, regionIds, baseNodeIds, routedKeys }
}

// ── GEOMETRY HELPERS (pure, deterministic) ────────────────────────────────

export interface RegionCenter { x: number, y: number }

/**
 * Where each region is DRAWN, derived from the live node positions every frame.
 *
 * A region starts at its cluster's own position — it is the same cluster, just
 * larger — and is then adjusted twice, both deterministically:
 *
 * 1. Pushed OUTWARD along its Source→cluster axis until the circle's near edge
 *    clears the Source. Clusters orbit their Source closely, so without this
 *    the Source node would end up inside the expanded circle instead of beside
 *    it (requirement: the Source must stay visible, outside the region).
 * 2. Separated from any other expanded region it would overlap, the primary
 *    region moving least so the clicked cluster keeps the strongest anchor.
 *
 * Pure function of the current node positions: recomputed on every simulation
 * tick, so a dragged Source carries its expanded region with it.
 */
export function computeRegionCenters(
  model: DrilldownModel,
  nodeById: Map<string, NetworkNode>,
): Map<string, RegionCenter> {
  const { hubClearance, regionGap, sharedInsightSeam } = EXPANDED_CLUSTER.region
  const centers = new Map<string, RegionCenter>()

  // Region pairs joined by a shared Insight need a WIDER seam: the Insight
  // must fit between them while staying outside both envelopes — with the
  // normal gap, "between the clusters" and "outside every envelope" are
  // geometrically incompatible and the Insight oscillates in the seam.
  const sharedPairs = new Set<string>()
  for (const regionIds of model.insightRegions.values()) {
    if (regionIds.length < 2) continue
    for (let i = 0; i < regionIds.length; i++) {
      for (let j = i + 1; j < regionIds.length; j++) {
        sharedPairs.add(regionIds[i] < regionIds[j]
          ? `${regionIds[i]}~${regionIds[j]}`
          : `${regionIds[j]}~${regionIds[i]}`)
      }
    }
  }
  const gapFor = (aId: string, bId: string) =>
    sharedPairs.has(aId < bId ? `${aId}~${bId}` : `${bId}~${aId}`)
      ? sharedInsightSeam
      : regionGap

  for (const region of model.regions) {
    const cx = region.cluster.x || 0
    const cy = region.cluster.y || 0
    const hub = region.hubId ? nodeById.get(region.hubId) : undefined
    if (!hub) {
      centers.set(region.cluster.id, { x: cx, y: cy })
      continue
    }
    const dx = cx - (hub.x || 0)
    const dy = cy - (hub.y || 0)
    const dist = Math.hypot(dx, dy)
    // Degenerate case (cluster sitting on its hub): no meaningful axis to push
    // along, so leave it where it is rather than pick an arbitrary direction.
    if (dist < 1e-3) {
      centers.set(region.cluster.id, { x: cx, y: cy })
      continue
    }
    const needed = region.radius + hubClearance - dist
    const push = Math.max(0, needed)
    centers.set(region.cluster.id, { x: cx + (dx / dist) * push, y: cy + (dy / dist) * push })
  }

  // Pairwise separation. Few regions (≤ 1 + maxRelatedRegions), fixed iteration
  // count, no randomness — same input positions always give the same result.
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < model.regions.length; i++) {
      for (let j = i + 1; j < model.regions.length; j++) {
        const a = model.regions[i]
        const b = model.regions[j]
        const ca = centers.get(a.cluster.id)!
        const cb = centers.get(b.cluster.id)!
        const dx = cb.x - ca.x
        const dy = cb.y - ca.y
        const dist = Math.hypot(dx, dy) || 1e-3
        const minDist = a.radius + b.radius + gapFor(a.cluster.id, b.cluster.id)
        if (dist >= minDist) continue
        const overlap = minDist - dist
        const ux = dx / dist
        const uy = dy / dist
        // The primary region holds its ground; contextual regions yield.
        const aShare = a.primary ? 0.15 : b.primary ? 0.85 : 0.5
        ca.x -= ux * overlap * aShare
        ca.y -= uy * overlap * aShare
        cb.x += ux * overlap * (1 - aShare)
        cb.y += uy * overlap * (1 - aShare)
      }
    }
  }

  return centers
}

/**
 * DISPLAY-ONLY Source positions: where each expanded region's Source must be
 * DRAWN so it never sits on top of, or inside, an expanded circle.
 *
 * Runs after `computeRegionCenters`, because that function's own hub clearance
 * is not the last word — its pairwise region separation pass moves centres
 * again afterwards (and can push a region straight back over a Source), and a
 * region belonging to a different hub is never checked against this Source at
 * all. This is the final guarantee, evaluated against the centres that are
 * actually drawn.
 *
 * The rule, per Source: if it falls within `region radius + Source radius +
 * hubDisplayGap` of a region centre, re-anchor it to exactly that distance
 * along the centre→Source direction — so the Source keeps the angular
 * relationship it had with its cluster and simply slides outward. Its OWN
 * region is resolved first, using the Source's original direction, so that
 * angle is the one preserved; other regions are then cleared in a few bounded
 * passes.
 *
 * ⚠️ Returns positions to draw with. It never writes to the node objects, so
 * the force simulation's coordinates — and therefore Normal Unstructured mode,
 * Structured mode and the global layout — are completely untouched. Only hubs
 * that actually need moving appear in the map.
 */
export function computeHubDisplayPositions(
  model: DrilldownModel,
  nodeById: Map<string, NetworkNode>,
  centers: Map<string, RegionCenter>,
  hubRadiusOf: (node: NetworkNode) => number,
): Map<string, RegionCenter> {
  const gap = EXPANDED_CLUSTER.region.hubDisplayGap
  const nodeClearance = EXPANDED_CLUSTER.region.hubNodeClearance
  const displays = new Map<string, RegionCenter>()

  const hubIds = new Set<string>()
  for (const region of model.regions) {
    if (region.hubId) hubIds.add(region.hubId)
  }

  // ── HUB EXCLUSION ZONE vs OTHER VISIBLE NODES ─────────────────────────────
  // Clearing the regions is not enough: a re-anchored Source can land on top
  // of an insight, a collapsed cluster, or another hub. Every visible base
  // node (expanded clusters are hidden; raw entities are never drawn in the
  // base graph) is an obstacle with its own radius, and the hub keeps
  // `hub radius + obstacle radius + hubNodeClearance` distance from each.
  const expandedIds = new Set(model.regions.map(r => r.cluster.id))
  const obstacleNodes = [...nodeById.values()].filter(n =>
    (n.kind === 'insight' || n.kind === 'cluster' || n.kind === 'source' || n.kind === 'document')
    && !expandedIds.has(n.id))

  // Deterministic hub order: earlier hubs' final display positions become
  // obstacles for later ones.
  for (const hubId of [...hubIds].sort()) {
    const hub = nodeById.get(hubId)
    if (!hub) continue
    const origin: RegionCenter = { x: hub.x || 0, y: hub.y || 0 }
    const hubRadius = hubRadiusOf(hub)
    let position: RegionCenter = { ...origin }

    /**
     * Clear one region, keeping the direction `from` defines. Passing the
     * ORIGINAL position for the Source's own region is what preserves its
     * angular direction relative to its cluster.
     */
    const clearRegion = (region: DrilldownRegion, from: RegionCenter) => {
      const centre = centers.get(region.cluster.id)
      if (!centre) return
      const needed = region.radius + hubRadius + gap
      if (Math.hypot(position.x - centre.x, position.y - centre.y) >= needed) return

      let dx = from.x - centre.x
      let dy = from.y - centre.y
      let dist = Math.hypot(dx, dy)
      if (dist < 1e-3) {
        // Source sitting exactly on the region centre: no direction to
        // preserve, so fall back to the cluster's own axis, and to +x only if
        // that is degenerate too. Deterministic either way — never arbitrary.
        dx = (region.cluster.x || 0) - centre.x
        dy = (region.cluster.y || 0) - centre.y
        dist = Math.hypot(dx, dy)
        if (dist < 1e-3) {
          dx = 1
          dy = 0
          dist = 1
        }
      }
      position = { x: centre.x + (dx / dist) * needed, y: centre.y + (dy / dist) * needed }
    }

    /** Push the hub display position out of one obstacle's exclusion zone. */
    const clearObstacle = (obs: { x: number, y: number, r: number }) => {
      const needed = hubRadius + obs.r + nodeClearance
      const dx = position.x - obs.x
      const dy = position.y - obs.y
      const dist = Math.hypot(dx, dy)
      if (dist >= needed) return
      if (dist < 1e-3) {
        // Exactly coincident: deterministic +x, never arbitrary.
        position = { x: obs.x + needed, y: obs.y }
        return
      }
      position = { x: obs.x + (dx / dist) * needed, y: obs.y + (dy / dist) * needed }
    }

    const own = model.regions.filter(r => r.hubId === hubId)
    const others = model.regions.filter(r => r.hubId !== hubId)
    const obstacles = obstacleNodes
      .filter(n => n.id !== hubId)
      .map(n => {
        // Another hub may itself have been re-anchored — collide against
        // where it is DRAWN, not where its simulation coordinate is.
        const at = displays.get(n.id) ?? { x: n.x || 0, y: n.y || 0 }
        return { x: at.x, y: at.y, r: hubRadiusOf(n) }
      })
    for (const region of own) clearRegion(region, origin)
    // Clearing one circle can push the Source into another (region or node);
    // bounded interleaved passes, fixed order, no randomness — the same input
    // always gives the same result. Regions run last within each pass: the
    // "outside every expanded circle" guarantee is the one that must win.
    for (let pass = 0; pass < 3; pass++) {
      for (const obs of obstacles) clearObstacle(obs)
      for (const region of others) clearRegion(region, position)
    }

    if (position.x !== origin.x || position.y !== origin.y) displays.set(hubId, position)
  }

  return displays
}

/** The point on a circle of radius `r` around (cx,cy) facing (tx,ty). */
export function anchorOn(cx: number, cy: number, r: number, tx: number, ty: number) {
  const dx = tx - cx
  const dy = ty - cy
  const dist = Math.hypot(dx, dy) || 1
  return { x: cx + (dx / dist) * r, y: cy + (dy / dist) * r }
}

/**
 * Trim a straight segment A→B by a radius at each end, so the line meets the
 * visible node/region boundaries instead of crossing through the circles.
 * Returns null when the endpoints are too close for a visible segment —
 * drawing a degenerate/inverted stub would read as noise.
 *
 * THE line primitive of this layer: one straight segment, no control points.
 */
export function trimmedSegment(
  x1: number, y1: number, rA: number,
  x2: number, y2: number, rB: number,
): { x1: number, y1: number, x2: number, y2: number } | null {
  const dx = x2 - x1
  const dy = y2 - y1
  const dist = Math.hypot(dx, dy)
  if (dist <= rA + rB + 0.5) return null
  const ux = dx / dist
  const uy = dy / dist
  return {
    x1: x1 + ux * rA,
    y1: y1 + uy * rA,
    x2: x2 - ux * rB,
    y2: y2 - uy * rB,
  }
}
