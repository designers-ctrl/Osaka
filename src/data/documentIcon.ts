/**
 * src/data/documentIcon.ts
 *
 * ONE document icon asset, recoloured per file extension.
 *
 * `nodeSourceIcons/Document Logo.svg` is a full-bleed 32×32 tile: a white
 * background rect plus TWO glyph paths (the page and its folded corner) that
 * both ship filled with the asset's own blue. This module returns that same
 * asset as a data URI with ONLY those glyph paths recoloured, so:
 *
 * - the outer appearance (white tile, edge to edge) stays identical for every
 *   document — the background rect is never touched;
 * - a new extension is one entry in EXTENSION_COLORS, never a new SVG file;
 * - the graph keeps rendering a plain <image>, so the source-node sizing
 *   (full diameter, zero inner padding) and round clip apply unchanged.
 *
 * ⚠️ The substitution is keyed on the asset's shipped glyph colour. If the
 * asset is redrawn with a different glyph fill, update BASE_GLYPH_COLOR to
 * match (there is a dev warning below if it stops matching).
 */

import DocumentLogoRaw from '@/assets/nodeSourceIcons/Document Logo.svg?raw'

/**
 * The glyph fill the asset ships with — the only colour this module replaces.
 * The background `<rect fill="white">` uses a different value, so it is left
 * alone by construction.
 */
const BASE_GLYPH_COLOR = '#155EEF'

/**
 * File extension → glyph colour. Extend this map to support more types; the
 * key is the bare extension, lower-case, without a dot.
 *
 * Colours are the document-type semantics the design review specified
 * (spreadsheet green, PDF red) with the same family applied to the remaining
 * office types. These are asset-level ink values, not theme state colours —
 * a `.pdf` is red because PDFs are red everywhere, not because anything is in
 * an error state, so they deliberately do NOT read the status tokens.
 */
export const DOCUMENT_EXTENSION_COLORS: Record<string, string> = {
  pdf: '#D92D20',
  xlsx: '#079455',
  csv: '#079455',
  docx: '#155EEF',
  pptx: '#E04F16',
  txt: '#667085',
  md: '#667085',
}

/** Unknown/absent extension → the asset's own shipped colour. */
export const DOCUMENT_DEFAULT_COLOR = BASE_GLYPH_COLOR

if (import.meta.env.DEV && !DocumentLogoRaw.includes(BASE_GLYPH_COLOR)) {
  console.warn(
    `[documentIcon] "Document Logo.svg" no longer contains ${BASE_GLYPH_COLOR}: `
    + 'the extension recolouring is a no-op until BASE_GLYPH_COLOR matches the asset.',
  )
}

/** Normalise `".PDF"`, `"pdf"`, `"report.final.pdf"` → `"pdf"`. */
function normalizeExtension(value: string): string {
  const bare = value.trim().toLowerCase()
  const lastDot = bare.lastIndexOf('.')
  return lastDot >= 0 ? bare.slice(lastDot + 1) : bare
}

/** The glyph colour for an extension (or the asset default). */
export function documentGlyphColor(extension?: string | null): string {
  if (!extension) return DOCUMENT_DEFAULT_COLOR
  return DOCUMENT_EXTENSION_COLORS[normalizeExtension(extension)] ?? DOCUMENT_DEFAULT_COLOR
}

/**
 * Built data URIs, keyed by colour. Every document of a given type shares one
 * string, so the recolour + encode happens once per colour per session rather
 * than per node per render.
 */
const cache = new Map<string, string>()

/**
 * The document icon as a data URI, glyph recoloured for `extension`.
 * Returns the asset unchanged (default colour) for unknown extensions.
 */
export function documentIconFor(extension?: string | null): string {
  const color = documentGlyphColor(extension)
  const cached = cache.get(color)
  if (cached) return cached
  // Global, case-insensitive: the asset carries the glyph colour on more than
  // one path (page + folded corner), and both must move together.
  const svg = DocumentLogoRaw.replace(new RegExp(BASE_GLYPH_COLOR, 'gi'), color)
  const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`
  cache.set(color, uri)
  return uri
}
