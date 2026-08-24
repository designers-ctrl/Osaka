/**
 * src/data/graphLinkRules.ts
 *
 * Relationship rules the graph must uphold whatever the dataset says.
 *
 * These live in the DATA layer because they are statements about the graph's
 * semantics, not about how it is drawn — both graph modes import them, and the
 * dataset itself applies them while assembling its links.
 */

/**
 * ⛔ INSIGHTS NEVER CONNECT TO INSIGHTS.
 *
 * An Insight is model OUTPUT derived from ingested material (see the domain
 * rules in CLAUDE.md). A line between two Insights would assert a relationship
 * the system never inferred — it reads as evidence while being nothing of the
 * sort — so the pair is rejected outright rather than styled differently.
 *
 * Every other pairing an Insight takes part in stays valid:
 *   Insight ↔ Cluster · Insight ↔ Entity · Insight ↔ Source/Document
 *
 * Enforced in three places on purpose: the dataset drops such pairs while
 * building its link list, and BOTH renderers filter again before drawing, so a
 * synthetic fixture, a future data edit or a generated link can never put one
 * on screen by accident.
 */
export function isInsightToInsight(
  sourceKind: string | undefined,
  targetKind: string | undefined,
): boolean {
  return sourceKind === 'insight' && targetKind === 'insight'
}

/** The end's node id, whether the link still holds ids or resolved objects. */
export function linkEndNodeId(end: unknown): string | undefined {
  if (typeof end === 'string') return end
  if (end && typeof end === 'object') return (end as { id?: string }).id
  return undefined
}

/**
 * Drop every disallowed relationship from a link list. `kindOf` resolves a
 * node id to its kind; ids it does not know are left alone (a link whose ends
 * cannot be classified is not this rule's business).
 */
export function withoutDisallowedLinks<T>(
  links: readonly T[],
  kindOf: (id: string) => string | undefined,
): T[] {
  return links.filter((link) => {
    const s = linkEndNodeId((link as { source?: unknown }).source)
    const t = linkEndNodeId((link as { target?: unknown }).target)
    if (!s || !t) return true
    return !isInsightToInsight(kindOf(s), kindOf(t))
  })
}
