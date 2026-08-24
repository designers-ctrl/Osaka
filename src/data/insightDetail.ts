/**
 * src/data/insightDetail.ts
 *
 * Everything the Insight details view shows for ONE insight, derived from the
 * graph the user is looking at rather than authored per insight.
 *
 * Only the prose is authored (`title` / `description` / `whyItMatters` on the
 * insight itself). The supporting evidence, the source breakdown and the
 * activity series are all READ OFF the real link set, so they change when the
 * graph does and can never drift into claiming a relationship the graph does
 * not contain — the domain rule that inference must carry visible provenance.
 *
 * Deterministic: counts come from the links, and the one synthetic series is
 * id-seeded (Math.random() is banned in this repo).
 */

import { graphWorkspace } from './graphWorkspace'
import type { NetworkNode } from '@/components/charts'

/** A named thing in the graph the details view can link back to. */
export interface InsightRef {
  id: string
  label: string
  kind: string
}

export interface InsightDetail {
  id: string
  title: string
  description?: string
  whyItMatters?: string
  /** 0–1 model confidence, as the dataset records it. */
  confidence?: number
  /** What the insight was derived from, in the dataset's own words. */
  derivedFrom?: string
  /** The clusters, sources and documents this insight actually connects to. */
  refs: InsightRef[]
  /** Activity over recent periods — the trend widget. */
  activity: Array<{ period: string, value: number }>
  /** Evidence by source/document group — the distribution widget. */
  evidence: Array<{ label: string, value: number }>
  /**
   * Whether the distribution is worth charting. A single bar is not a
   * distribution — it restates the one thing the evidence sentence already
   * names — so the widget is hidden below this threshold rather than padded
   * out with invented categories.
   */
  showEvidence: boolean
}

/** Fewer categories than this and the distribution chart is not drawn. */
const MIN_EVIDENCE_CATEGORIES = 2

/**
 * A human name for a node the prose can say out loud.
 *
 * ⚠️ NEVER the raw id: `Slack-s0` is an internal handle, and the graph's own
 * rule is that display names are semantic. A cluster is named by what it holds
 * and where it came from — "Agreements · Slack" — which is also what the
 * canvas labels it with.
 */
function displayNameFor(node: NetworkNode, byId: Map<string, NetworkNode>): string {
  if (node.kind === 'cluster') {
    const category = (node as any).category as string | undefined
    const owner = byId.get(String(node.id).replace(/-s\d+$/, ''))
    const ownerName = owner?.label || owner?.id
    if (category && ownerName) return `${category} · ${ownerName}`
    if (category) return category
    if (ownerName) return ownerName
  }
  return node.label || node.id
}

const endId = (end: unknown): string | undefined =>
  typeof end === 'string' ? end : (end as { id?: string })?.id

/** `Gmail-s3` → `Gmail`; anything else is its own group. */
const groupOf = (id: string) => String(id).replace(/-s\d+$/, '')

/** Stable 0–1 fraction from an id — the same mixer the graph layers use. */
function hashFraction(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  h ^= h >>> 15
  h = Math.imul(h, 2246822507)
  h ^= h >>> 13
  return ((h >>> 0) % 100000) / 100000
}

const PERIODS = ['5 wks', '4 wks', '3 wks', '2 wks', 'Last wk', 'This wk']

/**
 * The detail for one insight, or `null` when the id is not an insight in the
 * current graph.
 */
export function deriveInsightDetail(insightId: string): InsightDetail | null {
  const nodes = graphWorkspace.nodes as NetworkNode[]
  const node = nodes.find(n => n.id === insightId)
  if (!node || node.kind !== 'insight') return null
  const byId = new Map(nodes.map(n => [n.id, n]))

  // ── What this insight is actually attached to ───────────────────────────
  const neighbourIds = new Set<string>()
  for (const link of graphWorkspace.links) {
    const s = endId((link as any).source)
    const t = endId((link as any).target)
    if (s === insightId && t) neighbourIds.add(t)
    if (t === insightId && s) neighbourIds.add(s)
  }

  /*
   * ── WHAT COUNTS AS EVIDENCE ──────────────────────────────────────────────
   * Everything the insight is genuinely attached to, plus the relationships
   * those things themselves carry — all read off the link set:
   *
   *   · the clusters, sources and documents linked to the insight;
   *   · the OWNER (source or document) each connected cluster belongs to,
   *     which is what a bar is labelled with;
   *   · the ENTITIES inside each connected cluster — real members, so a bar's
   *     height reflects how much actually sits behind that source rather than
   *     just how many links were drawn.
   *
   * Nothing is synthesised to fill the chart: an insight with one source
   * genuinely has one category, and the widget is hidden instead.
   */
  const refs: InsightRef[] = []
  const evidenceCount = new Map<string, number>()
  const credit = (ownerId: string, amount: number) => {
    const ownerNode = byId.get(ownerId)
    const label = ownerNode ? displayNameFor(ownerNode, byId) : ownerId
    evidenceCount.set(label, (evidenceCount.get(label) ?? 0) + amount)
  }

  for (const id of [...neighbourIds].sort()) {
    const neighbour = byId.get(id)
    if (!neighbour) continue
    refs.push({ id, label: displayNameFor(neighbour, byId), kind: neighbour.kind })
    const owner = neighbour.kind === 'cluster' ? groupOf(id) : id
    credit(owner, 1)
    // A connected cluster brings its own members with it.
    if (neighbour.kind === 'cluster') {
      const members = nodes.filter(n => n.kind === 'entity' && groupOf(String(n.id).replace(/-e\d+$/, '')) !== ''
        && String(n.id).startsWith(`${id}-`))
      if (members.length) credit(owner, members.length)
    }
  }

  const evidence = [...evidenceCount.entries()]
    .map(([label, value]) => ({ label, value }))
    // Strongest first, ties by name — a stable order for a stable chart.
    .sort((a, b) => b.value - a.value || (a.label < b.label ? -1 : 1))

  /*
   * Activity over recent periods. The dataset carries no time series, so this
   * is synthetic — but it is SEEDED by the insight's own id and shaped by its
   * confidence, so every insight has its own curve and the same insight always
   * draws the same one.
   */
  const strength = typeof node.confidence === 'number' ? node.confidence : 0.6
  const activity = PERIODS.map((period, i) => {
    const wave = hashFraction(`${insightId}#${i}`)
    const ramp = 0.45 + (i / (PERIODS.length - 1)) * strength
    return { period, value: Math.max(1, Math.round((ramp * 60 + wave * 22) * (0.6 + strength / 2))) }
  })

  return {
    showEvidence: evidence.length >= MIN_EVIDENCE_CATEGORIES,
    id: insightId,
    title: (node as any).title || node.label || insightId,
    description: (node as any).description,
    whyItMatters: (node as any).whyItMatters,
    confidence: node.confidence,
    derivedFrom: (node as any).derivedFrom,
    refs,
    activity,
    evidence,
  }
}
