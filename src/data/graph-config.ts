/**
 * src/data/graph-config.ts
 *
 * GRAPH CONFIGURATION - SINGLE SOURCE OF TRUTH for all graph structure and data.
 *
 * ============================================================================
 * IMPORTANT: This file defines the COMPLETE graph topology and data.
 * Edit here to change sources, insights, documents, and all connections.
 * ============================================================================
 *
 * PURPOSE:
 * - Centralized configuration for graph structure
 * - Separated from rendering/display code
 * - Easily editable without touching code logic
 *
 * STRUCTURE:
 * 1. GRAPH_SOURCES - Data ingestion points (tools/channels)
 * 2. GRAPH_SOURCE_ICONS - Icon assignments for sources
 * 3. GRAPH_DOCUMENTS - Document nodes (ingested artifacts)
 * 4. GRAPH_DOCUMENT_HUBS - Documents with clusters around them
 * 5. GRAPH_INSIGHTS - Model output nodes (have confidence/provenance)
 * 6. GRAPH_CONNECTIONS - All relationships between nodes
 * 7. GRAPH_CLUSTER_CONFIG - Cluster generation parameters
 *
 * HOW IT'S USED:
 * - graphWorkspace.ts imports all config from this file
 * - Converts config objects to NetworkNode/NetworkLink types
 * - Clusters are auto-generated around sources using GRAPH_CLUSTER_CONFIG
 * - Entities are auto-generated within clusters
 *
 * EDITING GUIDE:
 *
 * ADD A SOURCE:
 * - Add new object to GRAPH_SOURCES array
 * - Add icon to GRAPH_SOURCE_ICONS
 * - Clusters will be auto-generated (based on satellites count)
 *
 * ADD A DOCUMENT:
 * - Add new object to GRAPH_DOCUMENTS array
 * - Optionally add to GRAPH_DOCUMENT_HUBS for clusters around it
 *
 * ADD AN INSIGHT:
 * - Add new object to GRAPH_INSIGHTS array
 * - Include: x, y (position), size (1-14), confidence (0-1)
 *
 * ADD A CONNECTION:
 * - Add new object to GRAPH_CONNECTIONS array
 * - Format: { source: 'id', target: 'id' }
 * - Connections auto-generated (source→cluster) are NOT listed here
 * - Only manual connections (cluster→insight, insight→insight, etc)
 *
 * CHANGE CLUSTER TOPOLOGY:
 * - Edit GRAPH_CLUSTER_CONFIG.clusterDivisor (how many clusters per source)
 * - Edit GRAPH_CLUSTER_CONFIG.entitySizes (available sizes for entities)
 * - Edit GRAPH_CLUSTER_CONFIG.weightMin/Max (cluster sizing variation)
 *
 * ALL VALUES ARE DELIBERATELY SYNTHETIC FOR DEMO PURPOSES.
 */

// The `* Logo.svg` variants are FULL-BLEED tiles: each carries its own
// edge-to-edge brand background, so a Source circle can render one at its full
// diameter with no inner padding and no extra backdrop of ours (the circle is
// clipped round — see the source-icon clip in NetworkGraphD3.vue). The older
// glyph-only files (Slack.svg, Gmail.svg, …) stay in the folder: the Document
// icon and the Structured cluster ring still use that set.
import SlackIcon from '@/assets/nodeSourceIcons/Slack Logo.svg'
import LinkedInIcon from '@/assets/nodeSourceIcons/Linkedin Logo.svg'
import GmailIcon from '@/assets/nodeSourceIcons/Gmail Logo.svg'
import GoogleDriveIcon from '@/assets/nodeSourceIcons/Google drive Logo.svg'
import WhatsAppIcon from '@/assets/nodeSourceIcons/Whatsapp Logo.svg'
import SpotifyIcon from '@/assets/nodeSourceIcons/Spotify Logo.svg'
import DocumentIcon from '@/assets/nodeSourceIcons/Document.svg'

/**
 * ============================================================================
 * GRAPH_SOURCES - Primary data sources (tools/channels)
 * ============================================================================
 *
 * EDIT THIS TO:
 * - Add new sources (tools)
 * - Remove sources
 * - Change positions (x, y)
 * - Change cluster count (satellites = entities to distribute)
 * - Change cluster orbital distance (radius)
 *
 * PROPERTIES:
 * - id: Unique identifier (must match GRAPH_SOURCE_ICONS key)
 * - x, y: Canvas coordinates (0-800 x 0-600)
 * - satellites: Total entity count (clusters auto-created based on clusterDivisor)
 * - radius: Orbital radius for cluster positioning
 *
 * EXAMPLE: Add Notion source
 * { id: 'Notion', x: 400, y: 150, satellites: 8, radius: 50 }
 * Then add to GRAPH_SOURCE_ICONS: 'Notion': NotionIcon
 */
export const GRAPH_SOURCES = [
  { id: 'Slack', x: 350, y: 70, satellites: 13, radius: 55 },
  { id: 'LinkedIn', x: 220, y: 220, satellites: 11, radius: 50 },
  { id: 'Gmail', x: 360, y: 280, satellites: 12, radius: 55 },
  { id: 'Google Drive', x: 520, y: 320, satellites: 14, radius: 60 },
  { id: 'WhatsApp', x: 340, y: 480, satellites: 13, radius: 55 },
  { id: 'Spotify', x: 520, y: 490, satellites: 9, radius: 45 },
] as const

/**
 * ============================================================================
 * GRAPH_SOURCE_ICONS - Icon assignment for sources
 * ============================================================================
 *
 * EDIT THIS TO:
 * - Add icons for new sources (must match GRAPH_SOURCES id)
 * - Change icons
 *
 * RULE: Every source ID in GRAPH_SOURCES must have an entry here.
 * If missing, source will render without an icon.
 */
export const GRAPH_SOURCE_ICONS: Record<string, string> = {
  'Slack': SlackIcon,
  'LinkedIn': LinkedInIcon,
  'Gmail': GmailIcon,
  'Google Drive': GoogleDriveIcon,
  'WhatsApp': WhatsAppIcon,
  'Spotify': SpotifyIcon,
}

/**
 * ============================================================================
 * GRAPH_DOCUMENTS - Document nodes (ingested artifacts/facts)
 * ============================================================================
 *
 * EDIT THIS TO:
 * - Add new documents
 * - Remove documents
 * - Change labels
 * - Reposition documents
 *
 * PROPERTIES:
 * - id: Unique identifier
 * - label: Display name (keep < 30 chars, truncate long titles with "…")
 * - x, y: Canvas coordinates (0-800 x 0-600)
 * - size: Node size (fixed at 10 for all documents)
 *
 * NOTE: Documents with clusters should ALSO be in GRAPH_DOCUMENT_HUBS.
 */
/*
 * `ext` is the document's FILE TYPE (synthetic, like every other value here).
 * It drives only the colour of the glyph inside the shared document icon —
 * see src/data/documentIcon.ts for the extension → colour map. It is NOT part
 * of the label, so the rendered node text is unaffected.
 */
export const GRAPH_DOCUMENTS = [
  { id: 'doc-atlas', label: 'Project_Atlas_St…', ext: 'docx', x: 180, y: 90, size: 10 },
  { id: 'doc-genesis', label: 'Project_Genesis…', ext: 'docx', x: 550, y: 90, size: 10 },
  { id: 'doc-operating-model', label: 'Operating_Mod…', ext: 'xlsx', x: 700, y: 120, size: 10 },
  { id: 'doc-annual', label: 'Annual_Busines…', ext: 'xlsx', x: 80, y: 200, size: 10 },
  { id: 'doc-legalfab', label: 'Legalfab_SHA_…', ext: 'pdf', x: 610, y: 200, size: 10 },
  { id: 'doc-partnership', label: 'Partnership_Opp…', ext: 'pdf', x: 690, y: 330, size: 10 },
  { id: 'doc-pilot', label: 'Pilot_Onboardin…', ext: 'docx', x: 210, y: 390, size: 10 },
  { id: 'doc-ip', label: 'IP_Transfer_Add…', ext: 'pdf', x: 630, y: 430, size: 10 },
  { id: 'doc-operating-agr', label: 'Operating_Agre…', ext: 'pdf', x: 160, y: 510, size: 10 },
  { id: 'doc-northwind', label: 'Northwind_MSA…', ext: 'pdf', x: 670, y: 530, size: 10 },
  { id: 'doc-annual-report', label: 'Annual_Business_Financial_R…', ext: 'xlsx', x: 50, y: 50, size: 10 },
  { id: 'doc-atlas-status', label: 'Project_Atlas_Status', ext: 'pptx', x: 120, y: 40, size: 10 },
] as const

/**
 * DOCUMENT HUBS - Documents that have clusters around them
 * Maps to documents above, defines cluster topology
 * Each document gets its own cluster entities just like sources
 *
 * ── CLUSTERS PER FILE ──────────────────────────────────────────────────────
 * A file hub's cluster count is derived, not listed:
 *
 *   numClusters = ceil(satellites / GRAPH_CLUSTER_CONFIG.clusterDivisor)   // divisor 2
 *
 * so `satellites` is the knob, and the trailing comment on each row states
 * the count it produces. Every file now anchors 3–6 clusters (it used to be
 * 2 across the board), which is what makes a document read as a knowledge hub
 * rather than a leaf: the documents the demo narrative leans on — the Genesis
 * deck, the Legalfab SHA, the Atlas pair, the Northwind MSA — carry the most,
 * and the rest are spread over 3–4 so the density is distributed across the
 * canvas instead of piling onto one file.
 *
 * This is the SHARED graph data, so Unstructured and Structured get the same
 * relationships. Each cluster is generated by `ring()` in graphWorkspace.ts as
 * `<hubId>-s<i>` with its own `{ source: hub, target: cluster, kind:
 * 'overlap' }` link — ids are unique by construction, every drawn Source →
 * Cluster line is a real generated relationship, and nothing here is random:
 * positions, weights, categories and confidences are all id-seeded.
 *
 * Entity counts per cluster are NOT starved by the higher cluster count:
 * graphWorkspace takes the LARGER of the satellite allocation and the shared
 * population target (entityFill.ts), so every new cluster is populated.
 */
export const GRAPH_DOCUMENT_HUBS = [
  { id: 'doc-atlas', x: 180, y: 90, satellites: 9, radius: 40 }, // 5 clusters
  { id: 'doc-genesis', x: 550, y: 90, satellites: 11, radius: 40 }, // 6 clusters
  { id: 'doc-operating-model', x: 700, y: 120, satellites: 7, radius: 40 }, // 4 clusters
  { id: 'doc-annual', x: 80, y: 200, satellites: 8, radius: 40 }, // 4 clusters
  { id: 'doc-legalfab', x: 610, y: 200, satellites: 12, radius: 40 }, // 6 clusters
  { id: 'doc-partnership', x: 690, y: 330, satellites: 7, radius: 40 }, // 4 clusters
  { id: 'doc-pilot', x: 210, y: 390, satellites: 6, radius: 40 }, // 3 clusters
  { id: 'doc-ip', x: 630, y: 430, satellites: 5, radius: 40 }, // 3 clusters
  { id: 'doc-operating-agr', x: 160, y: 510, satellites: 6, radius: 40 }, // 3 clusters
  { id: 'doc-northwind', x: 670, y: 530, satellites: 10, radius: 40 }, // 5 clusters
  { id: 'doc-annual-report', x: 50, y: 50, satellites: 8, radius: 40 }, // 4 clusters
  { id: 'doc-atlas-status', x: 120, y: 40, satellites: 9, radius: 40 }, // 5 clusters
] as const

/**
 * ============================================================================
 * GRAPH_INSIGHTS - Insights (model output nodes with confidence)
 * ============================================================================
 *
 * EDIT THIS TO:
 * - Add new insights
 * - Remove insights
 * - Change confidence scores
 * - Update provenance (derivedFrom)
 * - Change time ranges
 *
 * PROPERTIES:
 * - id: Unique identifier
 * - x, y: Canvas coordinates (0-800 x 0-600)
 * - size: Strength indicator (1-14, affects visual radius)
 * - confidence: Confidence score (0.0-1.0, e.g., 0.85 = 85% confident)
 * - derivedFrom: Provenance - what data/signals generated this insight
 * - timeRange: { start, end } hour range (1-7, where 6 is current hour)
 *
 * SIZE/CONFIDENCE MAPPING:
 * size: 1-5 = low confidence, 6-10 = medium, 11-14 = high confidence
 * Larger size = more signals/evidence
 *
 * DOMAIN RULE: Every insight MUST show its confidence and provenance.
 * Never render an insight without visible confidence score.
 */
export const GRAPH_INSIGHTS = [
  { id: 'ins-deal-velocity', x: 460, y: 90, size: 13, confidence: 0.86, derivedFrom: '14 messages · 3 documents', timeRange: { start: 1, end: 4 } },
  { id: 'ins-intro-path', x: 290, y: 150, size: 8, confidence: 0.74, derivedFrom: '6 messages', timeRange: { start: 1, end: 3 } },
  { id: 'ins-cadence', x: 370, y: 190, size: 7, confidence: 0.69, derivedFrom: '9 calendar events', timeRange: { start: 2, end: 5 } },
  { id: 'ins-valuation', x: 150, y: 300, size: 14, confidence: 0.91, derivedFrom: '21 messages · 5 documents', timeRange: { start: 1, end: 6 } },
  { id: 'ins-runway', x: 220, y: 310, size: 12, confidence: 0.82, derivedFrom: '11 documents', timeRange: { start: 2, end: 6 } },
  { id: 'ins-stalled', x: 480, y: 210, size: 6, confidence: 0.64, derivedFrom: '4 threads', timeRange: { start: 3, end: 5 } },
  { id: 'ins-renewal', x: 660, y: 250, size: 5, confidence: 0.58, derivedFrom: '3 documents', timeRange: { start: 4, end: 6 } },
  { id: 'ins-owner-gap', x: 410, y: 360, size: 9, confidence: 0.77, derivedFrom: '8 tasks', timeRange: { start: 3, end: 6 } },
  { id: 'ins-handoff', x: 270, y: 450, size: 8, confidence: 0.71, derivedFrom: '5 meetings', timeRange: { start: 2, end: 7 } },
  { id: 'ins-ip-risk', x: 560, y: 410, size: 10, confidence: 0.88, derivedFrom: '2 documents · 7 messages', timeRange: { start: 4, end: 7 } },
  { id: 'ins-quiet', x: 440, y: 470, size: 6, confidence: 0.61, derivedFrom: '6 threads', timeRange: { start: 5, end: 7 } },
  { id: 'ins-onboarding-alignment', x: 85, y: 120, size: 10, confidence: 0.79, derivedFrom: '4 documents · 2 clusters', timeRange: { start: 1, end: 4 } },
] as const

/**
 * ============================================================================
 * GRAPH_CONNECTIONS - All manual relationships between nodes
 * ============================================================================
 *
 * EDIT THIS TO:
 * - Add new connections (cluster→insight, insight→insight, insight→document)
 * - Remove connections
 * - Rewire relationships
 *
 * PROPERTIES:
 * - source: Source node ID (must exist in GRAPH_SOURCES, GRAPH_INSIGHTS, GRAPH_DOCUMENTS, or cluster ID)
 * - target: Target node ID (must exist in GRAPH_INSIGHTS, GRAPH_DOCUMENTS, or cluster ID)
 *
 * CONNECTION TYPES (what to connect):
 * 1. Cluster → Insight: 'Slack-s0' → 'ins-deal-velocity'
 *    (Show what data signals this insight)
 * 2. Insight → Insight: 'ins-valuation' → 'ins-runway'
 *    (Show insight dependencies/relationships)
 * 3. Insight → Document: 'ins-onboarding-alignment' → 'doc-pilot'
 *    (Show what documents support this insight)
 *
 * DO NOT LIST HERE:
 * - Source → Cluster links (auto-generated from GRAPH_SOURCES.satellites)
 * - Cluster → Entity links (auto-generated during cluster creation)
 *
 * NAMING CONVENTION for generated clusters:
 * - Cluster ID format: '{source-id}-s{index}' (e.g., 'Slack-s0', 'Slack-s1')
 * - Entity ID format: '{cluster-id}-e{index}' (e.g., 'Slack-s0-e0')
 *
 * TIP: To find cluster IDs to connect to insights:
 * Look at GRAPH_SOURCES and count clusters: satellites / clusterDivisor (rounded up)
 */
export const GRAPH_CONNECTIONS = [
  // Insights connect to clusters
  { source: 'Slack-s0', target: 'ins-deal-velocity' },
  { source: 'Slack-s1', target: 'ins-intro-path' },
  { source: 'LinkedIn-s0', target: 'ins-cadence' },
  { source: 'Gmail-s0', target: 'ins-stalled' },
  { source: 'Gmail-s1', target: 'ins-owner-gap' },
  { source: 'Google Drive-s0', target: 'ins-ip-risk' },
  { source: 'WhatsApp-s0', target: 'ins-handoff' },
  { source: 'Spotify-s0', target: 'ins-quiet' },

  // Insights can connect to multiple clusters
  { source: 'LinkedIn-s1', target: 'ins-valuation' },
  { source: 'Gmail-s0', target: 'ins-valuation' },
  { source: 'Gmail-s1', target: 'ins-renewal' },
  { source: 'Google Drive-s0', target: 'ins-renewal' },

  // ⛔ NO Insight-to-insight connections — see `isInsightToInsight` in
  // src/data/graphLinkRules.ts. The three pairs that used to sit here were
  // removed with the rule; the assembly filters any that come back.

  // Document hub connections (documents maintain their own cluster relationships)
  { source: 'doc-annual-report-s0', target: 'ins-onboarding-alignment' },
  { source: 'ins-onboarding-alignment', target: 'doc-pilot-s0' },
  { source: 'ins-onboarding-alignment', target: 'LinkedIn-s0' },
] as const

/**
 * ============================================================================
 * GRAPH_CLUSTER_CONFIG - Cluster generation and topology parameters
 * ============================================================================
 *
 * EDIT THIS TO:
 * - Change how many clusters each source creates (clusterDivisor)
 * - Change available entity sizes (entitySizes)
 * - Change cluster orbital radius for positioning
 * - Adjust weight variation for different-sized clusters
 *
 * HOW CLUSTERS ARE GENERATED:
 * 1. For each source in GRAPH_SOURCES:
 *    - numClusters = ceil(source.satellites / clusterDivisor)
 * 2. Clusters are positioned around source (orbit at source.radius)
 * 3. Entities distributed evenly within each cluster
 * 4. Each cluster gets random weight (30-100) for size variation
 *
 * CLUSTER ID NAMING:
 * Generated cluster IDs: '{sourceId}-s{index}'
 * Example: 'Slack-s0', 'Slack-s1', 'Gmail-s0', etc.
 *
 * PARAMETERS:
 * - clusterDivisor: How to partition satellites into clusters
 *   Example: satellites=12, divisor=3 → 4 clusters
 * - entitySizes: Available sizes for entities (randomly distributed)
 * - entityOrbitRadius: Orbital radius for entities within cluster
 * - weightMin/Max: Range for random cluster weight (0-100 scale)
 *
 * TUNING:
 * - Increase clusterDivisor → fewer, larger clusters
 * - Decrease clusterDivisor → more, smaller clusters
 * - Adjust weightMax to change visual size variation
 */
export const GRAPH_CLUSTER_CONFIG = {
  // How to distribute satellites into clusters
  // Formula: numClusters = ceil(source.satellites / clusterDivisor)
  clusterDivisor: 2,

  // Sizes available for entities
  entitySizes: [5, 7, 9, 6, 11, 8] as const,

  // Orbital radius for positioning entities in clusters
  entityOrbitRadius: 30,

  // Weight range for cluster sizing variation
  weightMin: 30,
  weightMax: 100,
} as const

/**
 * COMBINED CONFIG EXPORT
 * Use this to access all configuration in one place
 */
export const graphConfig = {
  sources: GRAPH_SOURCES,
  sourceIcons: GRAPH_SOURCE_ICONS,
  documents: GRAPH_DOCUMENTS,
  documentHubs: GRAPH_DOCUMENT_HUBS,
  insights: GRAPH_INSIGHTS,
  connections: GRAPH_CONNECTIONS,
  clusterConfig: GRAPH_CLUSTER_CONFIG,
}

export type GraphConfig = typeof graphConfig
