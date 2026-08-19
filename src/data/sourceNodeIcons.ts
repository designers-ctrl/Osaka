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
import DocumentLogoRaw from '@/assets/nodeSourceIcons/Document Logo.svg?raw'
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

/**
 * ── DOCUMENT-NODE INK: DS SEMANTIC TOKENS, RESOLVED LIVE ────────────────
 * The asset's own extension palette (documentIcon.ts) is tuned for the WHITE
 * chip tile; on the node's `surface-light` ground those inks are too dark to
 * read. Node tiles therefore use the theme's bright SEMANTIC colors instead
 * — error for pdf, success for spreadsheets, info for docs, warning for
 * decks, gray1 for plain text — resolved from the live theme like the
 * surface (literals below are pre-mount fallback mirrors of the dark theme).
 * The white assistant-chip tile keeps the original palette untouched.
 */
const DOCUMENT_NODE_INKS: Record<string, { token: string, fallback: string }> = {
  pdf: { token: '--v-theme-error', fallback: '#FB4C75' },
  xlsx: { token: '--v-theme-success', fallback: '#34EDAA' },
  csv: { token: '--v-theme-success', fallback: '#34EDAA' },
  docx: { token: '--v-theme-info', fallback: '#57B6F8' },
  pptx: { token: '--v-theme-warning', fallback: '#F2C585' },
  txt: { token: '--v-theme-gray1', fallback: '#949B99' },
  md: { token: '--v-theme-gray1', fallback: '#949B99' },
}

/** Unknown/absent extension → the generic bright document ink (info). */
const DOCUMENT_NODE_DEFAULT_INK = { token: '--v-theme-info', fallback: '#57B6F8' }

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

/** `".PDF"`, `"report.final.pdf"` → `"pdf"`. */
function normalizeExtension(value: string): string {
  const bare = value.trim().toLowerCase()
  const lastDot = bare.lastIndexOf('.')
  return lastDot >= 0 ? bare.slice(lastDot + 1) : bare
}

/** The bright node ink for an extension, from the live theme. */
function documentNodeInk(extension?: string | null): string {
  const entry = (extension && DOCUMENT_NODE_INKS[normalizeExtension(extension)])
    || DOCUMENT_NODE_DEFAULT_INK
  return themeColor(entry.token, entry.fallback)
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
 * Graph DOCUMENT-node tile, shared by Structured AND Unstructured: the
 * `Document Logo.svg` asset with
 * - its white background rect re-toned to the shared theme surface, and
 * - its file glyph recoloured per extension in the theme's BRIGHT semantic
 *   inks (DOCUMENT_NODE_INKS above) so the mark reads clearly on the dark
 *   node surface.
 * Only the inner file-type mark changes colour; the surface stays the token.
 */
export function documentNodeIconFor(extension?: string | null): string {
  const color = documentNodeInk(extension)
  const surface = nodeSurfaceColor()
  const key = `${surface}|doc|${color}`
  const cached = tileCache.get(key)
  if (cached) return cached
  const svg = DocumentLogoRaw
    .replace(/fill="white"/gi, `fill="${surface}"`)
    .replace(/#155EEF/gi, color)
  const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`
  tileCache.set(key, uri)
  return uri
}
