/**
 * src/components/graphs/structured/structuredConnections.ts
 *
 * The FULL resolved connection set for the current Structured render.
 *
 * ⚠️ WHY THIS EXISTS. The radial mesh only DRAWS the connections that mean
 * something on screen (see `isMeaningfulConnection`) — a line to a Source or
 * Document hub has no visible far end, and a cluster's link to its own entity
 * is the cluster restating itself. Filtering those out is what makes the mesh
 * readable, but two features still need the unfiltered set:
 *
 *   • the cluster FOCUS reads a cluster's SELF-links to find which entities
 *     belong to it (structuredFocus.deriveStructuredFocus);
 *   • its relatedness test reads the HUB links to tell which clusters share an
 *     origin.
 *
 * Both used to scrape the drawn `.link-foreground` paths, so filtering the mesh
 * would silently have emptied the focus fans. The renderer now publishes the
 * full set here and draws the subset, so the two concerns stop fighting over
 * one DOM selection.
 *
 * Module-scoped, like the hover module's suspend flag: one Structured graph is
 * mounted at a time, and the renderer replaces this wholesale on every render.
 */

import type { RadialConnection } from './useStructuredGeometry'
import { isInsightToInsight } from '@/data/graphLinkRules'

let resolved: RadialConnection[] = []

/** Called by the renderer with every resolved connection, drawn or not. */
export function setResolvedConnections(connections: RadialConnection[]): void {
  /*
   * The Structured render-time safeguard for the Insight ↔ Insight rule: this
   * is the ONE seam every structured feature reads its relationships from
   * (mesh, hover neighbourhoods, the focus detail, the badge counts), so
   * dropping the pair here removes it from the lines AND from everything
   * derived from them. See src/data/graphLinkRules.ts.
   */
  resolved = connections.filter(
    conn => !isInsightToInsight(conn.sourceNode?.kind, conn.targetNode?.kind),
  )
}

/**
 * Every resolved connection for the current render — including the ones the
 * mesh deliberately does not draw. Read this, never the DOM, when you need the
 * relationships rather than the lines.
 */
export function getResolvedConnections(): RadialConnection[] {
  return resolved
}
