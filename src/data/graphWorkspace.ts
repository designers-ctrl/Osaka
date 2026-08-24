/**
 * src/data/graphWorkspace.ts
 *
 * The dataset behind the Graph workspace screen (src/screens/GraphWorkspace.vue).
 *
 * House rule (CLAUDE.md): a screen is a PURE VIEW over a typed dataset. Every
 * figure, label, node and line on that screen comes from here — the screen
 * hardcodes nothing. A real backend drops in by producing these same shapes,
 * which is why the contracts below are written as if they were the API response.
 *
 * ⚠️ EVERYTHING HERE IS SYNTHETIC AND DELIBERATELY SO.
 * Osaka's domain rules require it: the real product builds this graph out of a
 * team's email, calendar, CRM and documents, including people who never used
 * the product. So the people, companies, deals and documents below are invented
 * — "Legalfab", "Project Atlas", "Northwind" are placeholders, not redactions of
 * anything real. Never replace them with captured customer data, and never paste
 * real correspondence into a fixture.
 *
 * The second domain rule shows up in the TYPES themselves: anything the model
 * concluded (`insight`, `cluster`, the insight-potential card) carries
 * `confidence` and `derivedFrom`, because the UI is required to show a user why
 * an inference exists and how sure Osaka is. Ingested facts carry neither.
 */

import type { NetworkLink, NetworkNode } from '@/components/charts'
import { entityLabelFor, entityPopulationTarget } from './entityFill'
import { withoutDisallowedLinks } from './graphLinkRules'
// The three logos that lead the stacked avatars. These ship as PNGs (the rest of
// the marks are SVG) and already carry their own coloured disc, which is why the
// avatar renders them full-bleed rather than on a tinted background.
import DropboxLogo from '@/assets/logo-icon01.png'
import ZoomLogo from '@/assets/logo-icon02.png'
import UdemyLogo from '@/assets/logo-icon03.png'
import LinkedInLogo from '@/assets/nodeSourceIcons/Linkedin.svg'
import WhatsAppLogo from '@/assets/nodeSourceIcons/Whatsapp.svg'
import SpotifyLogo from '@/assets/nodeSourceIcons/Spotify.svg'
import {
  GRAPH_SOURCES,
  GRAPH_SOURCE_ICONS,
  GRAPH_DOCUMENTS,
  GRAPH_DOCUMENT_HUBS,
  GRAPH_INSIGHTS,
  GRAPH_CONNECTIONS,
  GRAPH_CLUSTER_CONFIG,
} from './graph-config'

// ── UTILITIES ──────────────────────────────────────────────────────────────

/**
 * Truncate text to fit within 120px width.
 * Approximates character count based on typical font rendering (~6.8px per char at default size).
 * Adds ellipsis (…) when truncated.
 */
function truncateLabel(text: string, maxWidthPx: number = 120): string {
  const avgCharWidth = 6.8
  const maxChars = Math.floor(maxWidthPx / avgCharWidth)
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars - 1) + '…'
}

// ── CONTRACTS ──────────────────────────────────────────────────────────────

/** The signed-in user, as the workspace chrome needs them. */
export interface WorkspaceUser {
  /** Full name — the accessible label on the avatar. */
  name: string
  /** Two-letter fallback drawn in the avatar. */
  initials: string
  /** Unread count on the notification bell; 0 hides the badge. */
  unread: number
  /** Account email shown in the profile menu header. */
  email: string
  /** Token balance shown in the profile menu header (TokensBadge). */
  tokens: number
}

/** One selectable canvas view mode (the two icon toggles in the toolbar). */
export interface GraphViewMode {
  id: string
  /** Semantic key from src/icons/carbon.ts. */
  icon: string
  /** Accessible name — these are icon-only controls. */
  label: string
}

/** A tick on the vertical time rail: an hour, and how busy the graph was in it. */
export interface TimelineHour {
  /** Display label, e.g. "01 PM". */
  label: string
  /**
   * 0–1 — share of the day's activity that landed in this hour. Drives the bar
   * width on the rail, so it is a proportion, never a raw event count.
   */
  activity: number
  /** Marks the hour the canvas is currently showing. */
  current?: boolean
  /** Count of insights that appeared in this hour — shows as yellow dots. */
  insightCount?: number
  /**
   * WHEN inside the hour each insight landed, as fractions of the hour slot
   * (0 = top of the slot, 1 = bottom). The rail draws one dot per entry at that
   * vertical offset, so insights read as separate moments within the hour rather
   * than a row of marks beside it.
   *
   * Optional: when omitted the screen spreads `insightCount` dots evenly through
   * the slot, so an hour that only knows how MANY insights it has still renders.
   */
  insightOffsets?: number[]
  /**
   * Per-quarter activity (0–1), four entries: :00 / :15 / :30 / :45. Drives the
   * four histogram rows inside this hour. Optional: when omitted the screen
   * repeats the hour's `activity` for all four quarters, so coarser data still
   * renders.
   */
  quarters?: number[]
}

/** The legend — the key to the mark vocabulary, i.e. what is fact vs inference. */
export interface GraphLegendEntry {
  /** Matches a NetworkNodeKind, or a link kind, so legend and canvas can't drift. */
  id: string
  label: string
  /** How the swatch is drawn: a node mark or a connecting line. */
  shape: 'dot' | 'ring' | 'dashed-ring' | 'line' | 'dotted-line'
  /**
   * Which mark ROLE the swatch stands for — never a hex and never a theme token.
   * The screen resolves the actual color through the same chart theme
   * NetworkChart draws with, so a legend swatch cannot drift from the mark it
   * describes (the earlier version named theme tokens, and the legend's "Entity"
   * swatch immediately disagreed with the purple on the canvas).
   */
  ink: 'insight' | 'entity' | 'structure'
}

/** The staged suggestion above the composer — model output, so it must explain itself. */
export interface InsightPrompt {
  /** Short kicker naming what kind of finding this is. */
  kind: string
  /** The finding, written for the user. `emphasis` is the phrase to highlight. */
  body: string
  emphasis: string
  /** 0–1. Rendered as a percentage — never shown as a bare claim. */
  confidence: number
  /** What the model looked at to conclude this. */
  derivedFrom: string
  /** Label of the control that opens the full reasoning. */
  action: string
}

/** One connected tool — its name plus the logo the stacked avatars render. */
export interface ConnectedTool {
  name: string
  /** Resolved asset URL of the tool's logo; omitted when no logo asset exists. */
  image?: string
}

/** Progress connecting the tools Osaka ingests from. */
export interface ConnectedSources {
  connected: number
  total: number
  /** The connected tools, for the stacked avatars + their tooltip. */
  tools: ConnectedTool[]
  /** The nudge copy shown beside the counter. */
  body: string
  action: string
}

/** One counter in the memory-growth header row. */
export interface MemoryStat {
  id: string
  label: string
  value: number
  /** Change over the selected window; negative renders as a decline. */
  delta: number
}

/**
 * One bar in the memory-growth chart. Every window the chart offers is a CLOSED
 * one — last week, last month, last quarter — so each point is a recorded count.
 * Nothing here is projected; a forecast would need its own field and the
 * confidence/provenance the domain rules require of model output.
 */
export interface MemoryPoint {
  /** Day label on the category axis. */
  day: string
  /** Entities the graph gained that day — the bars. */
  added: number
  /** Insights Osaka surfaced that day — the line drawn over them. */
  insights: number
}

/** How the graph is growing, over a selectable window. */
export interface MemoryGrowth {
  /** Options for the window select, e.g. "Last week". */
  ranges: string[]
  selectedRange: string
  stats: MemoryStat[]
  series: MemoryPoint[]
  /**
   * What each of the chart's two readings is called. The chart plots two
   * different measures on one axis, so both the key and the tooltip name them
   * from here rather than falling back to the raw row keys.
   */
  measures: { added: string, insights: string }
}

/** A small figure tile below the chart. */
export interface WorkspaceMeter {
  id: string
  /** Semantic icon key from src/icons/carbon.ts. */
  icon: string
  label: string
  /** Pre-formatted for display, because the unit differs per tile (% vs count). */
  display: string
  /**
   * 0–1, the fraction of the donut that is filled. Required: every tile draws an
   * arc, so a tile whose `display` is a plain count still needs a proportion here.
   *
   * ⚠️ For a count that has no real denominator this is a DISPLAY placeholder, not
   * a measurement — see the `agents` entry. Anything shipped to users needs a real
   * denominator behind it.
   */
  ratio: number
  /** One line explaining what the figure counts — exposed to assistive tech. */
  hint: string
}

/**
 * The sentiment figure annotating the graph canvas's centre ring.
 *
 * This lives outside `meters` because it is not a rail tile: it labels the canvas
 * itself (see components/graphs/structured/components/renderCenterRing.ts). Keeping
 * it as its own field is what lets the rail show two tiles without the centre ring
 * losing its value — the two surfaces have genuinely different owners.
 *
 * It is model output, not a fact, so it always travels with the label and the
 * derivation shown in `hint` (see the inference rule in CLAUDE.md).
 */
export interface GraphSentiment {
  /** 0–1. */
  ratio: number
  label: string
  /** What the figure is derived from. */
  hint: string
}

/** One conversation offered by the rail-header switcher dropdown. */
export interface ConversationRow {
  id: string
  title: string
}

/** The assistant composer at the foot of the rail. */
export interface Composer {
  /**
   * The conversations the switcher can jump between. The rail header shows
   * the active one's title; the dropdown lists them all.
   */
  conversations: ConversationRow[]
  /** id of the conversation the rail currently shows — must exist in `conversations`. */
  activeConversationId: string
  /**
   * Seed text for the composer. Empty is the default state — the screen opens
   * on the placeholder with the composer as a single inline row. Fill it only to
   * demonstrate the multi-line state, since any text long enough to wrap starts
   * the composer stacked.
   */
  draft: string
  placeholder: string
  /** The prompt suggestions behind the tab above the composer. */
  suggestions: ComposerSuggestion[]
}

/** One row in the composer's suggestions panel. */
export interface ComposerSuggestion {
  id: string
  /** Semantic key from src/icons/carbon.ts. */
  icon: string
  text: string
}

/** One row in the notifications dropdown. */
export interface WorkspaceNotification {
  id: string
  title: string
  /** One-line summary of what the agent found or produced. */
  description: string
  /** Relative time, preformatted by the backend ("2 h ago"). */
  timestamp: string
  /** Semantic key from src/icons/carbon.ts. */
  icon: string
  /** Unread rows carry the green status dot; the bell badge counts them. */
  unread: boolean
}

/** The whole screen, in one shape. */
export interface GraphWorkspaceData {
  user: WorkspaceUser
  notifications: WorkspaceNotification[]
  /** Label for the canvas date scope, e.g. "Today". */
  dateRanges: string[]
  selectedDate: string
  viewModes: GraphViewMode[]
  selectedViewMode: string
  timeline: TimelineHour[]
  /** Default time period selection; indices into timeline array. */
  defaultPeriod: { start: number, end: number }
  nodes: NetworkNode[]
  links: NetworkLink[]
  legend: GraphLegendEntry[]
  insightPrompt: InsightPrompt
  sources: ConnectedSources
  memory: MemoryGrowth
  meters: WorkspaceMeter[]
  sentiment: GraphSentiment
  composer: Composer
  /** The rail's default (pre-conversation) content. */
  railSummary: RailSummary
  /** The scripted answer the chat demo replays. */
  demoAnswer: DemoAnswer
}

/**
 * What the assistant rail shows before a conversation starts: one short reading
 * of the whole graph, and the three counts underneath it.
 *
 * The KPI entries carry LABEL and ICON only — never a number. Each value is
 * resolved by the screen from what the app already knows (the live graph for
 * sources and insights, the memory stats for entities), so the rail cannot
 * quietly disagree with the canvas beside it.
 */
export interface RailSummary {
  title: string
  /**
   * The summary paragraph as ordered inline runs — the SAME rich-text shape
   * the assistant answer uses, so names of real graph items (sources,
   * documents, clusters, entities) carry a `refId` and render as interactive
   * references with the answer's own hover-isolation behaviour. Only names
   * that resolve to an actual node id are marked; everything else stays a
   * plain string run.
   */
  body: AnswerRichText
  kpis: RailKpi[]
}

export interface RailKpi {
  /** Which value the screen resolves for this card. */
  id: 'entities' | 'insights' | 'sources'
  label: string
  /** Semantic key from src/icons/carbon.ts. */
  icon: string
}

/**
 * ONE SCRIPTED ANSWER for the assistant chat demo.
 *
 * ⚠️ Model output, per the domain rules: every claim here names what it was
 * derived from (`sources`), and the whole object is clearly synthetic — invented
 * companies, invented figures. Nothing in it is presented as fact the user
 * supplied. It lives in the dataset rather than the template so the screen stays
 * a pure view and a real assistant response can drop into the same shape.
 */
/**
 * One step of the reasoning trail the thought toggle opens — rendered as an
 * AssistantAccordion row (dot + title + caret), with optional detail items
 * that carry their provenance beside them, per the domain rules.
 */
export interface DemoReasoningStep {
  id: string
  /** The step's header line. */
  title: string
  /**
   * Expandable detail rows. Same shape as AssistantAccordionItem, so the data
   * feeds that component directly and every chip is a real SourceChip rather
   * than markup repeated per row:
   *   sources  → one chip (single or folded multi, decided by the count)
   *   chips    → several chips on one row
   *   document → a document chip carrying the per-extension icon
   * A step with NO items is a plain status line — "Processing question",
   * "Finished" — and renders without a caret.
   */
  items?: Array<{
    text: string
    sources?: string[]
    chips?: string[][]
    document?: { name: string, ext?: string }
  }>
  /** Expanded on first render — the demo state the reference screenshot shows. */
  defaultOpen?: boolean
}

export interface DemoAnswer {
  /** Seconds the assistant "spent" reasoning — the thought toggle's value. */
  thoughtSeconds: number
  /** The reasoning trail behind the answer, in step order. */
  reasoning: DemoReasoningStep[]
  /** Lead paragraphs, in order. */
  summary: AnswerRichText[]
  /** Evidence blocks, each a heading plus its body. */
  evidence: DemoEvidenceSection[]
  /** Analysis sections AFTER the demand figure. */
  sections: DemoAnswerSection[]
  /** The Insights block: the highlighted card, then the concluding paragraph. */
  insight: { card: AnswerRichText, conclusion: AnswerRichText }
  /** The closing figure: evidence weight by signal, in percent. */
  barChart: DemoAnswerBarChart
  /** The figure rendered under the first evidence block. */
  chart: DemoAnswerChart
}

/**
 * One run of answer prose: a plain string, or a REFERENCE — a graph
 * source/document/entity name rendered as a subtle dotted-underline link.
 * `refId` is the graph node id the reference resolves to; a reference
 * WITHOUT one still renders as a link (the component API stays ready) but
 * has no destination yet, so clicking it is a no-op at the host.
 */
export type AnswerInline = string | { text: string, refId?: string }

/** A paragraph of answer prose, as ordered inline runs. */
export type AnswerRichText = AnswerInline[]

export interface DemoEvidenceSection {
  id: string
  heading: string
  body: AnswerRichText
  /** The surfaces this block was read from — shown as provenance. */
  sources: string[]
}

/** A plain heading + paragraph section of the answer (no provenance row). */
export interface DemoAnswerSection {
  id: string
  heading: string
  body: AnswerRichText
}

export interface DemoAnswerChart {
  /** Card heading. */
  title: string
  /** Accessible name for the figure itself. */
  ariaTitle: string
  xLabel: string
  /** Optional value-axis caption; the demand figure deliberately has none. */
  yLabel?: string
  points: Array<{ month: string, value: number }>
}

export interface DemoAnswerBarChart {
  title: string
  ariaTitle: string
  points: Array<{ label: string, value: number }>
}

// ── SYNTHETIC DATA ─────────────────────────────────────────────────────────

/**
 * Satellite placement — deterministic, never random.
 *
 * A source is surrounded by entity clusters (derived groups).
 * Each cluster is surrounded by its individual entities.
 * Authoring coordinates by hand would be noise, and Math.random() would
 * re-scramble on every load (banned in this repo). Satellites spread by the
 * golden angle to fill a disc evenly without spoke patterns.
 */
const GOLDEN_ANGLE = 2.399963229728653

/**
 * Deterministic cluster-confidence spread. Cycled by satellite index so the
 * demo graph shows every semantic sentiment band the Structured badges
 * derive from confidence: success (≥85), warning (60–84), error (<60,
 * including the 35–49 range).
 */
const CLUSTER_CONFIDENCE_SPREAD = [0.92, 0.63, 0.44, 0.87, 0.71, 0.38, 0.95, 0.55, 0.78, 0.48] as const

function ring(
  hub: { id: string, x: number, y: number },
  count: number,
  kind: 'entity' | 'cluster',
  radius: number,
  sizes: readonly number[],
): { nodes: NetworkNode[], links: NetworkLink[] } {
  const nodes: NetworkNode[] = []
  const links: NetworkLink[] = []
  for (let i = 0; i < count; i++) {
    const angle = i * GOLDEN_ANGLE
    // sqrt keeps the disc evenly filled instead of crowding the center.
    const r = radius * Math.sqrt((i + 0.6) / count)
    const id = `${hub.id}-s${i}`
    nodes.push({
      id,
      kind,
      x: hub.x + Math.cos(angle) * r,
      y: hub.y + Math.sin(angle) * r,
      size: sizes[i % sizes.length],
      // Clusters are model output, so they must be able to explain themselves.
      // Confidence cycles deterministically (by satellite index) through a
      // fixed spread covering ALL semantic sentiment bands the Structured
      // badges render — error (<60), warning (60–84), success (85–100) —
      // so every state is visible in the demo graph. Synthetic, like all
      // fixtures; never random (banned in this repo).
      ...(kind === 'cluster'
        ? { confidence: CLUSTER_CONFIDENCE_SPREAD[i % CLUSTER_CONFIDENCE_SPREAD.length], derivedFrom: `${hub.id} activity` }
        : {}),
    })
    links.push({ source: hub.id, target: id, kind: 'overlap' })
  }
  return { nodes, links }
}

/**
 * Create entities within a cluster.
 * Each cluster hub has entity satellites around it.
 */
function clusterEntities(
  clusterHub: { id: string, x: number, y: number },
  count: number,
  radius: number,
  sizes: readonly number[],
  category: string | null = null,
): { nodes: NetworkNode[], links: NetworkLink[] } {
  const nodes: NetworkNode[] = []
  const links: NetworkLink[] = []
  for (let i = 0; i < count; i++) {
    const angle = i * GOLDEN_ANGLE
    const r = radius * Math.sqrt((i + 0.4) / count)
    const id = `${clusterHub.id}-e${i}`
    nodes.push({
      id,
      // Canonical synthetic name from the shared pools (entityFill.ts) — the
      // SAME label every renderer shows, in either graph mode.
      label: entityLabelFor(clusterHub.id, i, category),
      kind: 'entity',
      x: clusterHub.x + Math.cos(angle) * r,
      y: clusterHub.y + Math.sin(angle) * r,
      size: sizes[i % sizes.length],
    })
    links.push({ source: clusterHub.id, target: id })
  }
  return { nodes, links }
}

/** Build graph data from config */
const SOURCE_HUBS = GRAPH_SOURCES
const DOCUMENT_HUBS = GRAPH_DOCUMENT_HUBS
export const SOURCE_ICONS = GRAPH_SOURCE_ICONS

/**
 * Calculate how many clusters a source will generate.
 * A source is relevant only if it has at least one cluster.
 */
function getClusterCountForSource(source: typeof GRAPH_SOURCES[number]): number {
  return Math.ceil(source.satellites / GRAPH_CLUSTER_CONFIG.clusterDivisor)
}

/**
 * Filter sources to only include those with at least one cluster.
 * This prevents orphan source nodes with no related cluster connections.
 */
const RELEVANT_SOURCES = SOURCE_HUBS.filter(source => getClusterCountForSource(source) >= 1)

// Map documents from config to NetworkNode format
const DOCUMENTS: NetworkNode[] = GRAPH_DOCUMENTS.map(doc => ({
  id: doc.id,
  label: doc.label,
  kind: 'document' as const,
  x: doc.x,
  y: doc.y,
  size: doc.size,
  // The file extension, carried on the node so the renderer can build the
  // surface-toned tile AT RENDER TIME (documentNodeIconFor) — this module
  // loads before Vuetify mounts, so a tile built here could only use the
  // pre-mount fallback surface instead of the live theme token.
  ext: doc.ext,
}))

/**
 * ── TEMPORARY MOCK-DATA CLEANUP ──────────────────────────────────────────
 * Two insights hidden per design review (temporary, not a semantic change):
 * - 'ins-intro-path' — the SECOND insight connected to Slack (Slack-s1);
 * - 'ins-stalled'    — Gmail's single lower isolated insight (Gmail-s0).
 * Both the nodes and every connection touching them are filtered here, in
 * one place. To restore, delete ids from this set — nothing else to touch.
 */
const TEMP_HIDDEN_INSIGHT_IDS = new Set(['ins-intro-path', 'ins-stalled'])

// Map insights from config to NetworkNode format
const INSIGHTS: NetworkNode[] = GRAPH_INSIGHTS
  .filter(insight => !TEMP_HIDDEN_INSIGHT_IDS.has(insight.id))
  .map(insight => ({
  id: insight.id,
  kind: 'insight' as const,
  x: insight.x,
  y: insight.y,
  size: insight.size,
  confidence: insight.confidence,
  derivedFrom: insight.derivedFrom,
  timeRange: insight.timeRange,
}))

/**
 * Build set of all valid node IDs for orphan connection validation.
 * Prevents connections to filtered-out sources.
 */
const getValidNodeIds = (): Set<string> => {
  const ids = new Set<string>()
  // Add relevant sources
  RELEVANT_SOURCES.forEach(s => ids.add(s.id))
  // Add all documents (both hubs and regular documents)
  GRAPH_DOCUMENTS.forEach(d => ids.add(d.id))
  DOCUMENT_HUBS.forEach(d => ids.add(d.id))
  // Add insights
  GRAPH_INSIGHTS.forEach(i => ids.add(i.id))
  // Add all generated clusters and entities (will be added after rings are computed)
  return ids
}

// Map connections from config to NetworkLink format
// Filter out any orphan connections (connections to nodes that won't be rendered)
const getValidConnections = (): NetworkLink[] => {
  const validIds = getValidNodeIds()

  return GRAPH_CONNECTIONS
    // TEMP: connections touching a hidden insight go with it (see
    // TEMP_HIDDEN_INSIGHT_IDS above) — the `ins-` loophole below would
    // otherwise keep links to the removed nodes alive.
    .filter(conn => !TEMP_HIDDEN_INSIGHT_IDS.has(conn.source) && !TEMP_HIDDEN_INSIGHT_IDS.has(conn.target))
    .filter(conn => {
      // Check if source and target will exist in the graph
      // Source can be a cluster/insight/document ID (not just source node)
      // For clusters: {sourceId}-sN format
      const sourceExists = validIds.has(conn.source) ||
                          conn.source.includes('-s') || // Generated cluster ID
                          conn.source.startsWith('ins-') // Insight ID
      const targetExists = validIds.has(conn.target) ||
                          conn.target.includes('-s') || // Generated cluster ID
                          conn.target.startsWith('ins-') // Insight ID

      return sourceExists && targetExists
    })
    // ⛔ Insight ↔ Insight is not a relationship this graph can assert — the
    // rule, not the fixture, decides (src/data/graphLinkRules.ts).
    .filter(conn => !(conn.source.startsWith('ins-') && conn.target.startsWith('ins-')))
    .map(conn => ({
      source: conn.source,
      target: conn.target,
      kind: undefined, // Will be inferred from node types
    }))
}

const NAMED_LINKS: NetworkLink[] = getValidConnections()

/*
 * ── INSIGHT STRENGTH, FROM THE REAL GRAPH ────────────────────────────────
 * How many relationships each insight actually carries — counted from the
 * connection set just built, not from a hand-authored number. This is what
 * drives an insight's rendered radius in BOTH modes (getInsightRadius in
 * graphTokens.ts): an insight joining many clusters/sources reads bigger than
 * one hanging off a single thread.
 *
 * Deterministic by construction: the same links produce the same counts on
 * every load, and the value is attached once here so every renderer reads one
 * number instead of re-deriving its own.
 */
for (const insight of INSIGHTS) {
  let connections = 0
  for (const link of NAMED_LINKS) {
    const sourceId = typeof link.source === 'object' ? (link.source as any)?.id : link.source
    const targetId = typeof link.target === 'object' ? (link.target as any)?.id : link.target
    if (sourceId === insight.id || targetId === insight.id) connections++
  }
  ;(insight as any).connectionCount = connections
}

/*
 * …then normalised ACROSS THE CURRENT INSIGHT SET, not against a guessed
 * window. The demo graph's counts span a narrow band (1–3), and a fixed
 * 1–8 window would squeeze every insight into the bottom third of its size
 * range — visible variation is the whole point, so the set's own min/max
 * define the scale. `insightStrength` is 0 for the least-connected insight
 * and 1 for the most, whatever the absolute counts happen to be.
 */
{
  const counts = INSIGHTS.map(i => (i as any).connectionCount as number)
  const lo = Math.min(...counts)
  const hi = Math.max(...counts)
  for (const insight of INSIGHTS) {
    const c = (insight as any).connectionCount as number
    ;(insight as any).insightStrength = hi === lo ? 0.5 : (c - lo) / (hi - lo)
  }
}

/** Build hierarchy: Source → Clusters → Entities within each cluster */
// Only create clusters for relevant sources (those with at least 1 cluster)
const rings = [
  ...RELEVANT_SOURCES,
  ...DOCUMENT_HUBS,
].flatMap((source) => {
  // Create clusters around the source (using config cluster topology)
  const numClusters = Math.ceil(source.satellites / GRAPH_CLUSTER_CONFIG.clusterDivisor)
  const clusterRing = ring(source, numClusters, 'cluster', source.radius, GRAPH_CLUSTER_CONFIG.entitySizes)

  // Add time ranges, weight, and category to clusters for dynamic sizing and labeling
  const SEMANTIC_CATEGORIES = [
    'People', 'Projects', 'Organizations', 'Requirements', 'Metrics',
    'Events', 'Decisions', 'Agreements', 'Locations', 'Products',
    'Requests', 'Services', 'Links', 'Attachments', 'Workflows',
  ]

  /*
   * ── ONE NAME PER CLUSTER, WITHIN A SOURCE ────────────────────────────────
   *
   * RULE: clusters belonging to the same Source must never share a display
   * name. A hash alone does not give that — with 15 categories and a dozen
   * clusters per source, collisions are the norm, and a source showing
   * "Decisions" five times reads as five copies of one thing rather than five
   * distinct clusters.
   *
   * So the hash picks a PREFERRED category and the assignment then walks the
   * list from there to the first name this source has not used yet. Sources are
   * independent: two different sources may both have a "Decisions", which is
   * correct — the rule is about siblings, not about the graph.
   *
   * Fully deterministic: same ids in, same names out, on every reload — the hash
   * seeds it and the walk is ordered, with no `Math.random()` anywhere (a house
   * rule; it re-scrambled the graph on every load).
   */
  const usedCategories = new Set<string>()

  clusterRing.nodes.forEach((node, idx) => {
    node.timeRange = { start: idx % 3 + 1, end: Math.min(7, idx % 3 + 4) }
    // ID-seeded hash → stable/deterministic weight and category across reloads
    const clusterId = node.id
    let hash = 0
    for (let j = 0; j < clusterId.length; j++) {
      hash = (hash * 31 + clusterId.charCodeAt(j)) % 1000
    }
    // Add weight (0-100) for variable cluster sizing (from config)
    ;(node as any).weight = Math.floor(GRAPH_CLUSTER_CONFIG.weightMin + (hash / 1000) * (GRAPH_CLUSTER_CONFIG.weightMax - GRAPH_CLUSTER_CONFIG.weightMin))

    // TODO: mock categorisation, pending real AI-derived cluster categories.
    const preferred = Math.floor((hash / 1000) * SEMANTIC_CATEGORIES.length)
    let category = ''
    for (let step = 0; step < SEMANTIC_CATEGORIES.length && !category; step++) {
      const candidate = SEMANTIC_CATEGORIES[(preferred + step) % SEMANTIC_CATEGORIES.length]
      if (!usedCategories.has(candidate)) category = candidate
    }
    /*
     * A source with more clusters than there are categories still has to end up
     * with distinct names, so the preferred one is qualified — "People 2",
     * "People 3". The base word stays first, which is what the entity name pools
     * key off (entityFill.ts strips the qualifier), so a qualified cluster still
     * fills with the right kind of names.
     */
    if (!category) {
      const base = SEMANTIC_CATEGORIES[preferred]
      let suffix = 2
      while (usedCategories.has(`${base} ${suffix}`)) suffix++
      category = `${base} ${suffix}`
    }
    usedCategories.add(category)
    ;(node as any).category = category
  })

  // Create entities within each cluster
  // Distribute satellites non-uniformly across clusters (deterministic, seeded by cluster ID)
  // Each cluster gets a realistic count based on a hash of its ID, ensuring:
  // - Sum across all clusters equals source.satellites exactly
  // - Distribution is deterministic (same per reload)
  // - Variance matches real-world patterns (some clusters larger, none empty)

  // Step 1: Distribute total satellites across clusters using seeded randomization
  const clusterEntityCounts: number[] = []
  let remaining = source.satellites
  for (let i = 0; i < numClusters; i++) {
    // Seeded "random" distribution: use cluster ID hash for deterministic but non-uniform allocation
    // Hash-based seed ensures same cluster ID always gets same relative allocation
    const clusterId = `${source.id}-s${i}`
    // Simple deterministic hash: sum character codes modulo a prime
    let hash = 0
    for (let j = 0; j < clusterId.length; j++) {
      hash = (hash * 31 + clusterId.charCodeAt(j)) % 1000
    }
    // Map hash to a bias factor (0.5 to 1.5) to create variance while avoiding extremes
    const biasFactor = 0.5 + (hash % 100) / 100

    // Allocate a portion based on this cluster's bias
    let allocation = 0
    if (i === numClusters - 1) {
      // Last cluster gets all remaining entities (ensures exact sum)
      allocation = remaining
    } else {
      // Distribute remaining based on bias, leaving enough for remaining clusters (minimum 1 each)
      const avg = remaining / (numClusters - i)
      const minAlloc = Math.max(1, Math.floor(avg * 0.5))
      const maxAlloc = Math.max(1, Math.ceil(avg * 1.5))
      allocation = Math.max(minAlloc, Math.min(maxAlloc, Math.round(avg * biasFactor)))
    }
    clusterEntityCounts.push(allocation)
    remaining -= allocation
  }

  // Step 2: Create entities within each cluster.
  //
  // The count is the LARGER of the satellites allocation above and the shared
  // deterministic population target (entityFill.ts) — the same target the
  // drill-down used to reach with layer-local fill. Generating the full
  // population HERE is what makes Unstructured and Structured read one
  // identical entity set; the satellites sum is a floor, not an exact total,
  // now that the population target can exceed it.
  const entitiesInClusters = clusterRing.nodes.map((cluster, clusterIdx) => {
    const entityCountForThisCluster = Math.max(
      clusterEntityCounts[clusterIdx],
      entityPopulationTarget(cluster.id),
    )
    const clusterEntityData = clusterEntities(
      cluster,
      entityCountForThisCluster,
      GRAPH_CLUSTER_CONFIG.entityOrbitRadius,
      GRAPH_CLUSTER_CONFIG.entitySizes,
      ((cluster as any).category as string | undefined) ?? null,
    )
    // Track ACTUAL entity count from created nodes
    ;(cluster as any).entityCount = clusterEntityData.nodes.length
    // Weight takes precedence over entityCount for radius calculation
    return clusterEntityData
  })

  // Combine all nodes and links
  return {
    nodes: [
      ...clusterRing.nodes,
      ...entitiesInClusters.flatMap(e => e.nodes),
    ],
    links: [
      ...clusterRing.links,
      ...entitiesInClusters.flatMap(e => e.links),
    ],
  }
})

/*
 * ── CROSS-GROUP CLUSTER ↔ CLUSTER RELATIONSHIPS ────────────────────────────
 *
 * Every Source/Document GROUP (a hub plus its surrounding clusters) takes part
 * in at least one Cluster↔Cluster relationship with a cluster from ANOTHER
 * group, so the Unstructured graph reads as one loose connected network rather
 * than isolated islands.
 *
 * These are REAL dataset links, not decorative render-only lines: they ride the
 * same `links` array as everything else, so the force simulation (which already
 * classifies a cluster↔cluster link between two groups as `crossGroup`, with
 * its own distance and strength), hover isolation, endpoint dots and timeline
 * filtering all treat them exactly like any other relationship.
 *
 * ── THE LAYOUT RULE ────────────────────────────────────────────────────────
 *
 * A connector must not cut through a cluster GROUP. Concretely, a candidate
 * segment is rejected while a clean alternative exists if it:
 *
 * - enters the BUBBLE of any group it does not terminate in — the disc around
 *   a hub that holds its whole cluster ring (`bubbleRadius` below), which also
 *   keeps lines out of the hub's own circle and its labels' neighbourhood;
 * - passes within `CROSS_LINK_CLEARANCE` of any individual node (source,
 *   document, cluster, insight) that is not one of its own endpoints;
 * - crosses a cross-group segment already accepted.
 *
 * And a candidate may only START from a FACING cluster: one on the side of its
 * group that looks toward the partner hub. A far-side cluster would send the
 * line across its own group's bubble — the exact "line runs over a cluster
 * group" artifact this rule exists to remove.
 *
 * ── HOW THE PAIRS ARE CHOSEN — deterministic, geometry-driven ──────────────
 *
 * 1. Kruskal's spanning tree over hub pairs, nearest first: an edge is taken
 *    when it joins two still-separate components AND it has a clean candidate
 *    (no bubble hits, no node obstructions, no crossings). A blocked pair is
 *    simply SKIPPED and connectivity is found through the next-nearest pair —
 *    this is the "reject or reroute" step: the tree routes around geometry it
 *    cannot cross cleanly. Only if a full pass leaves components unmerged does
 *    a relaxed pass accept the least-blocked remaining pair, because one
 *    imperfect line still beats an island.
 * 2. For each accepted pair, candidates are the two groups' facing clusters,
 *    ranked by strict priority: fewest bubble hits, fewest node obstructions,
 *    fewest crossings with accepted segments, shortest, id order.
 *
 * Evaluated on the dataset's SEED positions — the same numbers everything else
 * derives from — so the result is stable across reloads (`Math.random()` is
 * banned in graph data). Straight single segments, like every connection.
 */
const CROSS_LINK_CLEARANCE = 34
/** Extra margin past a group's cluster orbit for its "occupied bubble". */
const GROUP_BUBBLE_MARGIN = 16

/**
 * DESIGN-REVIEWED ENDPOINT PINS, keyed by sorted hub-pair. The generator's
 * geometry runs on SEED positions, but the force simulation settles the layout
 * differently — and the review flagged one case where a seed-clean link landed
 * across a cluster after settling: the Legalfab "People" line into Google
 * Drive's "Decisions" (Google Drive-s5), which sat under the settled line. The
 * designer's fix: that hub pair connects through Google Drive's "Projects"
 * (Google Drive-s0) instead. Pins are validated like any candidate; remove one
 * if its hubs stop pairing.
 */
const CROSS_LINK_PINS: Record<string, [string, string]> = {
  'Google Drive~doc-legalfab': ['Google Drive-s0', 'doc-legalfab-s4'],
}

const CROSS_GROUP_CLUSTER_LINKS: NetworkLink[] = (() => {
  const hubs = [...RELEVANT_SOURCES, ...DOCUMENT_HUBS]
    .map(h => ({ id: h.id, x: h.x, y: h.y, radius: h.radius }))
    .sort((a, b) => (a.id < b.id ? -1 : 1))
  if (hubs.length < 2) return []

  const clusterNodes = rings.flatMap(r => r.nodes).filter(n => n.kind === 'cluster')
  const clustersOf = (hubId: string) =>
    clusterNodes.filter(n => n.id.replace(/-s\d+$/, '') === hubId)
  // Every individual node a cross-link must steer around (endpoints excluded
  // per pair).
  const obstacles = [
    ...hubs,
    ...clusterNodes,
    ...INSIGHTS,
  ].map(n => ({ id: n.id, x: n.x ?? 0, y: n.y ?? 0 }))

  type Pt = { x: number, y: number }
  const dist2 = (a: Pt, b: Pt) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2

  /** Distance from point p to segment ab. */
  const segmentDistance = (p: Pt, a: Pt, b: Pt) => {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy || 1
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
  }

  /**
   * Do two segments properly intersect? Standard orientation test. Touching at
   * a shared endpoint does NOT count — two links may legitimately meet at the
   * same cluster — and collinear overlap is treated as a crossing, because two
   * lines lying on top of each other is exactly the clutter this rejects.
   */
  const segmentsCross = (a1: Pt, a2: Pt, b1: Pt, b2: Pt): boolean => {
    const shared = (p: Pt, q: Pt) => Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6
    if (shared(a1, b1) || shared(a1, b2) || shared(a2, b1) || shared(a2, b2)) return false
    const orient = (p: Pt, q: Pt, r: Pt) => {
      const v = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y)
      return v > 1e-9 ? 1 : v < -1e-9 ? -1 : 0
    }
    const o1 = orient(a1, a2, b1)
    const o2 = orient(a1, a2, b2)
    const o3 = orient(b1, b2, a1)
    const o4 = orient(b1, b2, a2)
    if (o1 !== o2 && o3 !== o4) return true
    const onSeg = (p: Pt, q: Pt, r: Pt) =>
      Math.min(p.x, r.x) - 1e-9 <= q.x && q.x <= Math.max(p.x, r.x) + 1e-9
      && Math.min(p.y, r.y) - 1e-9 <= q.y && q.y <= Math.max(p.y, r.y) + 1e-9
    return (o1 === 0 && onSeg(a1, b1, a2)) || (o2 === 0 && onSeg(a1, b2, a2))
      || (o3 === 0 && onSeg(b1, a1, b2)) || (o4 === 0 && onSeg(b1, a2, b2))
  }

  /**
   * Each group's OCCUPIED BUBBLE: hub centre, radius spanning its actual
   * cluster orbit (the furthest cluster from the hub) plus a margin — the disc
   * a foreign line must not enter.
   */
  const bubbles = hubs.map((h) => {
    const own = clustersOf(h.id)
    const orbit = own.length
      ? Math.max(...own.map(c => Math.hypot((c.x ?? 0) - h.x, (c.y ?? 0) - h.y)))
      : h.radius
    return { id: h.id, x: h.x, y: h.y, r: orbit + GROUP_BUBBLE_MARGIN }
  })

  /**
   * FACING clusters of a group: on the near side toward the partner hub (the
   * cluster→hub offset projects positively on the hub→partner direction), so
   * the link leaves the group at its outer edge instead of crossing it.
   * Sorted nearest-to-partner. Falls back to nearest-3 for the rare group
   * whose seed ring leaves nothing strictly facing.
   */
  const facing = (hub: { x: number, y: number }, ownClusters: NetworkNode[], toward: Pt) => {
    const dirX = toward.x - hub.x
    const dirY = toward.y - hub.y
    const near = ownClusters.filter(c =>
      ((c.x ?? 0) - hub.x) * dirX + ((c.y ?? 0) - hub.y) * dirY >= 0)
    const pool = near.length ? near : ownClusters
    return [...pool].sort((m, n) =>
      dist2({ x: m.x ?? 0, y: m.y ?? 0 }, toward) - dist2({ x: n.x ?? 0, y: n.y ?? 0 }, toward))
  }

  interface Candidate { s: string, t: string, bubbleHits: number, blocked: number, crossings: number, len: number, a: Pt, b: Pt }

  /** Accepted segments so far — every candidate is crossing-tested against these. */
  const accepted: Array<{ a: Pt, b: Pt }> = []

  /** The best candidate pair for a hub pair, under the full rule set. */
  const bestPairFor = (hubA: typeof hubs[number], hubB: typeof hubs[number]): Candidate | null => {
    // A design-reviewed pin narrows the pool to exactly that cluster pair —
    // the metrics below still run on it, so a pin is validated, not blind.
    const pin = CROSS_LINK_PINS[[hubA.id, hubB.id].sort().join('~')]
    const pick = (own: NetworkNode[]) => (pin
      ? own.filter(c => pin.includes(c.id))
      : own)
    const candidatesA = pick(facing(hubA, clustersOf(hubA.id), hubB))
    const candidatesB = pick(facing(hubB, clustersOf(hubB.id), hubA))
    let best: Candidate | null = null
    for (const ca of candidatesA) {
      for (const cb of candidatesB) {
        const a = { x: ca.x ?? 0, y: ca.y ?? 0 }
        const b = { x: cb.x ?? 0, y: cb.y ?? 0 }
        // Bubbles of every group the link does not terminate in.
        const bubbleHits = bubbles.reduce((count, bub) => (
          bub.id === hubA.id || bub.id === hubB.id ? count
            : count + (segmentDistance(bub, a, b) < bub.r ? 1 : 0)
        ), 0)
        const blocked = obstacles.reduce((count, o) => (
          o.id === ca.id || o.id === cb.id ? count
            : count + (segmentDistance(o, a, b) < CROSS_LINK_CLEARANCE ? 1 : 0)
        ), 0)
        const crossings = accepted.reduce((count, seg) => (
          count + (segmentsCross(a, b, seg.a, seg.b) ? 1 : 0)
        ), 0)
        const len = dist2(a, b)
        const cand: Candidate = { s: ca.id, t: cb.id, bubbleHits, blocked, crossings, len, a, b }
        // Strict priority: bubbles pierced, then node obstructions, then
        // crossings with accepted segments, then length, then id order.
        const rank = (c: Candidate) => [c.bubbleHits, c.blocked, c.crossings, c.len]
        const better = !best || (() => {
          const kc = rank(cand)
          const kb = rank(best)
          for (let i = 0; i < kc.length; i++) {
            if (kc[i] !== kb[i]) return kc[i] < kb[i]
          }
          return `${cand.s}~${cand.t}` < `${best.s}~${best.t}`
        })()
        if (better) best = cand
      }
    }
    return best
  }

  // ── Kruskal with validation: nearest hub pairs first, skip blocked ones ──
  const parent = new Map<string, string>(hubs.map(h => [h.id, h.id]))
  const find = (id: string): string => {
    const p = parent.get(id)!
    if (p === id) return id
    const root = find(p)
    parent.set(id, root)
    return root
  }
  const pairs: Array<{ a: typeof hubs[number], b: typeof hubs[number], d: number }> = []
  for (let i = 0; i < hubs.length; i++) {
    for (let j = i + 1; j < hubs.length; j++) {
      pairs.push({ a: hubs[i], b: hubs[j], d: dist2(hubs[i], hubs[j]) })
    }
  }
  pairs.sort((m, n) => m.d - n.d || (`${m.a.id}~${m.b.id}` < `${n.a.id}~${n.b.id}` ? -1 : 1))

  const links: NetworkLink[] = []
  const used = new Set<string>()
  const take = (cand: Candidate) => {
    const key = [cand.s, cand.t].sort().join('~')
    if (used.has(key)) return
    used.add(key)
    accepted.push({ a: cand.a, b: cand.b })
    links.push({ source: cand.s, target: cand.t })
  }

  // Strict pass: only clean links (no bubbles pierced, nothing blocked or crossed).
  for (const pair of pairs) {
    if (find(pair.a.id) === find(pair.b.id)) continue
    const cand = bestPairFor(pair.a, pair.b)
    if (!cand || cand.bubbleHits > 0 || cand.blocked > 0 || cand.crossings > 0) continue
    parent.set(find(pair.a.id), find(pair.b.id))
    take(cand)
  }
  // Relaxed pass, only for components the strict pass could not join: the
  // least-imperfect line still beats an island.
  for (const pair of pairs) {
    if (find(pair.a.id) === find(pair.b.id)) continue
    const cand = bestPairFor(pair.a, pair.b)
    if (!cand) continue
    parent.set(find(pair.a.id), find(pair.b.id))
    take(cand)
  }
  return links
})()

/** Every rendered node, in one place: the dataset's own list and the kind
 *  index the link rules resolve against. */
const ALL_NODES: NetworkNode[] = [
  ...RELEVANT_SOURCES.map(h => ({ id: h.id, label: h.id, kind: 'source' as const, x: h.x, y: h.y, size: 10, sourceIcon: SOURCE_ICONS[h.id] })),
  ...DOCUMENTS,
  ...INSIGHTS,
  ...rings.flatMap(r => r.nodes),
]
const NODE_KIND_BY_ID = new Map(ALL_NODES.map(n => [n.id, n.kind]))

export const graphWorkspace: GraphWorkspaceData = {
  user: { name: 'Grace Ruiz', initials: 'GR', unread: 3, email: 'grace.ruiz@example.com', tokens: 32 },
  notifications: [
    {
      id: 'n-investor-brief',
      title: 'Investor brief ready',
      description: 'Investor Meeting Agent generated a new evidence-based brief.',
      timestamp: '2 h ago',
      icon: 'notification',
      unread: true,
    },
    {
      id: 'n-deal-signal',
      title: 'New deal signal found',
      description: 'Deal Activity Monitor found a new opportunity signal in Gmail and Drive.',
      timestamp: '2 h ago',
      icon: 'notification',
      unread: true,
    },
    {
      id: 'n-beta-demand',
      title: 'Beta demand increased',
      description: 'Beta Demand Agent detected 12 new beta-access messages from WhatsApp.',
      timestamp: '2 h ago',
      icon: 'notification',
      unread: false,
    },
    {
      id: 'n-weekly-digest',
      title: 'Weekly digest ready',
      description: 'Knowledge Digest Agent summarized 48 new graph updates from this week.',
      timestamp: '5 h ago',
      icon: 'notification',
      unread: false,
    },
    {
      id: 'n-contact-merge',
      title: 'Contact merge suggested',
      description: 'Entity Resolution Agent found 2 profiles that look like the same person.',
      timestamp: 'Yesterday',
      icon: 'notification',
      unread: true,
    },
    {
      id: 'n-meeting-notes',
      title: 'Meeting notes indexed',
      description: 'Meeting Notes Agent added action items from Tuesday’s product sync.',
      timestamp: 'Yesterday',
      icon: 'notification',
      unread: false,
    },
  ],

  dateRanges: ['Today', 'Yesterday', 'Last 7 days', 'Last 30 days'],
  selectedDate: 'Today',

  viewModes: [
    { id: 'network', icon: 'graph', label: 'Relationship view' },
    { id: 'clusters', icon: 'graphClusters', label: 'Cluster view' },
  ],
  selectedViewMode: 'network',

  // Proportions, not counts — the rail draws each as a share of the busiest hour.
  // ⚠️ New hours are APPENDED, never prepended: node `timeRange`s in
  // graph-config.ts index into this array (0–7 today), so inserting an hour at
  // the front would silently shift what every insight's window means.
  timeline: [
    { label: '01 PM', activity: 0.15, insightCount: 1, insightOffsets: [0.42], quarters: [0.1, 0.15, 0.22, 0.12] },
    { label: '02 PM', activity: 0.3, insightCount: 2, insightOffsets: [0.26, 0.68], quarters: [0.2, 0.34, 0.3, 0.26] },
    { label: '03 PM', activity: 0.22, insightCount: 0, quarters: [0.24, 0.2, 0.16, 0.28] },
    { label: '04 PM', activity: 0.41, insightCount: 3, insightOffsets: [0.2, 0.52, 0.8], quarters: [0.3, 0.44, 0.52, 0.38] },
    { label: '05 PM', activity: 0.35, insightCount: 1, insightOffsets: [0.6], quarters: [0.4, 0.3, 0.35, 0.32] },
    { label: '06 PM', activity: 1, current: true, insightCount: 2, insightOffsets: [0.34, 0.74], quarters: [0.7, 1, 0.85, 0.62] },
    { label: '07 PM', activity: 0.48, insightCount: 1, insightOffsets: [0.46], quarters: [0.55, 0.48, 0.4, 0.34] },
    { label: '08 PM', activity: 0.12, insightCount: 0, quarters: [0.18, 0.12, 0.1, 0.08] },
    { label: '09 PM', activity: 0.2, insightCount: 0, quarters: [0.1, 0.16, 0.24, 0.2] },
    { label: '10 PM', activity: 0.32, insightCount: 1, insightOffsets: [0.55], quarters: [0.22, 0.3, 0.36, 0.28] },
    { label: '11 PM', activity: 0.16, insightCount: 0, quarters: [0.2, 0.16, 0.12, 0.1] },
    { label: '12 AM', activity: 0.06, insightCount: 0, quarters: [0.1, 0.06, 0.04, 0.04] },
  ],

  // Default period: 04 PM–09 PM — centered on the 12-hour rail (indices 3–8
  // around its 5.5 midpoint) so the selection window loads mid-timeline rather
  // than pinned to the first hour. Indices into the timeline above; every
  // insight's timeRange (1–7) still overlaps this window, so the default
  // canvas stays populated.
  defaultPeriod: { start: 3, end: 8 },

  nodes: ALL_NODES,

  // Assembled once, then swept: no path into this array may introduce an
  // Insight ↔ Insight relationship (graphLinkRules.ts).
  links: withoutDisallowedLinks(
    [...NAMED_LINKS, ...rings.flatMap(r => r.links), ...CROSS_GROUP_CLUSTER_LINKS],
    id => NODE_KIND_BY_ID.get(id),
  ),

  legend: [
    { id: 'insight', label: 'Insight', shape: 'dot', ink: 'insight' },
    { id: 'cluster', label: 'Entities cluster', shape: 'dashed-ring', ink: 'structure' },
    { id: 'entity', label: 'Entity', shape: 'dot', ink: 'entity' },
    { id: 'source', label: 'Source', shape: 'ring', ink: 'structure' },
    { id: 'influence', label: 'Influence', shape: 'line', ink: 'structure' },
    { id: 'overlap', label: 'Overlap', shape: 'dotted-line', ink: 'structure' },
  ],

  insightPrompt: {
    kind: 'Insight potential',
    body: 'High probability “Deal activity” if you add document context.',
    emphasis: 'Deal activity',
    confidence: 0.78,
    derivedFrom: '3 stalled threads and 2 unsigned documents',
    action: 'View',
  },

  sources: {
    connected: 8,
    total: 13,
    tools: [
      // The three the avatar stack shows. Names must match the logo actually drawn
      // — the name is the avatar's accessible label, so a mismatch tells a screen
      // reader the wrong tool is connected.
      { name: 'Dropbox', image: DropboxLogo },
      { name: 'Zoom', image: ZoomLogo },
      { name: 'Udemy', image: UdemyLogo },
      { name: 'LinkedIn', image: LinkedInLogo },
      { name: 'WhatsApp', image: WhatsAppLogo },
      { name: 'Spotify', image: SpotifyLogo },
      { name: 'Notion' },
      { name: 'Calendar' },
    ],
    body: 'Connect additional sources to get more value out of your personal knowledge.',
    action: 'Connect sources',
  },

  memory: {
    ranges: ['Last week', 'Last month', 'Last quarter'],
    selectedRange: 'Last week',
    stats: [
      { id: 'goals', label: 'Goals', value: 42, delta: 4 },
      { id: 'entities', label: 'Entities', value: 106, delta: 18 },
      { id: 'insights', label: 'Insights', value: 2, delta: -1 },
    ],
    series: [
      { day: 'Mon', added: 2, insights: 1 },
      { day: 'Tue', added: 4, insights: 1 },
      { day: 'Wed', added: 6, insights: 3 },
      { day: 'Thu', added: 11, insights: 2 },
      { day: 'Fri', added: 10, insights: 4 },
      { day: 'Sat', added: 6, insights: 2 },
      { day: 'Sun', added: 4, insights: 1 },
    ],
    measures: { added: 'Entities added', insights: 'Insights surfaced' },
  },

  meters: [
    {
      id: 'unlinked',
      icon: 'unlink',
      label: 'Unlinked signals',
      display: '62%',
      ratio: 0.62,
      hint: 'Ingested items Osaka has not yet connected to an entity.',
    },
    {
      id: 'agents',
      icon: 'agent',
      label: 'Connected agents',
      display: '182',
      // TODO: placeholder proportion. 182 is a count with no denominator, so this
      // fraction is chosen for the visual only and measures nothing. Replace it once
      // there is something real to divide by — an agent seat limit, or the share of
      // connected agents that are currently active.
      ratio: 0.5,
      hint: 'Agents with read access to this graph.',
    },
  ],

  // TODO: Sentiment value is currently a static placeholder (75%).
  // Eventually this should be computed from real graph data:
  // e.g., weighted average of insight confidence scores, entity sentiment tags,
  // or activity velocity. For now, 75% is a fixed demonstration value pending
  // the separate business-logic task to define sentiment calculation.
  sentiment: {
    ratio: 0.75,
    label: 'Sentiment Rate',
    hint: 'Overall sentiment derived from graph insights and entity activity.',
  },

  composer: {
    // All synthetic — invented companies and topics, per the domain rules.
    conversations: [
      { id: 'conv-new', title: 'New chat' },
      { id: 'conv-legalfab', title: 'Legalfab valuation prep' },
      { id: 'conv-hiring', title: 'Q3 hiring plan' },
      { id: 'conv-renewal', title: 'Meridian renewal timeline' },
      { id: 'conv-digest', title: 'Weekly digest tuning' },
    ],
    activeConversationId: 'conv-new',
    draft: '',
    placeholder: 'Ask anything',
    // All synthetic, per the domain rules. Highlight and chevron are
    // hover/focus states owned by SuggestionsPanel, not data flags.
    suggestions: [
      { id: 'sg-progress', icon: 'chartTrend', text: 'Summarize progress since the last investor update' },
      { id: 'sg-followup', icon: 'email', text: 'Draft a follow-up to the Legalfab investors' },
      { id: 'sg-risks', icon: 'flag', text: 'What risks came up this week?' },
      { id: 'sg-meeting', icon: 'calendarTime', text: 'Prep notes for my next meeting' },
      { id: 'sg-goal', icon: 'goal', text: 'How close is the Q3 hiring goal?' },
      { id: 'sg-topics', icon: 'graph', text: 'Show topics gaining momentum' },
      { id: 'sg-quiet', icon: 'user', text: 'Who went quiet in the last two weeks?' },
      { id: 'sg-digest', icon: 'history', text: 'Replay yesterday’s digest' },
    ],
  },

  railSummary: {
    title: 'Graph summary',
    // A digest of THIS demo graph — the Legalfab / Northwind storyline the
    // insights and evidence blocks tell — not generic product copy. Synthetic,
    // like everything in this dataset. The block grows with its content: the
    // rail's summary section has no fixed height.
    // Every marked name resolves to a REAL node id in this dataset —
    // 'doc-legalfab' / 'doc-northwind' are the document hubs, 'Gmail' /
    // 'Google Drive' the sources. Plain words stay plain strings: only actual
    // graph items become references.
    body: [
      'The current graph shows two dominant areas of activity: ',
      { text: 'Legalfab', refId: 'doc-legalfab' },
      ' and ',
      { text: 'Northwind', refId: 'doc-northwind' },
      '. ',
      { text: 'Legalfab', refId: 'doc-legalfab' },
      ' has the highest concentration of connected agreement entities, with '
      + 'supporting evidence distributed across ',
      { text: 'Gmail', refId: 'Gmail' },
      ', ',
      { text: 'Drive', refId: 'Google Drive' },
      ', and related workflow activity. These connections point to growing '
      + 'deal momentum and a clearer path toward the next decision stage. ',
      { text: 'Northwind', refId: 'doc-northwind' },
      ' is more dispersed, with renewal signals appearing across several '
      + 'sources and a weaker concentration of supporting evidence. The '
      + 'broader network remains active, but these two clusters account for '
      + 'the most meaningful recent movement, with ',
      { text: 'Legalfab', refId: 'doc-legalfab' },
      ' trending positively and ',
      { text: 'Northwind', refId: 'doc-northwind' },
      ' presenting the strongest emerging risk.',
    ],
    kpis: [
      { id: 'entities', label: 'Entities', icon: 'scisControlTower' },
      { id: 'insights', label: 'Insights', icon: 'cicsExplorer' },
      { id: 'sources', label: 'Sources', icon: 'fileSystem' },
    ],
  },

  demoAnswer: {
    thoughtSeconds: 32,
    // The trail behind the answer (synthetic, like everything here). Sources
    // name the same surfaces the evidence blocks cite, so the trail and the
    // answer agree about where the material came from.
    reasoning: [
      { id: 'rs-processing', title: 'Processing question' },
      // A PLAIN step label: no items, so AssistantAccordion renders it as a
      // status line — no chevron, not clickable. The three sub-questions
      // follow it as their own accordions, which is the whole hierarchy:
      // thought toggle → question accordion → plain text + chips.
      { id: 'rs-decompose', title: 'Decomposed into 3 sub-questions:' },
      {
        id: 'rs-signals',
        title: 'What verified signals demonstrate Legalfab\'s actual progress?',
        items: [
          {
            text: 'Found 6 triples and 18 chunks',
            // Three chips: two singles and one folded multi (7 DISTINCT
            // sources → +4). The first three carry mapped logos; the
            // folded tail includes connected tools without graph-node
            // icons — SourceChip only renders logos for the visible
            // three, so the overflow entries need names, not assets.
            chips: [
              ['Google Drive'],
              ['Gmail'],
              ['Spotify', 'Slack', 'LinkedIn', 'WhatsApp', 'Dropbox', 'Zoom', 'Udemy'],
            ],
          },
          {
            text: 'Checking if retrieved info is sufficient for sub-question',
            document: { name: 'Project_Atlas_Status', ext: 'pptx' },
          },
          { text: 'Existing information is sufficient, proceeding to the next question' },
        ],
      },
      {
        id: 'rs-valuation',
        title: 'Which insight most strongly supports valuation justification in an investor context?',
        items: [
          {
            text: 'Found 2 triples and 8 chunks',
            chips: [['LinkedIn'], ['Slack']],
          },
          {
            text: 'Checking if retrieved info is sufficient for sub-question',
            document: { name: 'Project_Atlas_Status', ext: 'pptx' },
          },
          { text: 'Existing information is sufficient, proceeding to the next question' },
        ],
      },
      {
        id: 'rs-momentum',
        title: 'What evidence best demonstrates execution momentum and market validation?',
        items: [
          {
            text: 'Found 4 triples and 11 chunks',
            chips: [['Gmail'], ['WhatsApp']],
          },
          {
            text: 'Checking if retrieved info is sufficient for sub-question',
            document: { name: 'Legalfab_SHA_v4', ext: 'pdf' },
          },
          { text: 'Existing information is sufficient, all sub-questions answered' },
        ],
      },
      { id: 'rs-retrieval', title: 'Initial retrieval' },
      { id: 'rs-finished', title: 'Finished' },
    ],
    summary: [
      ['Your strongest valuation angle is that the $50M pre-money framework is no longer just theoretical — it is already being operationalized through the SHA structure, finalized DDA logic, and investor-facing deck updates.'],
      ['Combined with early validation from a potential international law firm pilot and 42 beta-user messages in the last 48 hours, you can position the valuation as supported by legal/commercial readiness, external market pull, and clear execution momentum.'],
    ],
    evidence: [
      {
        id: 'ev-market',
        heading: 'Early Market Validation',
        body: [
          'The ',
          { text: 'Gmail thread', refId: 'Gmail' },
          ' with the international law firm includes a potential pilot signal, while ',
          { text: 'WhatsApp', refId: 'WhatsApp' },
          ' shows 42 messages from potential beta users in the last 48 hours. Together, these sources show early demand from both an institutional legal-sector player and direct beta-user interest.',
        ],
        sources: ['Gmail', 'WhatsApp'],
      },
      {
        id: 'ev-readiness',
        heading: 'Legal and Commercial Readiness',
        body: [
          'The ',
          { text: 'SHA structure', refId: 'doc-legalfab' },
          ' and the finalized ',
          { text: 'DDA logic' },
          ' are both reflected in the latest deck revision, so the framework a prospective investor reads is the same one the documents already encode. That closes the usual gap between a stated valuation and the paperwork behind it.',
        ],
        sources: ['Google Drive', 'Legalfab_SHA_v4.pdf'],
      },
    ],
    // The analysis run AFTER the demand figure. References resolve to the
    // graph nodes that exist (`doc-legalfab`, `doc-genesis`, the source
    // hubs); entity-level names without a node yet stay linkable-but-inert.
    sections: [
      {
        id: 'sec-structure',
        heading: 'Valuation Structure + Product Logic',
        body: [
          { text: 'Legalfab_SHA_Draft_v2', refId: 'doc-legalfab' },
          ' ties the ',
          { text: 'Deferred Shares conversion' },
          ' triggers to a $50M pre-money valuation. The ',
          { text: 'Project_Genesis_Deck', refId: 'doc-genesis' },
          ' includes the finalized ',
          { text: 'DDA logic' },
          ', connecting the legal valuation structure with the investor-facing product narrative.',
        ],
      },
      {
        id: 'sec-progress',
        heading: 'Recent Execution Progress',
        body: [
          'The ',
          { text: 'Project_Genesis_Deck', refId: 'doc-genesis' },
          ' was actively updated when the ',
          { text: 'DDA logic' },
          ' was finalized. The related ',
          { text: 'Spotify \u201CDeep Focus\u201D session', refId: 'Spotify' },
          ' shows a 4-hour focused work block connected to that deck activity.',
        ],
      },
      {
        id: 'sec-stack',
        heading: 'Valuation Support Stack',
        body: [
          'The valuation is supported by multiple connected signals: the ',
          { text: 'SHA', refId: 'doc-legalfab' },
          ' provides the legal anchor, the ',
          { text: 'Project_Genesis_Deck', refId: 'doc-genesis' },
          ' provides product and narrative support, ',
          { text: 'Gmail', refId: 'Gmail' },
          ' provides early institutional validation, and ',
          { text: 'WhatsApp', refId: 'WhatsApp' },
          ' provides beta-user demand.',
        ],
      },
    ],
    insight: {
      card: [
        'A $50M valuation framework is actively being operationalized, with early external validation signals and increasing market pull.',
      ],
      conclusion: [
        'The $50M valuation is no longer only a proposed number. It is reflected in the ',
        { text: 'SHA structure', refId: 'doc-legalfab' },
        ', reinforced by finalized product logic in the investor deck, and supported by early market signals from a potential law firm pilot and active beta-user demand.',
      ],
    },
    barChart: {
      title: 'Evidence Distribution',
      ariaTitle: 'Evidence weight by signal, in percent',
      points: [
        { label: 'Legal Structure', value: 16 },
        { label: 'Gmail Pilot Signal', value: 19 },
        { label: 'WhatsApp Demand', value: 28 },
        { label: 'Investor Readiness', value: 36 },
        { label: 'Product Logic', value: 39 },
      ],
    },
    chart: {
      title: 'Demand activity over time',
      ariaTitle: 'Demand activity over the last six months',
      xLabel: 'Month',
      points: [
        { month: 'Feb', value: 44 },
        { month: 'Mar', value: 50 },
        { month: 'Apr', value: 68 },
        { month: 'May', value: 83 },
        { month: 'Jun', value: 96 },
        { month: 'Jul', value: 99 },
      ],
    },
  },
}
