/**
 * src/data/sourceNodeIcons.ts
 *
 * Surface-toned source-node tiles for the graph.
 *
 * The graph's Source (and Document) hubs render as full-bleed <image> tiles
 * clipped round, with the node circle painted ON TOP of the image (that is
 * where the stroke and pointer events live) — so a node's background cannot
 * come from the circle's fill without covering the logo. Instead, the surface
 * is baked INTO the tile, the same data-URI pipeline documentIcon.ts uses:
 * each brand's GLYPH-ONLY asset (transparent background) is wrapped with a
 * backing rect and served as one cached data URI.
 *
 * ── THE SURFACE IS A LIVE THEME TOKEN ────────────────────────────────────
 * The backing color resolves from the mounted Vuetify theme at first render
 * (`--v-theme-surface-bright` on the app root), not from a hardcoded hex.
 * `surface-bright` is the theme's raised-panel tone — the same surface the top
 * bar and lifted panels use — so a hub reads as a raised chip against the
 * canvas rather than as a hole in it, and it stays correct if the theme is ever
 * retuned. The literal below is only the pre-mount fallback mirror.
 *
 * These are the GRAPH-NODE tiles. SourceChip and the assistant surfaces keep
 * reading the original `* Logo.svg` brand tiles through GRAPH_SOURCE_ICONS;
 * document nodes in BOTH graph modes share documentNodeIconFor (below), so
 * Structured and Unstructured can never drift apart.
 */

import SlackGlyph from '@/assets/nodeSourceIcons/Slack.svg?raw'
import LinkedInGlyph from '@/assets/nodeSourceIcons/Linkedin.svg?raw'
import GmailGlyph from '@/assets/nodeSourceIcons/Gmail.svg?raw'
import GoogleDriveGlyph from '@/assets/nodeSourceIcons/Google drive.svg?raw'
import WhatsAppGlyph from '@/assets/nodeSourceIcons/Whatsapp.svg?raw'
import SpotifyGlyph from '@/assets/nodeSourceIcons/Spotify.svg?raw'
import DocumentIconRaw from '@/assets/nodeSourceIcons/Document icon.svg?raw'
import LinkedInLogo from '@/assets/nodeSourceIcons/Linkedin Logo.svg'
import SpotifyLogo from '@/assets/nodeSourceIcons/Spotify Logo.svg'
import WhatsAppLogo from '@/assets/nodeSourceIcons/Whatsapp Logo.svg'

/**
 * ── BRANDS THAT SHIP A FULL-BLEED TILE ───────────────────────────────────
 * These three assets already ARE the finished node face: the logo on its own
 * brand ground, edge to edge. They are handed to the node untouched — no glyph
 * extraction, no surface backing, no recolour — so the node shows the real
 * brand mark rather than a reconstruction of it.
 *
 * Every other source ships a GLYPH ONLY (transparent background), which would
 * float on the canvas, so those keep the composed `surfaceTile` treatment
 * below. Both paths return one data/asset URI through `getSourceNodeIcon`, so
 * the graph modes cannot diverge on which a brand gets.
 */
const SOURCE_BRAND_TILES: Record<string, string> = {
  LinkedIn: LinkedInLogo,
  Spotify: SpotifyLogo,
  WhatsApp: WhatsAppLogo,
}

/** Pre-mount fallback: the dark theme's `surface-bright`, mirrored. */
const SURFACE_FALLBACK = '#0C1311'

/** The theme token the tiles resolve their surface from. */
const SURFACE_TOKEN = '--v-theme-surface-bright'

/**
 * Resolve the node surface from the LIVE theme. Vuetify publishes its theme
 * variables on the application root element; before mount (or outside the
 * app) the mirrored fallback applies.
 */
function nodeSurfaceColor(): string {
  return themeColor(SURFACE_TOKEN, SURFACE_FALLBACK)
}

/** Resolve any `--v-theme-*` triplet from the mounted app, with a mirror fallback. */
function themeColor(token: string, fallback: string): string {
  if (typeof document !== 'undefined') {
    const appRoot = document.querySelector('.v-application') ?? document.documentElement
    const triplet = getComputedStyle(appRoot).getPropertyValue(token).trim()
    if (triplet) return `rgb(${triplet})`
  }
  return fallback
}

/**
 * Wrap a glyph-only SVG with a full-bleed backing rect in the theme surface
 * (inserted first, so it paints underneath every glyph path) and return it
 * as a data URI.
 */
function surfaceTile(rawSvg: string, surface: string): string {
  const svg = rawSvg.replace(/<svg([^>]*)>/, (open, attrs: string) => {
    const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(open)
    const w = vb?.[1] ?? '16'
    const h = vb?.[2] ?? '16'
    return `<svg${attrs}><rect width="${w}" height="${h}" fill="${surface}"/>`
  })
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const SOURCE_GLYPHS: Record<string, string> = {
  'Slack': SlackGlyph,
  'LinkedIn': LinkedInGlyph,
  'Gmail': GmailGlyph,
  'Google Drive': GoogleDriveGlyph,
  'WhatsApp': WhatsAppGlyph,
  'Spotify': SpotifyGlyph,
}

/** Built tiles, keyed by `${surface}|${key}` (theme-safe). */
const tileCache = new Map<string, string>()

/**
 * Graph Source-node tile: theme surface + brand glyph. Same keys as
 * GRAPH_SOURCE_ICONS, same full-bleed/clip/zoom treatment at the call site —
 * only the tile's own background differs. Returns null for unknown ids, like
 * the mapping lookup it replaced.
 */
export function getSourceNodeIcon(sourceId: string): string | null {
  // A brand that ships its own full-bleed tile uses it as-is (see above).
  const brandTile = SOURCE_BRAND_TILES[sourceId]
  if (brandTile) return brandTile

  const glyph = SOURCE_GLYPHS[sourceId]
  if (!glyph) return null
  const surface = nodeSurfaceColor()
  const key = `${surface}|${sourceId}`
  const cached = tileCache.get(key)
  if (cached) return cached
  const uri = surfaceTile(glyph, surface)
  tileCache.set(key, uri)
  return uri
}

/**
 * ── THE DOCUMENT-NODE ARTWORK ────────────────────────────────────────────
 * `Document icon.svg` is the designed document mark: a 100×100 artboard whose
 * glyph is drawn on a TRANSPARENT ground (unlike the brand tiles and the old
 * `Document Logo.svg`, which are full-bleed faces). Two consequences, both
 * handled by `documentTile` below:
 *
 * 1. it needs the same theme-surface backing rect every other composed tile
 *    gets, so the node keeps its background instead of showing the canvas;
 * 2. it must be SCALED TO FIT — the node paints its tile as a square <image>
 *    clipped to a circle, and the asset's glyph reaches 87% of the artboard
 *    height, so at 1:1 the page's corners would fall outside that circle and
 *    be cut. Fitting it to the inscribed circle is what keeps the mark whole.
 *
 * The fit is expressed once here and the tile is emitted at the same 100×100
 * box every other tile uses, so Structured and Unstructured — which size the
 * <image> from their own node diameters — scale it identically.
 */

/** The asset's artboard, and the tight bounding box of its glyph within it. */
const DOCUMENT_ARTBOARD = 100
const DOCUMENT_GLYPH_BOX = { x: 18.13, y: 6, width: 63.74, height: 87 }

/**
 * The glyph's longest side as a fraction of the tile. 0.68 is what keeps the
 * whole mark — including the folded corner — inside the circle the node clips
 * to, with the breathing room the brand tiles have.
 */
const DOCUMENT_GLYPH_FIT = 0.68

/** The asset's inner markup: everything between its own <svg> tags. */
const DOCUMENT_GLYPH_BODY = DocumentIconRaw
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .trim()

/**
 * Compose the document tile: surface rect, then the glyph scaled about its own
 * bounding-box centre and translated onto the tile's centre. Scaling about the
 * box (not the artboard) is what actually CENTRES the mark — the asset's glyph
 * is not symmetric within its artboard — and one uniform `scale()` is what
 * preserves its aspect ratio.
 */
function documentTile(surface: string): string {
  const scale = (DOCUMENT_ARTBOARD * DOCUMENT_GLYPH_FIT) / DOCUMENT_GLYPH_BOX.height
  const cx = DOCUMENT_GLYPH_BOX.x + DOCUMENT_GLYPH_BOX.width / 2
  const cy = DOCUMENT_GLYPH_BOX.y + DOCUMENT_GLYPH_BOX.height / 2
  const tx = DOCUMENT_ARTBOARD / 2 - cx * scale
  const ty = DOCUMENT_ARTBOARD / 2 - cy * scale
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${DOCUMENT_ARTBOARD}" `
    + `height="${DOCUMENT_ARTBOARD}" viewBox="0 0 ${DOCUMENT_ARTBOARD} ${DOCUMENT_ARTBOARD}" fill="none">`
    + `<rect width="${DOCUMENT_ARTBOARD}" height="${DOCUMENT_ARTBOARD}" fill="${surface}"/>`
    + `<g transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${scale.toFixed(5)})">`
    + `${DOCUMENT_GLYPH_BODY}</g></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/**
 * Graph DOCUMENT-node tile, shared by Structured AND Unstructured: the
 * `Document icon.svg` mark, centred at a fixed fit on the shared theme
 * surface. ONE builder for both modes, so they cannot drift apart.
 *
 * ⚠️ `extension` is still accepted so every call site is unchanged, but the
 * new asset ships its OWN blue gradient palette (three gradients plus the
 * page rules), which is the designed mark — so the per-extension ink recolour
 * the previous flat-glyph asset supported no longer applies to graph nodes.
 * The white assistant/chip tile (src/data/documentIcon.ts) keeps its own
 * per-extension palette untouched.
 */
export function documentNodeIconFor(_extension?: string | null): string {
  const surface = nodeSurfaceColor()
  const key = `${surface}|doc-icon`
  const cached = tileCache.get(key)
  if (cached) return cached
  const uri = documentTile(surface)
  tileCache.set(key, uri)
  return uri
}
