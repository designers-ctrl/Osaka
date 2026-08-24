/**
 * src/data/entityFill.ts
 *
 * THE one source of truth for the synthetic ENTITY population: how many
 * entities a cluster holds, and what each one is called.
 *
 * History note: the Unstructured drill-down used to top clusters up with
 * LAYER-LOCAL "demo" entities (ids `…-demo-N`) that existed nowhere else, so
 * an expanded cluster showed 12–42 entities while the Structured focus — fed
 * from the shared dataset — showed the same cluster with 2. Moving the
 * population target and the naming pools HERE, and generating the full
 * population in graphWorkspace.ts, makes both modes read the identical
 * entities: only the layout differs.
 *
 * Rules this file must never break:
 * - ⚠️ EVERYTHING HERE IS CLEARLY SYNTHETIC (domain rule, CLAUDE.md): invented
 *   people, invented topics, invented documents. Never real correspondence.
 * - Deterministic: id-seeded hashes decide counts and names — the same graph
 *   on every reload and on every mode switch. Math.random() is banned here.
 * - ⚠️ ENTITY DISPLAY NAMES MUST BE SEMANTIC, NEVER RAW FILENAMES OR DOCUMENT
 *   FILENAMES. A pool entry names the CONCEPT an entity stands for — "Brand
 *   Assets", "Renewal Terms", "Contract Review" — never the artifact it
 *   arrived as ("Logo_Pack.zip", "Renewal_Quote.pdf"). No file extensions, no
 *   `Underscore_Case` document titles. Two reasons: a filename is ingested
 *   third-party material the graph should not surface as its own vocabulary,
 *   and the entity is the idea, not the attachment. Documents remain
 *   first-class elsewhere — document HUBS and provenance chips still carry
 *   real document names; this rule governs ENTITY labels only.
 */

/** Stable non-negative hash of a string (same recipe the dataset uses). */
export function hashId(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) % 1_000_003
  }
  return hash
}

/**
 * How many entities a cluster carries. Two deterministic tiers (formerly
 * EXPANDED_CLUSTER.demo, now DATASET parameters): a salted second hash decides
 * WHETHER a cluster is dense, the id hash decides HOW MANY — independent
 * rolls, so some clusters stay modest while others are noticeably fuller.
 *
 *   base tier  → targetMin + (id-hash % targetSpread)   (12–20)
 *   dense tier → denseMin  + (id-hash % denseSpread)    (26–42)
 */
export const ENTITY_POPULATION = {
  targetMin: 12,
  targetSpread: 9,
  denseSharePercent: 40,
  denseMin: 26,
  denseSpread: 17,
} as const

/** The deterministic entity count for a cluster id. */
export function entityPopulationTarget(clusterId: string): number {
  const p = ENTITY_POPULATION
  const isDense = (hashId(`${clusterId}#dense`) % 100) < p.denseSharePercent
  return isDense
    ? p.denseMin + (hashId(clusterId) % p.denseSpread)
    : p.targetMin + (hashId(clusterId) % p.targetSpread)
}

/**
 * Name pools per semantic cluster category (the categories the dataset
 * assigns — see SEMANTIC_CATEGORIES in graphWorkspace.ts). All invented.
 * A category not listed falls back to `DEFAULT_POOL`.
 */
const NAME_POOLS: Record<string, readonly string[]> = {
  People: [
    'Sarah Wilson', 'Hannah Morgan', 'Matthew Brown', 'Ethan Brooks',
    'Ashley Thomas', 'Madison Reed', 'Oliver Hayes', 'Priya Natarajan',
    'Lucas Meyer', 'Amara Okafor', 'Noah Lindgren', 'Isabel Fuentes',
    'Jonas Weber', 'Grace Chen', 'Tomás Rivera', 'Elif Demir',
    'Marcus Hale', 'Nadia Petrov', 'Felix Braun', 'Aiko Tanaka',
  ],
  Messages: [
    'Ready to continue…', 'Follow-up on beta invite', 'Confused by setup…',
    'Beta access request', 'First impression after…', 'Verification code needed',
    'Can I invite my team?', 'Pricing question', 'Onboarding feedback',
    'Feature request: exports', 'Renewal reminder', 'Intro from Legalfab',
    'Demo scheduling', 'Support: login loop', 'Thanks for the walkthrough',
    'Next steps recap', 'Waiting on approval', 'Quick sync request',
  ],
  Events: [
    'Annual Product Strategy', 'Customer Experience Review', 'Financial Planning Workshop',
    'Q3 Board Prep', 'Pilot Kickoff', 'Investor Sync', 'Design Critique',
    'Roadmap Review', 'Hiring Panel', 'Renewal Negotiation', 'All-hands Demo',
    'Partner Onboarding', 'Metrics Deep-dive', 'Launch Retro', 'Weekly Digest Review',
  ],
  Projects: [
    'Project Atlas', 'Project Genesis', 'Pilot Onboarding', 'Beta Rollout',
    'Data Migration', 'Mobile Companion', 'Insight Engine v2', 'Partner Portal',
    'Compliance Sweep', 'Billing Revamp', 'Search Upgrade', 'Digest Tuning',
    'Workspace Redesign', 'API Hardening', 'Localization Pass',
  ],
  Agreements: [
    'Legalfab SHA', 'Northwind MSA', 'IP Transfer Addendum', 'Operating Agreement',
    'Pilot Terms', 'NDA — Meridian', 'Partnership MOU', 'Renewal Rider',
    'Data Processing Addendum', 'SOW — Atlas Phase 2', 'Licensing Terms',
    'Vendor Agreement', 'Consulting SOW', 'Term Sheet Draft',
  ],
  Organizations: [
    'Legalfab', 'Northwind', 'Meridian Labs', 'Atlas Partners', 'Bluewater Fund',
    'Helio Systems', 'Cobalt Ventures', 'Fernwood Group', 'Vertex Legal',
    'Halcyon Media', 'Quill & Co', 'Summit Advisory', 'Brightline Capital',
  ],
  Requirements: [
    'SSO support', 'Audit log export', 'EU data residency', 'Role-based access',
    'API rate limits', 'Uptime SLA 99.9%', 'SOC 2 report', 'Custom retention',
    'Sandbox environment', 'Webhook retries', 'Bulk import', 'Encryption at rest',
  ],
  Metrics: [
    'Activation rate', 'Weekly active teams', 'Insight acceptance', 'Time to value',
    'Churn risk score', 'Pipeline velocity', 'NPS — Q3', 'Seats utilized',
    'Graph coverage', 'Automation runs', 'Digest open rate', 'Response latency',
  ],
  Decisions: [
    'Ship beta to waitlist', 'Delay EU launch', 'Adopt usage pricing',
    'Merge duplicate CRM', 'Sunset legacy import', 'Hire founding designer',
    'Pause outbound', 'Switch DB vendor', 'Green-light Atlas 2', 'Renew Northwind',
  ],
  Locations: [
    'Osaka HQ', 'Berlin Hub', 'Lisbon Office', 'Austin Studio', 'Toronto Loft',
    'Singapore Desk', 'London WeWork', 'Remote — EU', 'Remote — Americas',
  ],
  Products: [
    'Graph Workspace', 'Insight Digest', 'Agent Studio', 'Sandbox Mode',
    'Mobile Beta', 'API Platform', 'Automation Kit', 'Connector Pack',
    'Timeline View', 'Entity Resolver',
  ],
  Requests: [
    'Beta access — team of 8', 'Custom onboarding', 'Volume discount',
    'Security review call', 'Migration assistance', 'Extended trial',
    'Invoice billing', 'Training session', 'Roadmap briefing', 'Priority support',
  ],
  Services: [
    'Onboarding Concierge', 'Data Cleanup', 'Custom Integration', 'Migration Service',
    'Dedicated Support', 'Quarterly Review', 'Training Program', 'Graph Audit',
    'Automation Setup', 'Success Planning',
  ],
  Links: [
    'docs.osaka/setup', 'Pricing page', 'Beta signup form', 'Changelog',
    'Status page', 'API reference', 'Security whitepaper', 'Roadmap board',
    'Community forum', 'Help center',
  ],
  // SEMANTIC, never filenames — see the naming rule in this file's header.
  // These name what the attachment IS ("Brand Assets"), not the artifact it
  // happened to arrive as ("Logo_Pack.zip").
  Attachments: [
    'Pitch Materials', 'Financial Model', 'Product Spec', 'Brand Assets',
    'Contract Review', 'Onboarding', 'Usage Metrics',
    'Board Notes', 'Flow Walkthrough', 'Renewal Terms',
  ],
  Workflows: [
    'Lead triage', 'Digest generation', 'Contract review', 'Meeting recap',
    'Renewal watch', 'Beta invite flow', 'Entity merge review', 'Signal routing',
    'Weekly reporting', 'Follow-up nudges',
  ],
}

const DEFAULT_POOL: readonly string[] = [
  'Signal A', 'Signal B', 'Thread review', 'Open item', 'Draft note',
  'Pending update', 'New reference', 'Linked record', 'Recent activity', 'Follow-up',
]

/**
 * The name pool for a cluster category.
 *
 * ⚠️ QUALIFIED CATEGORIES. A source with more clusters than there are
 * categories qualifies the repeats — "People 2", "People 3" (see the uniqueness
 * rule in graphWorkspace.ts). Those still name the same KIND of thing, so the
 * trailing numeral is stripped before the lookup; otherwise every qualified
 * cluster would silently fall back to the generic pool and fill with
 * "Signal A / Thread review" instead of people's names.
 */
function poolFor(category: string | null): readonly string[] {
  if (!category) return DEFAULT_POOL
  return NAME_POOLS[category] ?? NAME_POOLS[category.replace(/ \d+$/, '')] ?? DEFAULT_POOL
}

/**
 * The CANONICAL label of a cluster's i-th entity: an id-seeded stride walk
 * over the cluster's category pool, so names within one cluster are mostly
 * distinct; pools smaller than the population suffix a numeral rather than
 * inventing new names. This is what the DATASET writes onto each entity node,
 * so every renderer shows the same name by reading `node.label`.
 */
export function entityLabelFor(clusterId: string, index: number, category: string | null): string {
  const pool = poolFor(category)
  const seed = hashId(clusterId)
  // Stride co-prime-ish with the pool length spreads picks across the pool.
  const stride = 1 + (seed % (pool.length - 1))
  const pick = (seed + index * stride) % pool.length
  const cycle = Math.floor(index / pool.length)
  return cycle === 0 ? pool[pick] : `${pool[pick]} ${cycle + 1}`
}

/**
 * A stable synthetic DISPLAY name for an entity that carries no label of its
 * own — the per-id fallback (kept for safety; dataset entities now all carry
 * labels from entityLabelFor). Seeded by the entity id, so the name never
 * changes between renders or reloads. Display-only.
 */
export function syntheticNameFor(entityId: string, category: string | null): string {
  const pool = poolFor(category)
  return pool[hashId(entityId) % pool.length]
}
