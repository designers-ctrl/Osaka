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
import DocumentIcon from '@/assets/nodeSourceIcons/Document.svg'
import SlackLogo from '@/assets/nodeSourceIcons/Slack.svg'
import GmailLogo from '@/assets/nodeSourceIcons/Gmail.svg'
import GoogleDriveLogo from '@/assets/nodeSourceIcons/Google drive.svg'
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

/** One bar in the memory-growth chart. */
export interface MemoryPoint {
  /** Day label on the category axis. */
  day: string
  /** New nodes added to the graph that day. */
  added: number
}

/** How the graph is growing, over a selectable window. */
export interface MemoryGrowth {
  /** Options for the window select, e.g. "Last week". */
  ranges: string[]
  selectedRange: string
  stats: MemoryStat[]
  series: MemoryPoint[]
}

/** A small figure tile below the chart. */
export interface WorkspaceMeter {
  id: string
  /** Semantic icon key from src/icons/carbon.ts. */
  icon: string
  label: string
  /** Pre-formatted for display, because the unit differs per tile (% vs count). */
  display: string
  /** 0–1 when the tile is a proportion; omitted when it is a plain count. */
  ratio?: number
  /** One line explaining what the figure counts — shown as the tile's tooltip. */
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
  /** Pre-filled draft, so the screen demonstrates a real question. */
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
  composer: Composer
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
      ...(kind === 'cluster'
        ? { confidence: 0.72 + ((i % 5) * 0.05), derivedFrom: `${hub.id} activity` }
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
): { nodes: NetworkNode[], links: NetworkLink[] } {
  const nodes: NetworkNode[] = []
  const links: NetworkLink[] = []
  for (let i = 0; i < count; i++) {
    const angle = i * GOLDEN_ANGLE
    const r = radius * Math.sqrt((i + 0.4) / count)
    const id = `${clusterHub.id}-e${i}`
    nodes.push({
      id,
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
  sourceIcon: DocumentIcon,
}))

// Map insights from config to NetworkNode format
const INSIGHTS: NetworkNode[] = GRAPH_INSIGHTS.map(insight => ({
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
    .map(conn => ({
      source: conn.source,
      target: conn.target,
      kind: undefined, // Will be inferred from node types
    }))
}

const NAMED_LINKS: NetworkLink[] = getValidConnections()

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

  clusterRing.nodes.forEach((node, idx) => {
    node.timeRange = { start: idx % 3 + 1, end: Math.min(7, idx % 3 + 4) }
    // ID-seeded hash → stable/deterministic weight and category across reloads
    // (Math.random() is banned here — it re-scrambled cluster sizes every load)
    const clusterId = node.id
    let hash = 0
    for (let j = 0; j < clusterId.length; j++) {
      hash = (hash * 31 + clusterId.charCodeAt(j)) % 1000
    }
    // Add weight (0-100) for variable cluster sizing (from config)
    ;(node as any).weight = Math.floor(GRAPH_CLUSTER_CONFIG.weightMin + (hash / 1000) * (GRAPH_CLUSTER_CONFIG.weightMax - GRAPH_CLUSTER_CONFIG.weightMin))

    // TODO: Add deterministic semantic category (mock, pending real AI-derived cluster categorization)
    const categoryIndex = Math.floor((hash / 1000) * SEMANTIC_CATEGORIES.length)
    ;(node as any).category = SEMANTIC_CATEGORIES[categoryIndex]
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

  // Step 2: Create entities within each cluster using the computed counts
  const entitiesInClusters = clusterRing.nodes.map((cluster, clusterIdx) => {
    const entityCountForThisCluster = clusterEntityCounts[clusterIdx]
    const clusterEntityData = clusterEntities(cluster, entityCountForThisCluster, GRAPH_CLUSTER_CONFIG.entityOrbitRadius, GRAPH_CLUSTER_CONFIG.entitySizes)
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

  nodes: [
    ...RELEVANT_SOURCES.map(h => ({ id: h.id, label: h.id, kind: 'source' as const, x: h.x, y: h.y, size: 10, sourceIcon: SOURCE_ICONS[h.id] })),
    ...DOCUMENTS,
    ...INSIGHTS,
    ...rings.flatMap(r => r.nodes),
  ],

  links: [...NAMED_LINKS, ...rings.flatMap(r => r.links)],

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
      { name: 'Slack', image: SlackLogo },
      { name: 'Gmail', image: GmailLogo },
      { name: 'Google Drive', image: GoogleDriveLogo },
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
      { day: 'Mon', added: 2 },
      { day: 'Tue', added: 4 },
      { day: 'Wed', added: 6 },
      { day: 'Thu', added: 11 },
      { day: 'Fri', added: 10 },
      { day: 'Sat', added: 6 },
      { day: 'Sun', added: 4 },
    ],
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
      hint: 'Agents with read access to this graph.',
    },
    // TODO: Sentiment value is currently a static placeholder (75%).
    // Eventually this should be computed from real graph data:
    // e.g., weighted average of insight confidence scores, entity sentiment tags,
    // or activity velocity. For now, 75% is a fixed demonstration value pending
    // the separate business-logic task to define sentiment calculation.
    {
      id: 'sentiment',
      icon: 'sentiment',
      label: 'Sentiment Rate',
      display: '75%',
      ratio: 0.75,
      hint: 'Overall sentiment derived from graph insights and entity activity.',
    },
  ],

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
    draft: 'Core, I have a follow-up meeting with the Legalfab investors in 20 minutes. I’m nervous about the valuation justification. What’s my strongest angle based on our actual progress?',
    placeholder: 'Ask about anything in your graph',
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
}
