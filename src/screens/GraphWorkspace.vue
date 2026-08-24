<!--
  src/screens/GraphWorkspace.vue

  Osaka's home screen: the living knowledge graph, and the assistant that reasons
  over it. This is the app's first screen and its first route ('/').

  ── THE COMPOSITION ──
  The canvas IS the page, not a panel on it. Every piece of graph chrome — the
  brand chip, the toolbar, the date scope, zoom, the time rail, the legend —
  FLOATS over the graph rather than boxing it in, so the graph runs edge to edge
  and reads as the surface you are working on. Only the assistant rail owns real
  estate of its own.

  The rail is composed to be read BOTTOM-UP: the composer is the anchor, and
  everything stacked above it is the context Osaka is about to reason with —
  what it just noticed, what it can see, how fast it is learning. It is
  deliberately not a KPI dashboard; the figures are there because they qualify
  the answer you are about to get.

  The time rail on the left is the second load-bearing idea: the graph is a
  LIVING thing, so "when" is a real axis, not chrome. Scrubbing it re-scopes the
  canvas.

  ── DOMAIN RULES THIS SCREEN IS BOUND BY (see CLAUDE.md) ──
  • Inference is never dressed as fact. Insights and clusters are drawn as filled
    / dashed marks with a confidence and a provenance line; ingested sources and
    documents are hollow outlines with neither. The legend is the key to that
    distinction, which is why it is on the canvas and not buried in a menu.
  • All figures here are synthetic (src/data/graphWorkspace.ts). No real
    correspondence, contacts or CRM records.

  Dataset-driven per the house rule: not a single label, count or coordinate is
  written in this file — it all arrives from `graphWorkspace`, and mutable UI
  state is a ref seeded from it.
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { BarChart, useChartTheme, withAlpha } from '@/components/charts'
import NetworkGraphD3 from '@/components/graphs/NetworkGraphD3.vue'
import AppButton from '@/components/AppButton.vue'
import AppSeam from '@/components/AppSeam.vue'
import RequestCard from '@/components/RequestCard.vue'
import ProcessingRow from '@/components/ProcessingRow.vue'
import AssistantThoughtToggle from '@/components/AssistantThoughtToggle.vue'
import AssistantAccordion from '@/components/AssistantAccordion.vue'
import AnswerProse from '@/components/AnswerProse.vue'
import AssistantAnswer from '@/components/AssistantAnswer.vue'
import AssistantRailToggle from '@/components/AssistantRailToggle.vue'
import AppTabSegments from '@/components/AppTabSegments.vue'
import ProfileMenu from '@/components/ProfileMenu.vue'
import SuggestionsPanel from '@/components/SuggestionsPanel.vue'
import NotificationsMenu from '@/components/NotificationsMenu.vue'
import { brand } from '@/data/brand'
import { graphWorkspace, type TimelineHour } from '@/data/graphWorkspace'
import logoUrl from '@/assets/Osakalogo.svg'
import patternUrl from '@/assets/pattern.svg'

const data = graphWorkspace

// ── UI state, every piece seeded from the dataset ─────────────────────────
/**
 * The DAY the canvas is scoped to — a calendar date, deliberately separate from
 * `selectedPeriod` (the hours WITHIN the day on the time rail). Defaults to
 * today. The graph datasets are not date-keyed yet, so changing it only drives
 * the label and the summary for now; it is the ref a date-keyed backend wires
 * into later.
 */
const selectedDate = ref<Date>(new Date())
const dateMenuOpen = ref(false)

function isToday(d: Date): boolean {
  const now = new Date()
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate()
}

/** Button label: the dataset's relative label while today is selected, else a compact date. */
const dateLabel = computed(() =>
  isToday(selectedDate.value)
    ? data.selectedDate
    : selectedDate.value.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
)

/** A date was picked: store it, close the popover, confirm in the toast. */
function pickDate(value: unknown) {
  if (value instanceof Date) selectedDate.value = value
  dateMenuOpen.value = false
  notify(`Canvas scoped to ${isToday(selectedDate.value) ? dateLabel.value.toLowerCase() : dateLabel.value}`)
}
const layoutMode = ref<'unstructured' | 'structured'>('unstructured')
const memoryRange = ref(data.memory.selectedRange)
const memoryMenuOpen = ref(false)

/** A chart range was picked: store it, close the popover, confirm in the toast. */
function selectMemoryRange(range: string) {
  memoryRange.value = range
  memoryMenuOpen.value = false
  notify(`Showing ${range.toLowerCase()}`)
}
const draft = ref(data.composer.draft)
// Collapsed on first load — the legend is reference material, not primary UI.
const legendOpen = ref(false)

/*
 * ── THE ASSISTANT RAIL: three states ────────────────────────────────────────
 *
 *   CLOSED ──chevron left──▶ OPEN ──chevron left──▶ FULLSCREEN
 *   OPEN / FULLSCREEN ──chevron right──▶ CLOSED
 *
 * Chevron LEFT always means "give the assistant more room", one step at a time,
 * so from CLOSED it returns to the normal sidebar rather than jumping to
 * fullscreen. Chevron RIGHT always closes outright, from either open state.
 *
 * OPEN is the initial state and the only resizable one — FULLSCREEN has no
 * width to drag and CLOSED has no rail. The rail element itself is never
 * unmounted or duplicated across these states: one `<aside>` carries all three
 * (see `.rail--closed` / `.rail--fullscreen`), which is also what keeps the
 * assistant's own content and scroll position intact across a close/reopen.
 */
type RailState = 'closed' | 'open' | 'fullscreen'
const railState = ref<RailState>('open')
/** Anything the rest of the screen only needs "is there a rail" for. */
const railOpen = computed(() => railState.value !== 'closed')

/**
 * The sidebar's width in the OPEN state, in px. Owned here rather than in CSS
 * because the drag writes it: the workspace publishes it as `--rail-width`,
 * which is the single value both `.rail` and the handle's seam position derive
 * from, so they cannot disagree mid-drag.
 */
const RAIL_WIDTH = { default: 504, min: 360, max: 880 }
const railWidth = ref(RAIL_WIDTH.default)
/** Suppresses width transitions while dragging — otherwise the rail lags. */
const railDragging = ref(false)

const clampRailWidth = (px: number) =>
  Math.min(Math.max(px, RAIL_WIDTH.min), Math.min(RAIL_WIDTH.max, window.innerWidth - 320))

/** Chevron left — one step toward more assistant. */
function expandRail() {
  railState.value = railState.value === 'closed' ? 'open' : 'fullscreen'
}

/** Chevron right — close outright, from either open state. */
function collapseRail() {
  railState.value = 'closed'
}

/*
 * Drag-to-resize, on the handle itself. Pointer events (not mouse) so pen and
 * touch work, with capture so the drag survives the pointer leaving the small
 * handle — which it immediately does, since the rail edge moves with it.
 *
 * The handle also HOLDS the two chevron buttons, so a press has to resolve into
 * either a resize or a click, never both: movement past `DRAG_THRESHOLD`
 * commits to a drag and swallows the click that would otherwise follow.
 */
const DRAG_THRESHOLD = 3
let dragStartX = 0
let dragStartWidth = 0
let dragMoved = false

function onRailHandlePointerDown(event: PointerEvent) {
  if (railState.value !== 'open' || event.button !== 0) return
  dragStartX = event.clientX
  dragStartWidth = railWidth.value
  dragMoved = false
  /*
   * ⚠️ NO setPointerCapture HERE. Capturing on pointerdown retargets the
   * following `click` to the capturing element, so a plain click on a chevron
   * would be delivered to the handle instead of the <button> and the chevron
   * would silently stop working. Capture is taken below, only once movement has
   * actually committed to a drag — at which point the click is being suppressed
   * anyway.
   */
}

function onRailHandlePointerMove(event: PointerEvent) {
  if (railState.value !== 'open' || !dragStartX) return
  // Dragging LEFT widens the rail: the handle sits on the rail's left edge, so
  // the rail grows by however far the pointer has travelled toward the canvas.
  const delta = dragStartX - event.clientX
  if (!dragMoved && Math.abs(delta) < DRAG_THRESHOLD) return
  if (!dragMoved) {
    // First committed movement: now take the pointer, so the drag survives the
    // pointer leaving the small handle — which it does immediately, since the
    // rail edge moves out from under it.
    dragMoved = true
    ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  }
  railDragging.value = true
  railWidth.value = clampRailWidth(dragStartWidth + delta)
}

function onRailHandlePointerUp(event: PointerEvent) {
  if (!dragStartX) return
  const el = event.currentTarget as HTMLElement
  if (el.hasPointerCapture?.(event.pointerId)) el.releasePointerCapture(event.pointerId)
  dragStartX = 0
  railDragging.value = false
}

/** A drag that moved must not also fire the chevron underneath it. */
function onRailHandleClickCapture(event: MouseEvent) {
  if (!dragMoved) return
  dragMoved = false
  event.stopPropagation()
  event.preventDefault()
}

/** Keyboard parity for the drag: the WAI splitter pattern's arrow keys. */
function onRailHandleKeydown(event: KeyboardEvent) {
  if (railState.value !== 'open') return
  const step = event.shiftKey ? 64 : 16
  if (event.key === 'ArrowLeft') railWidth.value = clampRailWidth(railWidth.value + step)
  else if (event.key === 'ArrowRight') railWidth.value = clampRailWidth(railWidth.value - step)
  else return
  event.preventDefault()
}

const zoom = ref(1)
/** Which hour of the time rail the canvas is scoped to. */
const currentHour = ref(data.timeline.findIndex(h => h.current))
/** Period selection: start and end hour indices. Initialized to default. */
// Initial selection: 02 PM → 07 PM (slot indices 1–5; the window's bottom edge
// sits on end+1's hour line). Temporarily overrides data.defaultPeriod.
const selectedPeriod = ref<{ start: number, end: number } | null>({ start: 1, end: 5 })
/** Track which handle is being dragged. */
const draggingHandle = ref<'start' | 'end' | null>(null)

/**
 * VISUAL-ONLY period for whole-selection dragging. Moving the entire band is
 * a UI gesture that must NOT touch the graph's period — selectedPeriod (and
 * the filteredNodes/filteredLinks chain it drives) stays exactly as it was
 * while the band moves. The rail DRAWS displayPeriod: the visual override
 * when a whole-drag has moved the band, the real period otherwise. A handle
 * resize adopts the visual position first (see startDrag), so the band the
 * user sees and the band being resized can never disagree.
 */
const visualSelectedPeriod = ref<{ start: number, end: number } | null>(null)
const draggingSelection = ref(false)
const displayPeriod = computed(() => visualSelectedPeriod.value ?? selectedPeriod.value)
/** Track which cluster is selected to show the overlay. */
const selectedCluster = ref<string | null>(null)

/** Conversation switcher in the rail header — active id seeded from the dataset. */
const conversationMenuOpen = ref(false)
const activeConversationId = ref(data.composer.activeConversationId)
const activeConversation = computed(() =>
  data.composer.conversations.find(c => c.id === activeConversationId.value)
  ?? data.composer.conversations[0],
)
function selectConversation(id: string) {
  activeConversationId.value = id
  notify(`Switched to “${activeConversation.value.title}”`)
}

/*
 * ── THE CHAT DEMO ─────────────────────────────────────────────────────────
 *
 * A local, synthetic flow: pick a suggestion → it fills the composer → sending
 * turns the rail's dashboard stack into a conversation. No API call; the
 * "thinking" pause is a timer. Everything here is display state — the graph,
 * the rail's open/close state and its width logic are untouched.
 */
/** The demo question a suggestion loads into the composer. */
const DEMO_QUESTION = 'Core, I have a follow-up meeting with the Legalfab investors in 20 minutes. I’m nervous about the valuation justification. What’s my strongest angle based on our actual progress?'
/** How long the simulated processing runs (ms) — the 1.5–2.5s brief. */
const PROCESSING_MS = 2000

/** Sent messages, oldest first. Non-empty === the rail is in its chat state. */
const chatMessages = ref<string[]>([])
/** True while the fake assistant is "thinking". */
const chatProcessing = ref(false)
/** True once processing has finished and the scripted answer is on screen. */
const chatAnswered = ref(false)
/** SuggestionsPanel's open state, so sending can collapse it. */
const suggestionsOpen = ref(false)
/**
 * The REASONING trail's disclosure, driven by the thought toggle. The toggle
 * controls ONLY this trail — the answer itself (Summary, body, chart) is
 * always visible. Closed by default: reasoning is auxiliary provenance, the
 * answer is the content.
 */
/*
 * COLLAPSED on arrival: the answer leads, and the reasoning trail is opt-in —
 * the toggle rests as the compact pill (logo · duration · divider · chevron)
 * until the user opens it. Still a toggle both ways.
 */
const chatThoughtOpen = ref(false)

/**
 * The reasoning trail the Thought toggle opens INSIDE its own container: one
 * accordion step per entry of the answer's `reasoning` data — the exact
 * surface AssistantAccordion was built for, fed from the same dataset as the
 * answer (pure view, no copy of its own).
 */
const reasoningSteps = computed(() => data.demoAnswer.reasoning)
/*
 * Per-step expansion — ALL COLLAPSED at arrival: opening the Thought toggle reveals the LIST of
 * reasoning steps only — each step is opened manually. `defaultOpen` in the
 * dataset is deliberately ignored here (kept in the data shape for hosts that
 * do want a step pre-opened).
 */
const reasoningOpen = ref<Record<string, boolean>>(
  Object.fromEntries(data.demoAnswer.reasoning.map(step => [step.id, false])),
)
/** The rail shows the conversation instead of the dashboard cards. */
const chatActive = computed(() => chatMessages.value.length > 0)
let processingTimer: ReturnType<typeof setTimeout> | null = null

/**
 * A suggestion was picked: load the demo question into the composer and leave
 * it there. Deliberately NOT sent — the user still reads it, edits it, and
 * presses send themselves.
 */
function onSuggestion(id: string) {
  const picked = data.composer.suggestions.find(s => s.id === id)
  draft.value = DEMO_QUESTION
  // Picking a suggestion is a decision: the list collapses immediately (its
  // own v-model transition), leaving the loaded question in the composer.
  suggestionsOpen.value = false
  nextTick(() => {
    measureComposer()
    // Focus the field so the loaded question is immediately editable — the
    // point of not sending it straight away.
    composerField.value?.$el?.querySelector('textarea')?.focus()
  })
  if (picked) notify('Suggestion loaded — press send when you are ready')
}

const snack = ref<{ show: boolean, text: string, color: string }>({ show: false, text: '', color: 'primary' })
function notify(text: string, color = 'primary') {
  snack.value = { show: true, text, color }
}

// ── The canvas sizes the chart ────────────────────────────────────────────
// BaseChart takes a pixel height (ECharts renders to canvas and cannot size
// itself from CSS), so the chart height is observed off the canvas element
// rather than guessed. Falls back to a sane height before the first measure.
const canvasEl = useTemplateRef<HTMLElement>('canvasEl')
const graphRef = useTemplateRef('graphRef')
const canvasHeight = ref(560)
let observer: ResizeObserver | undefined

onMounted(() => {
  if (!canvasEl.value) return
  observer = new ResizeObserver(([entry]) => {
    canvasHeight.value = Math.max(320, Math.round(entry.contentRect.height))
  })
  observer.observe(canvasEl.value)
})
onBeforeUnmount(() => observer?.disconnect())

// ── Composer layout: one row until the draft needs two ────────────────────
/**
 * The composer is a single row — [attach] [draft] [mic|send] — until the draft
 * stops fitting on one line, at which point the field takes its own row above
 * the actions.
 *
 * The test is ALWAYS run at the field's INLINE width, never at its current one.
 * Measuring the live element would oscillate: stacking makes the field wider,
 * so the text that just wrapped would fit again, which would unstack it, which
 * would make it narrow enough to wrap — flipping on every keystroke. The inline
 * width is derived from the row minus the actions, and the actions keep their
 * size in both states, so the same draft always yields the same answer.
 */
const composerRow = useTemplateRef<HTMLElement>('composerRow')
/** The scrolling region — kept so a new message can be brought into view. */
const railStack = useTemplateRef<HTMLElement>('railStack')
const composerField = useTemplateRef<{ $el: HTMLElement }>('composerField')
const composerStacked = ref(false)
let composerObserver: ResizeObserver | undefined

/**
 * Hidden probe the draft is laid out in to find its true height.
 *
 * The textarea itself cannot answer this. Vuetify gives the field a 48px
 * `--v-input-control-height` and the textarea stretches to fill it, so its
 * scrollHeight never drops below 48px even when empty — it reports two lines
 * for every draft, including none. The probe has no min-height, so its height
 * is purely the wrapped text.
 */
let composerProbe: HTMLDivElement | undefined

function getComposerProbe() {
  if (!composerProbe) {
    composerProbe = document.createElement('div')
    composerProbe.setAttribute('aria-hidden', 'true')
    Object.assign(composerProbe.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      visibility: 'hidden',
      pointerEvents: 'none',
      whiteSpace: 'pre-wrap',
      overflowWrap: 'break-word',
    })
    document.body.append(composerProbe)
  }
  return composerProbe
}

function measureComposer() {
  const row = composerRow.value
  const fieldRoot = composerField.value?.$el
  const textarea = fieldRoot?.querySelector('textarea')
  if (!row || !fieldRoot || !textarea) return

  // Row width minus everything that is not the field, minus the gaps between.
  const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0
  const children = Array.from(row.children) as HTMLElement[]
  const actionsWidth = children
    .filter(child => child !== fieldRoot)
    .reduce((total, child) => total + child.getBoundingClientRect().width, 0)
  const inlineWidth = row.clientWidth - actionsWidth - gap * Math.max(0, children.length - 1)
  if (inlineWidth <= 0) return

  /*
   * Convert the field's inline width to the width the TEXT gets. Everything
   * between the two — the field's padding, the textarea's own — is constant
   * across both states, so it can be measured now and subtracted, which keeps
   * the probe honest whichever state we are currently in.
   */
  const style = getComputedStyle(textarea)
  const padX = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
  const chrome = fieldRoot.getBoundingClientRect().width - (textarea.clientWidth - padX)
  const textWidth = inlineWidth - chrome
  if (textWidth <= 0) return

  const probe = getComposerProbe()
  probe.style.width = `${textWidth}px`
  probe.style.font = style.font
  probe.style.fontFamily = style.fontFamily
  probe.style.fontSize = style.fontSize
  probe.style.fontWeight = style.fontWeight
  probe.style.letterSpacing = style.letterSpacing
  probe.style.lineHeight = style.lineHeight
  /*
   * A space, never '', so an empty draft still measures as exactly one line.
   *
   * The trailing zero-width space is load-bearing: a block element does NOT
   * create a line box for a trailing newline, so "abc\n" measures the same 24px
   * as "abc" and a shift+Enter would grow the textarea to two lines while the
   * probe still reported one. The sentinel forces that final line box into
   * existence. It is zero-width, so it can never push a full line into wrapping.
   */
  probe.textContent = `${draft.value || ' '}\u200B`

  const lineHeight = Number.parseFloat(style.lineHeight) || 24
  composerStacked.value = probe.getBoundingClientRect().height > lineHeight * 1.5
}

watch(draft, () => nextTick(measureComposer))

onMounted(() => {
  if (!composerRow.value) return
  /*
   * Measuring is deferred a frame. Flipping `composerStacked` re-lays-out the
   * very row being observed, so measuring inline would re-enter the observer
   * within one frame and the browser reports "ResizeObserver loop completed
   * with undelivered notifications". A rAF hop settles the layout first.
   * Fires once on observe, which covers the initial measure too.
   */
  composerObserver = new ResizeObserver(() => {
    requestAnimationFrame(measureComposer)
  })
  composerObserver.observe(composerRow.value)

  /*
   * Re-measure once the webfont is in. The probe copies the field's font to
   * decide where the draft wraps, so a measurement taken against the fallback
   * face answers for the wrong metrics — and nothing would correct it until the
   * next keystroke or resize, leaving the composer stuck in the wrong state.
   * Guarded: the Font Loading API is not universal, and a miss just means the
   * existing measure stands.
   */
  document.fonts?.ready.then(() => requestAnimationFrame(measureComposer))
})
onBeforeUnmount(() => {
  composerObserver?.disconnect()
  composerProbe?.remove()
  composerProbe = undefined
})

// ── Derived view data ─────────────────────────────────────────────────────
const insightCount = computed(() => filteredNodes.value.filter(n => n.kind === 'insight').length)
const sourceCount = computed(() => filteredNodes.value.filter(n => n.kind === 'source').length)
// Sentiment annotates the canvas centre ring, not the rail tiles — it is its own
// dataset field rather than a meter, so the rail's tile count can change freely.
const sentimentPercent = computed(() => data.sentiment.ratio * 100)

/**
 * The text alternative to the canvas. A <canvas> graph cannot be explored with a
 * keyboard or a screen reader, so the same summary is exposed here in prose and
 * the rail carries the insights themselves. Required, not optional — see the
 * a11y note in NetworkChart.vue.
 */
const graphSummary = computed(() => {
  const period = selectedPeriod.value
  let timeRange: string
  if (period != null) {
    timeRange = `${data.timeline[period.start].label}–${data.timeline[period.end].label}`
  } else {
    timeRange = 'full timeline'
  }
  const day = isToday(selectedDate.value) ? dateLabel.value.toLowerCase() : dateLabel.value
  return `Knowledge graph for ${day} (${timeRange}): `
    + `${filteredNodes.value.length} nodes across ${sourceCount.value} connected sources, `
    + `${insightCount.value} insights and ${filteredLinks.value.length} relationships.`
})

/**
 * The rail's KPI row: labels and icons from the dataset, VALUES resolved from
 * what the app already knows — the live graph for sources and insights, the
 * memory stats for entities (which are not rendered as nodes, so the graph
 * cannot count them). Nothing here is a second copy of a number.
 */
const railKpis = computed(() => data.railSummary.kpis.map((kpi) => {
  const value = kpi.id === 'sources'
    ? sourceCount.value
    : kpi.id === 'insights'
      ? insightCount.value
      : data.memory.stats.find(stat => stat.id === 'entities')?.value ?? 0
  return { ...kpi, value }
}))

const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`)

/**
 * A reference inside the answer prose was clicked. When the id resolves to a
 * real graph node (source hub, document hub, cluster), it takes the SAME path
 * clicking that node on the canvas takes — no parallel navigation. A
 * reference whose destination doesn't exist yet (entity-level names like
 * "DDA logic") is a deliberate no-op: the component API is ready, the route
 * isn't.
 */
/**
 * The inline reference currently hovered in the answer — the canvas isolates
 * the matching graph element while non-null (NetworkGraphD3.highlightRefId).
 */
const answerHighlightId = ref<string | null>(null)

function onAnswerRef(refId: string) {
  const node = data.nodes.find(n => n.id === refId)
  // No destination yet (entity-level names like "DDA logic"): the component
  // API is ready, the graph simply has nothing to open.
  if (!node) return
  // Reuse the canvas's OWN focus behaviour rather than a parallel route — a
  // cluster opens its drill-down, a hub gets framed with its group.
  if (graphRef.value?.focusNode(refId)) {
    selectedCluster.value = refId
    notify(`Focused ${node.label ?? refId} in the graph`)
  }
}

/** The response's icon actions. Copy is real; the rest acknowledge. */
function onAnswerAction(id: 'copy' | 'like' | 'dislike' | 'update') {
  if (id === 'copy') {
    const text = data.demoAnswer.summary
      .map(paragraph => paragraph.map(seg => typeof seg === 'string' ? seg : seg.text).join(''))
      .join('\n\n')
    navigator.clipboard?.writeText(text)
    notify('Response copied')
  } else if (id === 'like') {
    notify('Marked as helpful')
  } else if (id === 'dislike') {
    notify('Marked as not helpful')
  } else {
    notify('Response update requested')
  }
}

function handleClusterClick(nodeId: string) {
  selectedCluster.value = nodeId
  // Clusters no longer stand in for a route: clicking one opens the canvas's
  // own drill-down, reported separately through `cluster-expand` below. Only
  // hub nodes (sources/documents) still await a details screen.
  const node = data.nodes.find(n => n.id === nodeId)
  if (node?.kind === 'cluster') return
  notify(`Navigating to ${nodeId}…`)
  // Navigate to details screen
  // TODO: Replace with actual route when screen is built
  setTimeout(() => {
    notify(`${nodeId} details view (screen not yet built)`, 'info')
  }, 1000)
}

/**
 * The canvas entered or left its Cluster drill-down. The graph owns the state;
 * the screen only mirrors it (and names the cluster by the semantic category
 * the dataset already carries, so the toast can't invent a label).
 */
const expandedClusterId = ref<string | null>(null)

/**
 * The canvas hit its expansion cap and collapsed the oldest region to make
 * room for the one just clicked. Say so — a region closing on its own would
 * otherwise read as a bug. The limit comes from the event, so this copy can
 * never drift from the graph's own constant.
 */
function handleExpandLimit(max: number) {
  notify(`Up to ${max} clusters can be expanded at the same time.`)
}

function handleClusterExpand(clusterId: string | null) {
  expandedClusterId.value = clusterId
  if (!clusterId) return
  const cluster = data.nodes.find(n => n.id === clusterId) as { category?: string } | undefined
  notify(cluster?.category
    ? `Exploring the ${cluster.category} cluster`
    : `Exploring cluster ${clusterId}`)
}

/**
 * Legend swatch colors, resolved from the SAME chart theme NetworkChart paints
 * with — so the key can never describe a color the canvas isn't using.
 */
const chartTheme = useChartTheme()
const legendColor = computed(() => (ink: 'insight' | 'entity' | 'structure') => {
  const t = chartTheme.value
  if (ink === 'insight') return t.categorical[0]
  if (ink === 'entity') return t.categorical[1]
  return withAlpha(t.ink, 0.55)
})

/**
 * TEMP: timeline→graph filtering is DISABLED. The timeline UI (selection,
 * handles, drag) keeps working visually, but the graph always receives the
 * full dataset. To restore filtering, set this flag back to false — the
 * filtering logic below is intact and untouched.
 */
const TIMELINE_FILTERING_DISABLED = true

/** Filter nodes to those relevant to the selected time period. */
const filteredNodes = computed(() => {
  const period = TIMELINE_FILTERING_DISABLED ? null : selectedPeriod.value
  const result = !period ? data.nodes : data.nodes.filter(node => {
    // Nodes without a timeRange are always shown (sources, documents)
    if (!node.timeRange) return true
    // Show if node's timeRange overlaps with selected period
    return node.timeRange.start <= period.end && node.timeRange.end >= period.start
  })
  console.log(`[GraphWorkspace] filteredNodes updated: ${result.length} nodes, period=${period ? `${period.start}-${period.end}` : 'none'}`)
  return result
})

/** Filter links to include only those connecting visible nodes. */
const filteredLinks = computed(() => {
  const visibleNodeIds = new Set(filteredNodes.value.map(n => n.id))
  return data.links.filter(link =>
    visibleNodeIds.has(link.source) && visibleNodeIds.has(link.target),
  )
})

function zoomBy(factor: number) {
  graphRef.value?.applyZoomScale(factor)
}

/** Restore the camera to the initial-entry framing (viewport only). */
function resetGraphView() {
  graphRef.value?.resetView()
}

/**
 * Reset is only offered once the user has moved the camera away from the
 * initial fit-to-view framing (pan, wheel zoom, or the +/- controls). The
 * graph reports every camera change with whether it matches the initial
 * framing, so simulation-driven settling never shows the button, and
 * resetting (or landing back exactly) hides it again.
 */
const viewportChanged = ref(false)

/**
 * Structured cluster-detail is open. It is the SECOND reason the Reset control
 * shows: opening a cluster deliberately leaves the camera untouched (the wheel
 * turns instead), so `viewportChanged` stays false and Reset would otherwise
 * be unavailable exactly when there is something to reset. One control, two
 * inputs — resetView() already closes the detail, unwinds the wheel and
 * restores the framing in one call.
 */
const structuredDetailOpen = ref(false)

/**
 * Where inside an hour slot each insight dot sits, as 0–1 fractions.
 *
 * Prefers the dataset's own `insightOffsets` (real moments within the hour);
 * falls back to spreading `insightCount` evenly so an hour that only reports a
 * count still renders. Evenly means (i+1)/(n+1), which keeps the dots off both
 * slot edges instead of stacking one on the boundary with the next hour.
 */
/**
 * Activity for one quarter of an hour (q = 0–3 → :00/:15/:30/:45). Prefers the
 * dataset's per-quarter values; falls back to the hour's overall proportion so
 * coarser data still renders four rows.
 */
function quarterActivity(hour: TimelineHour, q: number): number {
  return hour.quarters?.[q] ?? hour.activity
}

function insightDots(hour: TimelineHour): number[] {
  if (hour.insightOffsets?.length) return hour.insightOffsets
  const count = hour.insightCount ?? 0
  return Array.from({ length: count }, (_, i) => (i + 1) / (count + 1))
}

function scopeToHour(index: number) {
  currentHour.value = index
  notify(`Canvas scoped to ${data.timeline[index].label}`)
}

function startPeriodSelection(index: number) {
  selectedPeriod.value = { start: index, end: index }
}

function startDrag(handleType: 'start' | 'end', e: PointerEvent) {
  e.preventDefault()
  draggingHandle.value = handleType
  // A whole-band move may have left the DISPLAYED band offset from the real
  // period. Resizing acts on the band the user sees, so adopt it first —
  // this is the handles' existing change-the-period behavior, just anchored
  // to the visually current band.
  if (visualSelectedPeriod.value) {
    selectedPeriod.value = { ...visualSelectedPeriod.value }
    visualSelectedPeriod.value = null
  }
  const initialPeriod = selectedPeriod.value
  if (!initialPeriod) return

  // The handles live on the selection band, a sibling of the masked hour list —
  // so measure the ruler column, which wraps both and shares their exact height.
  const timelineEl = (e.target as HTMLElement).closest('.timeline__ruler') as HTMLElement | null
  if (!timelineEl) return

  const containerHeight = timelineEl.clientHeight
  const itemCount = data.timeline.length
  // Each hour owns an equal SLOT of the rail (see .timeline__item), so the rail
  // divides by the item count — not by the gaps between items — and the slot the
  // pointer is inside is the one it floors into.
  const pixelsPerItem = containerHeight / itemCount
  const timelineRect = timelineEl.getBoundingClientRect()

  function onMove(moveEvent: PointerEvent) {
    if (!selectedPeriod.value) return

    const relativeY = moveEvent.clientY - timelineRect.top
    // Map pixel position to the hour slot the pointer is currently over.
    const targetIndex = Math.floor(relativeY / pixelsPerItem)
    const clampedIndex = Math.max(0, Math.min(targetIndex, itemCount - 1))

    if (handleType === 'start') {
      selectedPeriod.value = { ...selectedPeriod.value, start: Math.min(clampedIndex, selectedPeriod.value.end) }
    } else {
      selectedPeriod.value = { ...selectedPeriod.value, end: Math.max(clampedIndex, selectedPeriod.value.start) }
    }
  }

  function onEnd() {
    draggingHandle.value = null
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup', onEnd)
  }

  document.addEventListener('pointermove', onMove)
  document.addEventListener('pointerup', onEnd)
}

/**
 * Drag the WHOLE selection band. UI-ONLY by requirement: mutates
 * visualSelectedPeriod (what the rail draws) and never selectedPeriod, so
 * graph filtering state is untouched while the band moves. The selection
 * duration is preserved and movement clamps to the rail's bounds. The
 * handles sit inside the band and keep owning start/end resizing — a
 * pointerdown on one is theirs, not a whole-band move.
 */
function startSelectionDrag(e: PointerEvent) {
  if ((e.target as HTMLElement).closest('.timeline__handle')) return
  const origin = displayPeriod.value
  if (!origin) return
  e.preventDefault()

  // Same geometry source as startDrag: the ruler column's height ÷ slots.
  const timelineEl = (e.currentTarget as HTMLElement).closest('.timeline__ruler') as HTMLElement | null
  if (!timelineEl) return
  const pixelsPerItem = timelineEl.clientHeight / data.timeline.length

  draggingSelection.value = true
  visualSelectedPeriod.value = { ...origin }
  const duration = origin.end - origin.start
  const startSlot = origin.start
  const startY = e.clientY
  const maxStart = data.timeline.length - 1 - duration

  function onMove(moveEvent: PointerEvent) {
    const deltaSlots = Math.round((moveEvent.clientY - startY) / pixelsPerItem)
    const newStart = Math.max(0, Math.min(startSlot + deltaSlots, maxStart))
    visualSelectedPeriod.value = { start: newStart, end: newStart + duration }
  }

  function onEnd() {
    draggingSelection.value = false
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup', onEnd)
  }

  document.addEventListener('pointermove', onMove)
  document.addEventListener('pointerup', onEnd)
}

/** Copy a sent request back to the clipboard, and say so. */
async function copyRequest(message: string) {
  try {
    await navigator.clipboard.writeText(message)
    notify('Request copied')
  } catch {
    // Clipboard access can be refused (permissions, insecure origin) — say so
    // rather than failing silently.
    notify('Could not copy — check clipboard permissions', 'error')
  }
}

/** Put a sent request back in the composer to revise and send again. */
function editRequest(message: string) {
  draft.value = message
  nextTick(() => {
    measureComposer()
    composerField.value?.$el?.querySelector('textarea')?.focus()
  })
  notify('Request moved back to the composer')
}

/**
 * Bring the newest chat content into view. The stack is the scrolling region,
 * and a conversation that leaves its latest turn off-screen reads as broken —
 * so this runs both when a message is sent and when the answer lands.
 * `nextTick` first: the height has to exist before it can be scrolled to.
 */
function scrollChatToLatest() {
  nextTick(() => {
    railStack.value?.scrollTo({ top: railStack.value.scrollHeight, behavior: 'smooth' })
  })
}

/**
 * Bring the LATEST REQUEST to the top of the rail instead of the bottom of the
 * conversation. Used for the turn that switches the rail from the summary view
 * into the chat view (the suggestion → send flow): the reader should land on
 * the question they just asked — request, then thinking, then the answer
 * unrolling below — not on the answer's action row with everything above it
 * off-screen.
 */
function scrollChatToRequest() {
  nextTick(() => {
    const stack = railStack.value
    if (!stack) return
    const requests = stack.querySelectorAll<HTMLElement>('.chat__request')
    const latest = requests[requests.length - 1]
    if (latest) stack.scrollTo({ top: latest.offsetTop - stack.offsetTop, behavior: 'smooth' })
  })
}

function send() {
  const question = draft.value.trim()
  if (!question) return
  // The FIRST message is the summary → chat transition; it gets the read-from-
  // the-top treatment. Later turns keep the usual follow-the-conversation
  // scroll. Captured before the push so the answer callback below sees it too.
  const isOpeningTurn = chatMessages.value.length === 0
  chatMessages.value.push(question)
  draft.value = ''
  // The panel has done its job — back to its collapsed default, with the
  // trigger still sitting above the composer.
  suggestionsOpen.value = false
  chatAnswered.value = false
  nextTick(measureComposer)
  // Simulated thinking. Cleared on unmount so a pending timer can never write
  // to a torn-down component.
  if (isOpeningTurn) scrollChatToRequest()
  else scrollChatToLatest()
  chatProcessing.value = true
  if (processingTimer) clearTimeout(processingTimer)
  processingTimer = setTimeout(() => {
    chatProcessing.value = false
    // The processing row is replaced by the thought toggle + the answer.
    chatAnswered.value = true
    processingTimer = null
    // On the opening turn the viewport stays at the top of the conversation —
    // forcing it down to the freshly-landed answer would yank the reader away
    // from the request they are looking at. Normal scrolling (and the
    // follow-the-latest behaviour of later turns) is untouched.
    if (!isOpeningTurn) scrollChatToLatest()
  }, PROCESSING_MS)
}

onBeforeUnmount(() => {
  if (processingTimer) clearTimeout(processingTimer)
})
</script>

<template>
  <v-app>
    <!-- `workspace--assistant-full` tracks the FULLSCREEN state only: it is
         what lets sibling chrome (the brand navbar, the toggle handle) restyle
         against it without the rail knowing about them. `--rail-width` is
         published here because both the rail and the handle's seam position
         derive from it — one value, so they cannot disagree mid-drag. -->
    <div
      class="workspace"
      :class="{
        'workspace--assistant-full': railState === 'fullscreen',
        'workspace--rail-dragging': railDragging,
      }"
      :style="{ '--rail-width': `${railWidth}px` }"
    >
      <!-- ── THE CANVAS ─────────────────────────────────────────────── -->
      <section ref="canvasEl" class="canvas canvas--with-pattern" aria-label="Knowledge graph canvas">
        <!--
          The page's h1. It is visually silent because the brand chip already
          identifies the product on screen, but the heading order has to start
          somewhere — the rail's card headings are h2s under it.
        -->
        <h1 class="d-sr-only">{{ brand.identity.name }} knowledge graph</h1>

        <NetworkGraphD3
          ref="graphRef"
          :nodes="filteredNodes"
          :links="filteredLinks"
          :height="canvasHeight"
          :zoom="zoom"
          :layout-mode="layoutMode"
          :title="graphSummary"
          :user-initials="data.user.initials"
          :sentiment-percent="sentimentPercent"
          :sentiment-label="data.sentiment.label"
          :highlight-ref-id="answerHighlightId"
          @cluster-click="handleClusterClick"
          @cluster-expand="handleClusterExpand"
          @expand-limit="handleExpandLimit"
          @viewport-change="viewportChanged = !$event"
          @focus-change="structuredDetailOpen = $event"
        />
        <!-- The canvas summary in text, for keyboard and screen-reader users. -->
        <p class="d-sr-only">{{ graphSummary }}</p>

        <!-- Brand chip — floats at the top-left (Reset lives in the toolbar) -->
        <div class="chrome chrome--brand-row d-flex align-center ga-4">
        <v-sheet class="chrome--brand surface--brand d-flex align-center">
          <div class="d-flex align-center ga-3 pa-3">
          <img :src="logoUrl" :alt="`${brand.identity.name} logo`" width="32" height="32">
          <div class="mr-2">
            <div class="text-label-large font-weight-bold">{{ brand.identity.name }}</div>
            <div class="text-label-small text-medium-emphasis">Platform</div>
          </div>
          </div>
          <div class="flex-grow-1"></div>
          <!--
            Figma: full-height seams between the brand block, profile and
            notifications — the same one the rail's cards use. AppSeam stretches
            to the chip's height on its own, so no fixed px anywhere.
          -->
          <AppSeam vertical filled :stop="32" />
          <div class="d-flex align-center px-3 py-2">
          <ProfileMenu
            :user="data.user"
            @settings="notify('Settings opened')"
            @help="notify('Help Center opened')"
            @logout="notify('Signed out')"
          />
          </div>
          <AppSeam vertical filled :stop="32" />
          <div class="d-flex align-center px-3 py-2">
          <NotificationsMenu
            :notifications="data.notifications"
            @show-all="notify('All notifications opened')"
            @overflow="notify('Notification options opened')"
          />
          </div>
        </v-sheet>
        </div>

        <!-- Canvas toolbar -->
        <div class="chrome chrome--toolbar d-flex align-center">
          <!--
            Reset leads the toolbar, left of Search. Same peer treatment as
            every other control in the bar (secondary / size m / icon-only),
            and the same visibility rule it has always had: it appears only
            once the camera has moved away from the initial fit-to-view.
            Icon-only, so the action name lives in the aria-label.
          -->
          <AppButton v-if="viewportChanged || structuredDetailOpen" variant="secondary" size="m" icon-only aria-label="Reset view" @click="resetGraphView">
            <template #icon><v-icon icon="refresh" /></template>
          </AppButton>
          <AppButton variant="secondary" size="m" icon-only aria-label="Search the graph" @click="notify('Graph search opened')">
            <template #icon><v-icon icon="search" /></template>
          </AppButton>
          <AppButton variant="secondary" size="m" icon-only aria-label="Filter what the canvas shows" @click="notify('Filters opened')">
            <template #icon><v-icon icon="filter" /></template>
          </AppButton>

          <!-- Secondary, like every other control in this group: the toolbar is
               one bar of peers, so no single action outranks the others. -->
          <AppButton variant="secondary" size="m" @click="notify('Analyzing the current view…')">
            <template #icon><v-icon icon="chartTrend" /></template>
            Analyze
          </AppButton>

          <app-tab-segments
            v-model="layoutMode"
            size="s"
            mandatory
            @update:model-value="notify(
              `Switched to ${layoutMode === 'unstructured' ? 'unstructured' : 'structured'} layout`,
            )"
          >
            <v-btn
              value="unstructured"
              aria-label="Unstructured view: force-directed layout"
              icon="graph"
            />
            <v-btn
              value="structured"
              aria-label="Structured view: hierarchical layout"
              icon="graphClusters"
            />
          </app-tab-segments>
        </div>

        <!--
          Date scope — a single-date picker in a popover anchored to the button.
          Built on v-menu (same pattern as ProfileMenu) so toggle, click-outside,
          Escape and the aria-expanded/haspopup wiring come for free.
          close-on-content-click is off because month navigation clicks inside
          the picker must not dismiss it — pickDate() closes it on a real pick.
        -->
        <v-menu v-model="dateMenuOpen" location="bottom start" :close-on-content-click="false">
          <template #activator="{ props: activatorProps }">
            <AppButton v-bind="activatorProps" variant="outlined" size="s" class="chrome chrome--date">
              {{ dateLabel }}
              <template #rightIcon><v-icon icon="chevronDown" /></template>
            </AppButton>
          </template>
          <v-date-picker
            :model-value="selectedDate"
            color="primary"
            hide-header
            show-adjacent-months
            @update:model-value="pickDate"
          />
        </v-menu>

        <!-- Zoom -->
        <div class="chrome chrome--zoom d-flex flex-column">
          <AppButton variant="secondary" size="m" icon-only :aria-label="`Zoom in, currently ${zoomLabel}`" @click="zoomBy(1.25)">
            <template #icon><v-icon icon="zoomIn" /></template>
          </AppButton>
          <AppButton variant="secondary" size="m" icon-only :aria-label="`Zoom out, currently ${zoomLabel}`" @click="zoomBy(0.8)">
            <template #icon><v-icon icon="zoomOut" /></template>
          </AppButton>
        </div>

        <!--
          Time rail. Each hour is a real button: the graph is a living thing, so
          "when" is navigable, not a decorative axis. Drag the white markers to
          select a time period; yellow dots show when insights appeared.
        -->
        <nav class="chrome chrome--timeline" aria-label="Scope the canvas to an hour">
          <!--
            The rail's body: the hour RULER on the left, the activity HISTOGRAM
            on the right. The fade mask sits on the two content columns — not on
            the selection window, which is a sibling of the masked track so it
            and its handles stay crisp while the hours dissolve at the edges.
          -->
          <div class="timeline__body">
            <!-- ── Hour ruler ── -->
            <div class="timeline__ruler">
              <div class="timeline__mask">
                <ul class="timeline">
                  <li v-for="(hour, i) in data.timeline" :key="hour.label" class="timeline__item">
                    <button
                      class="plain-button hour"
                      :class="{
                        'hour--current': i === currentHour,
                        'hour--in-period': displayPeriod && i >= displayPeriod.start && i <= displayPeriod.end,
                      }"
                      :aria-current="i === currentHour ? 'true' : undefined"
                      type="button"
                      @click="scopeToHour(i)"
                      @dblclick="startPeriodSelection(i)"
                    >
                      <!--
                        Five ruler cells per hour: one major tick carrying the
                        label, then four minor ticks — visual 12-minute
                        subdivisions of the slot, no data behind them.
                      -->
                      <!-- Four 15-minute cells: :00 (major, labelled) + :15/:30/:45 -->
                      <span class="hour__cell">
                        <span class="hour__tick hour__tick--major" />
                        <span class="text-label-small hour__label">{{ hour.label }}</span>
                      </span>
                      <span v-for="n in 3" :key="n" class="hour__cell">
                        <span class="hour__tick" />
                      </span>
                    </button>

                    <!--
                      Insight indicators: one glowing dot per insight, each at
                      its own moment inside the hour (--at, from the dataset).
                    -->
                    <div
                      v-if="insightDots(hour).length"
                      class="hour__insights"
                      :title="`${insightDots(hour).length} insight${insightDots(hour).length > 1 ? 's' : ''} in ${hour.label}`"
                    >
                      <span
                        v-for="(at, n) in insightDots(hour)"
                        :key="n"
                        class="hour__insight-dot"
                        :style="{ '--at': `${at * 100}%` }"
                      />
                    </div>
                  </li>
                </ul>
              </div>

              <!--
                Period selection window — derived from displayPeriod (whole hour
                slots: start's top edge to end's bottom edge, hence the +1),
                never a fixed pixel box. The two handles resize start/end; the
                band ITSELF is grabbable and moves the whole window — a
                UI-only gesture on visualSelectedPeriod that never touches the
                graph's period (see startSelectionDrag).
              -->
              <div
                v-if="displayPeriod"
                class="timeline__selection"
                :class="{ 'timeline__selection--dragging': draggingSelection }"
                :style="{
                  '--selection-start': `${(displayPeriod.start / data.timeline.length) * 100}%`,
                  '--selection-end': `${((displayPeriod.end + 1) / data.timeline.length) * 100}%`,
                }"
                @pointerdown="startSelectionDrag($event)"
              >
                <button
                  type="button"
                  class="timeline__handle timeline__handle--start"
                  :class="{ 'timeline__handle--dragging': draggingHandle === 'start' }"
                  aria-label="Adjust the period start hour"
                  @pointerdown="startDrag('start', $event)"
                />
                <button
                  type="button"
                  class="timeline__handle timeline__handle--end"
                  :class="{ 'timeline__handle--dragging': draggingHandle === 'end' }"
                  aria-label="Adjust the period end hour"
                  @pointerdown="startDrag('end', $event)"
                />
              </div>
            </div>

            <!--
              ── Activity histogram ── one bar per hour from the dataset's
              activity proportion; bars inside the selected period pick up the
              accent. Decorative restatement of data the summary already
              carries, so it's hidden from AT.
            -->
            <div class="timeline__histogram" aria-hidden="true">
              <!--
                Four rows per hour — one per 15-minute interval, aligned 1:1
                with the ruler's quarter cells. Widths come from the dataset's
                per-quarter activity (quarterActivity falls back to the hour
                figure); the accent still keys off the hour being inside
                selectedPeriod, since selection is whole-hour.
              -->
              <template v-for="(hour, i) in data.timeline" :key="hour.label">
                <div v-for="q in 4" :key="`${hour.label}-${q}`" class="histo__row">
                  <span
                    class="histo__bar"
                    :class="{ 'histo__bar--accent': displayPeriod && i >= displayPeriod.start && i <= displayPeriod.end }"
                    :style="{ '--activity': quarterActivity(hour, q - 1) }"
                  />
                </div>
              </template>
            </div>
          </div>

        </nav>

        <!--
          Legend — the key to what is a fact and what Osaka inferred. Same
          construction as the memory-growth card: the card is pa-0 so the header
          and the list pad themselves and the seam between them can run edge to
          edge. It takes .surface--card's fill, but its border is overridden to
          a flat background-token line below — the card's gradient ring is not
          wanted here.
        -->
        <v-card class="chrome chrome--legend pa-0 surface--card">
          <button
            class="plain-button d-flex align-center justify-space-between w-100 pa-3"
            type="button"
            :aria-expanded="legendOpen"
            @click="legendOpen = !legendOpen"
          >
            <span class="text-title-small font-weight-medium">Legend</span>
            <v-icon :icon="legendOpen ? 'collapse' : 'expand'" size="small" />
          </button>
          <!-- Seam inside the collapse: with the list hidden there is nothing
               left for it to divide. -->
          <v-expand-transition>
            <div v-show="legendOpen">
              <!--
                A plain v-divider, not AppSeam: this one is a solid full-width
                cut in the same background token as the card's border, where
                AppSeam always fades to transparent at both ends.
              -->
              <v-divider color="background" :opacity="1" />
              <!-- Rows are spaced by the list's gap, not per-row padding, so the
                   list's 12px pad is the same on all four sides. -->
              <ul class="legend pa-3 d-flex flex-column ga-2">
                <li v-for="entry in data.legend" :key="entry.id" class="d-flex align-center ga-3">
                  <span
                    :class="`swatch swatch--${entry.shape}`"
                    :style="{ color: legendColor(entry.ink) }"
                  />
                  <span class="text-body-small text-medium-emphasis">{{ entry.label }}</span>
                </li>
              </ul>
            </div>
          </v-expand-transition>
        </v-card>
      </section>

      <!-- Rail collapse handle — glass two-chevron control; state stays here.
           An absolute overlay on the workspace: centered on the canvas/rail
           seam while the rail is open, hugging the right edge when closed so
           the rail can always be reopened.

           It is ALSO the resize grip in the open state, hence the splitter
           semantics: the pointer handlers drag the rail's width, and the arrow
           keys do the same from the keyboard. -->
      <div
        class="rail-handle"
        :class="{
          'rail-handle--closed': !railOpen,
          'rail-handle--resizable': railState === 'open',
        }"
        :role="railState === 'open' ? 'separator' : undefined"
        :tabindex="railState === 'open' ? 0 : undefined"
        :aria-label="railState === 'open' ? 'Resize the assistant' : undefined"
        :aria-orientation="railState === 'open' ? 'vertical' : undefined"
        :aria-valuenow="railState === 'open' ? railWidth : undefined"
        :aria-valuemin="railState === 'open' ? RAIL_WIDTH.min : undefined"
        :aria-valuemax="railState === 'open' ? RAIL_WIDTH.max : undefined"
        @pointerdown="onRailHandlePointerDown"
        @pointermove="onRailHandlePointerMove"
        @pointerup="onRailHandlePointerUp"
        @pointercancel="onRailHandlePointerUp"
        @keydown="onRailHandleKeydown"
        @click.capture="onRailHandleClickCapture"
      >
        <AssistantRailToggle
          :state="railState"
          @collapse="collapseRail"
          @expand="expandRail"
        />
      </div>

      <!-- The seam the handle above is centered on: the canvas/rail boundary,
           full viewport height. Gone with the rail, like the boundary itself. -->
      <AppSeam v-if="railOpen" vertical filled :stop="32" class="workspace__seam" />

      <!-- ── THE ASSISTANT RAIL ─────────────────────────────────────── -->
      <!-- ONE element for all three states, switched by modifier class:
           `.rail--closed` collapses it to zero width, `.rail--fullscreen`
           lets it cover the workspace with its content narrowed to a centered
           column. Deliberately NOT `v-if`: keeping the rail mounted is what
           preserves the assistant's content and scroll position across a
           close/reopen, and it is what makes the width animate. -->
      <aside
        class="rail"
        :class="{
          'rail--closed': railState === 'closed',
          'rail--fullscreen': railState === 'fullscreen',
        }"
        :inert="railState === 'closed' || undefined"
        aria-label="Osaka assistant"
      >
        <header class="rail__header d-flex align-center ga-2 py-6 px-6">
          <AppButton variant="secondary" size="m" icon-only aria-label="Conversation history" @click="notify('Conversation history opened')">
            <template #icon><v-icon icon="menu" /></template>
          </AppButton>
          <!--
            The conversation switcher. Same construction as ProfileMenu /
            NotificationsMenu: v-menu supplies toggle-on-click, click-outside,
            Escape, anchoring and focus return; AppButton lets the activator's
            listeners/aria attrs fall through to its <button>. `bottom start`
            anchors the panel below the button, flush with its left edge.
          -->
          <v-menu v-model="conversationMenuOpen" location="bottom start" :offset="8">
            <template #activator="{ props: activatorProps }">
              <AppButton
                v-bind="activatorProps"
                variant="ghost"
                size="m"
                class="rail__conversation-btn flex-grow-1"
              >
                <!--
                  No flex-grow: the title hugs its text so the chevron sits right beside it.
                  text-title-large sits on the span, not the button: AppButton's scoped
                  `.app-button--m` size rule sets 14/400 and outranks an unlayered utility on
                  the same element, so the class only takes effect one level in.
                -->
                <span class="rail__conversation-title text-title-large text-left text-truncate">{{ activeConversation.title }}</span>
                <template #rightIcon><v-icon icon="chevronDown" /></template>
              </AppButton>
            </template>

            <!-- Standard dropdown list pattern (Storybook · Overlays / Lists) on the glass card surface -->
            <v-sheet class="conversation-menu surface--card" width="300">
              <v-list density="comfortable" nav class="bg-transparent pa-2" aria-label="Conversations">
                <v-list-item
                  v-for="c in data.composer.conversations"
                  :key="c.id"
                  :title="c.title"
                  :active="c.id === activeConversationId"
                  @click="selectConversation(c.id)"
                >
                  <template #append>
                    <v-icon v-if="c.id === activeConversationId" icon="check" size="small" />
                  </template>
                </v-list-item>
              </v-list>
            </v-sheet>
          </v-menu>
          <v-spacer />
          <AppButton variant="ghost" size="m" icon-only aria-label="Conversation options" @click="notify('Conversation options')">
            <template #icon><v-icon icon="overflow" /></template>
          </AppButton>
        </header>

        <div ref="railStack" class="rail__stack px-6 pb-13 pt-0 d-flex flex-column ga-4">
          <!--
            DASHBOARD STATE — what the rail shows before a conversation starts.
            Swapped wholesale for the chat below; the header above and the
            composer underneath sit OUTSIDE this stack, so neither is touched.
          -->
          <template v-if="!chatActive">
            <!--
              THE RAIL AT REST: one reading of the whole graph, and the three
              counts behind it. The previous dashboard cards (memory growth,
              connected sources, insight potential, meters) are removed from this
              default view for now — the chat state below is untouched.
            -->
            <!--
              BOTTOM-WEIGHTED: `margin-top: auto` inside the flex column pushes
              the whole dashboard block down, so the flexible empty space falls
              between the header and this content rather than under it. The
              stack's own bottom padding keeps it clear of the composer.
            -->
            <div class="rail-dashboard">
              <!-- No section label any more: the paragraph IS the summary.
                   Rendered through AnswerProse, so names of real graph items
                   are the same interactive references the answer prose uses —
                   same dotted underline, same hover isolation on the canvas
                   (answerHighlightId), same click-to-focus (onAnswerRef). -->
              <p class="rail-summary__body text-body-medium">
                <AnswerProse
                  :runs="data.railSummary.body"
                  @ref-click="onAnswerRef"
                  @ref-hover="answerHighlightId = $event"
                />
              </p>

              <!--
                The counts as compact CHIPS — value + label in one hug-content
                pill, three to a row while the rail is wide enough and wrapping
                when it is not. Still real <button>s, so each figure keeps the
                keyboard reach and focus ring the list rows had.
              -->
              <ul class="rail-kpis">
                <li v-for="kpi in railKpis" :key="kpi.id">
                  <button
                    type="button"
                    class="rail-kpi-chip"
                    @click="notify(`${kpi.label}: ${kpi.value}`)"
                  >
                    <v-icon class="rail-kpi-chip__icon" :icon="kpi.icon" size="16" />
                    <span class="rail-kpi-chip__value text-body-medium font-weight-medium tabular">
                      {{ kpi.value }}
                    </span>
                    <span class="rail-kpi-chip__label text-label-small">{{ kpi.label }}</span>
                  </button>
                </li>
              </ul>
            </div>
          </template>

          <!--
            CHAT STATE — the same scrolling stack, now carrying the
            conversation. Requests hug the right; the processing row sits left,
            per the reference. Both inherit the centred max-width column the
            fullscreen rail already applies to .rail__stack.
          -->
          <template v-else>
            <div v-for="(message, index) in chatMessages" :key="index" class="chat__request">
              <RequestCard
                :message="message"
                @copy="copyRequest(message)"
                @edit="editRequest(message)"
              />
            </div>
            <ProcessingRow v-if="chatProcessing" />

            <!--
              The answer turn: the thought toggle reports how long the reasoning
              took and opens ONLY its own reasoning trail, which unfolds INSIDE
              the toggle's container (collapsed = hug-content pill, expanded =
              the same surface grown to the full column width). The answer
              itself — Summary, the body and the chart — is always visible and
              never collapses with the toggle.
            -->
            <template v-if="chatAnswered">
              <div class="chat__thought">
                <AssistantThoughtToggle
                  v-model:expanded="chatThoughtOpen"
                  :duration="data.demoAnswer.thoughtSeconds"
                >
                  <div class="d-flex flex-column ga-2">
                    <AssistantAccordion
                      v-for="step in reasoningSteps"
                      :key="step.id"
                      v-model="reasoningOpen[step.id]"
                      :title="step.title"
                      :items="step.items"
                    />
                  </div>
                </AssistantThoughtToggle>
              </div>
              <AssistantAnswer
                :answer="data.demoAnswer"
                @chart-menu="notify('Chart options')"
                @ref-click="onAnswerRef"
                @ref-hover="answerHighlightId = $event"
                @action="onAnswerAction"
              />
            </template>
          </template>
        </div>

        <!-- The anchor: everything above feeds this -->
        <div class="rail__composer pa-6 pt-0">
          <!--
            The composer's nested shell (Figma node 1105:146056 + the
            container-in-container revision). SuggestionsPanel owns the outer
            dark shell, the suggestions tab/list and the gold Level-2 ring;
            the composer content below is slotted into that inner ring, so
            the input logic (draft, send, mic, attach) stays in this screen.
            The field is `plain` so the ring — not Vuetify's outline — is the
            input's visible boundary; the accessible name is the aria-label.
          -->
          <SuggestionsPanel
            v-model:open="suggestionsOpen"
            :suggestions="data.composer.suggestions"
            @select="onSuggestion"
          >
            <!--
              One row by default: [attach] [draft] [mic|send]. When the draft no
              longer fits on a single line, `composer--stacked` gives the field
              its own full-width row ABOVE the actions. That is why the three
              parts are siblings of one wrapping flex row rather than a field
              stacked over an actions bar — the two states are the same DOM,
              re-flowed, so nothing remounts as you type.
            -->
            <div ref="composerRow" class="composer" :class="{ 'composer--stacked': composerStacked }">
              <AppButton variant="ghost" size="m" icon-only aria-label="Attach a document" @click="notify('Attach a document')">
                <template #icon><v-icon icon="plus" /></template>
              </AppButton>

              <!-- Enter sends, shift+Enter starts a new line — the chat convention. -->
              <v-textarea
                ref="composerField"
                v-model="draft"
                class="composer-input composer__field"
                :placeholder="data.composer.placeholder"
                :aria-label="`Ask ${brand.identity.shortName}`"
                variant="plain"
                name="question"
                autocomplete="off"
                rows="1"
                auto-grow
                max-rows="8"
                hide-details
                @keydown.enter.exact.prevent="send"
              />

              <!--
                Mic and send are one pair, so they carry their own 8px gap rather
                than the row's. All three actions are size m — one 40px box each —
                and the .rail__composer rule below rounds every icon-only button
                here to a circle, so size and radius match across the row.
              -->
              <div class="d-flex align-center ga-2">
                <AppButton variant="ghost" size="m" icon-only aria-label="Dictate your question" @click="notify('Listening…')">
                  <template #icon><v-icon icon="microphone" /></template>
                </AppButton>
                <AppButton class="composer-send" variant="primary" size="m" icon-only aria-label="Send question" :disabled="!draft.trim()" @click="send">
                  <template #icon><v-icon icon="send" /></template>
                </AppButton>
              </div>
            </div>
          </SuggestionsPanel>
        </div>
      </aside>
    </div>

    <!-- Per the house rule, toasts are per-screen — no app-wide snackbar. -->
    <v-snackbar v-model="snack.show" :color="snack.color" timeout="2600">
      {{ snack.text }}
    </v-snackbar>
  </v-app>
</template>

<style scoped>
/*
 * The workspace fills the viewport and never scrolls as a whole — the canvas is
 * fixed and only the rail's stack scrolls. dvh (not vh) so mobile browser chrome
 * doesn't clip the composer.
 */
.workspace {
  /* One source for the rail's width: .rail is sized with it and .rail-handle
     centers itself on the seam it defines. The live value is published by the
     screen as an inline style (the drag writes it) — this declaration is the
     fallback for any render before that binding applies, and must stay in step
     with RAIL_WIDTH.default in the script. FULLSCREEN ignores it: that state
     covers the workspace instead of occupying a column. */
  --rail-width: 504px;
  /* The fullscreen assistant's content column: everything (header, cards,
     analytics, composer) centers into this one measure, per the reference. */
  --assistant-content-max: 720px;
  /* Clearance under the top-left navbar before the column starts — used only
     on viewports too narrow to top-align the header beside the chip (see the
     1340px rule below): the chip occupies the top 24 + 56 px, so 88px of rail
     padding (plus the header's own py-6) keeps the column clear of it. On
     wide viewports the padding drops to 0 and the header shares the navbar's
     top row, per the reference. */
  --assistant-full-top: 88px;
  /* EXACT centre-line alignment of the fullscreen header with the navbar
     (≥1340px, where the two share a row). Measured, not approximated:
     the brand chip renders 62px tall starting at --chrome-inset (24px), so
     its centre sits at 55px; the header box is 88px (py-6 × 2 + a 40px
     size-m control), half of it 44px. 55 − 44 = 11px puts the two centres on
     the same line to the pixel — verified against both elements'
     getBoundingClientRect. If either element's height changes, re-measure
     and retune HERE (single source). */
  --assistant-header-top: 11px;
  /* Where the scrolling content starts under the absolute header:
     header bottom (11 + 88 = 99px) + the stack's usual 24px breathing room. */
  --assistant-content-top: 123px;
  position: relative; /* positioning context for the .rail-handle overlay */
  display: flex;
  height: 100dvh;
  overflow: hidden;
}

.canvas {
  /*
   * ONE source for how far every floating control sits from a canvas edge, and
   * ONE for the space between the stacked controls down the left. The canvas
   * itself is flush to the viewport, so the inset IS the screen padding on this
   * side; the rail matches it with its own 24px (px-6/py-6) padding.
   *
   *   row 2 (date scope) = inset + the 56px brand chip + gap
   *   row 3 (time rail)  = row 2 + a 32px size-s control + gap
   *
   * The rows are derived, not typed out, so retuning either variable moves the
   * whole stack. Only the two element heights are literals — they're the boxes
   * being measured, not spacing.
   *
   * The RIGHT column measures its own row 1. The toolbar there is 44px tall,
   * not the brand chip's 56px, so it can't share --chrome-row-2: doing that
   * spent the missing 12px as extra air and left a 36px gap above the zoom
   * stack. Its own row-2 keeps the gap honest at --chrome-gap-right.
   */
  --chrome-inset: 24px;
  --chrome-gap: 24px;
  --chrome-row-2: calc(var(--chrome-inset) + 56px + var(--chrome-gap));
  --chrome-row-3: calc(var(--chrome-row-2) + 32px + var(--chrome-gap));

  --chrome-toolbar-height: 44px; /* size-m icon button (40px) + the group's 2px padding, both edges */
  --chrome-gap-right: 16px;
  --chrome-row-2-right: calc(var(--chrome-inset) + var(--chrome-toolbar-height) + var(--chrome-gap-right));

  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  /*
   * The canvas lift: gray3 at the centre falling to page black. The centre stop
   * is held at 80% so it composites down onto the page black behind the canvas —
   * the original colour, eased off, rather than a different grey.
   *
   * This gradient also SETS THE DOT GRID'S CONTRAST. The grid is painted in the
   * background token at full alpha, so a dot is only visible where this wash has
   * lifted the canvas above it — soften this and the texture softens with it.
   * (The old `var(--Gray-3, …)` here was a Figma-export name that no theme
   * defines; it always fell through to its hex. Both stops are tokens now, and
   * gray3 IS that hex, so the colour is unchanged.)
   */
  background: radial-gradient(
    46.61% 109.78% at 51.61% 55.8%,
    rgba(var(--v-theme-gray3), 0.8) 0%,
    rgb(var(--v-theme-background)) 100%
  );
}

/* Pattern overlay for insight nodes — subtle noise texture */
.canvas--with-pattern::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image: url('/src/assets/nodePatternNoise.png');
  background-size: 200px 200px;
  background-repeat: repeat;
  opacity: 0;
  pointer-events: none;
  z-index: 1;
  mix-blend-mode: overlay;
}

/* Show pattern only over insight-colored areas — using a subtle grain effect */
.canvas--with-pattern::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image: radial-gradient(circle, rgba(244, 208, 63, 0.02) 1px, transparent 1px);
  background-size: 3px 3px;
  pointer-events: none;
  z-index: 0;
}

/* Every floating piece of canvas chrome sits on this layer. */
.chrome {
  position: absolute;
  z-index: 2;
}

/* The row holds the brand chip (Reset moved into the canvas toolbar). */
.chrome--brand-row { top: var(--chrome-inset); left: var(--chrome-inset); }

/*
 * Brand-chip dividers: v-divider's own currentColor border is dropped and the
 * line is drawn by a ::before instead — a 1px LEFT stroke carrying a vertical
 * white gradient (transparent → ~20% white mid → transparent), on a fully
 * transparent divider. --v-border-opacity stays 1 because .v-divider applies
 * it as the ELEMENT's opacity, which would dim the pseudo-element too. White
 * comes from the on-surface token (white in this theme), not a raw hex.
 * Geometry is untouched: same 0-width, full-height, stretch-positioned rail.
 */
.brand-divider {
  position: relative;
  /* Kill every channel v-divider can paint through — the ONLY visible line is
     the ::before below. `opacity` is pinned because .v-divider dims the whole
     element (pseudo included) by var(--v-border-opacity). */
  border: 0 !important;
  background: none !important;
  box-shadow: none !important;
  opacity: 1 !important;
  width: 0 !important;
  max-width: 0 !important;
}

.brand-divider::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 1px;
  pointer-events: none;
  background: linear-gradient(
    to bottom,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.2) 50%,
    rgba(255, 255, 255, 0) 100%
  );
}

.chrome--toolbar {
  top: var(--chrome-inset);
  right: var(--chrome-inset);
  background: rgb(var(--v-theme-background));
  border-radius: 8px;
  padding: 2px;
  gap: 2px;
}

.chrome--date {
  top: var(--chrome-row-2);
  left: var(--chrome-inset);
}

.chrome--zoom {
  top: var(--chrome-row-2-right);
  right: var(--chrome-inset);
  background: rgb(var(--v-theme-background));
  border-radius: 8px;
  padding-top: 2px;
  padding-bottom: 2px;
  gap: 2px;
}
.chrome--legend {
  right: var(--chrome-inset);
  bottom: var(--chrome-inset);
  width: 200px;
  /* Border and fill both come from .surface--card now — the house gradient edge,
     unlit at the top and lifting to surface-bright at the bottom. Only the inset
     rim lights are dropped: a bright band just inside the top and bottom edges,
     which is the pale outline that survived the first pass at this. */
  box-shadow: none;
}

/* ── Time rail ── */
.chrome--timeline {
  /* Row 3: one gap below the date control (see the derivation on .canvas). */
  top: var(--chrome-row-3);
  bottom: var(--chrome-inset);
  left: var(--chrome-inset);
  width: 120px;
  display: flex;
  flex-direction: column;
}

/*
 * Frosted-glass pane behind the rail: blurs the graph behind it so labels,
 * dots and handles stay readable, without an opaque fill. It's a dedicated
 * pseudo-element rather than a backdrop-filter inside .timeline__body — the
 * body's mask makes it a backdrop root, which would cut the blur off from the
 * canvas behind. Here the pane sits OUTSIDE the masked scroller and carries
 * its own copy of the fade, so the blur softens out at the same edges the
 * content does.
 */
.chrome--timeline::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: var(--radius-sm);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  mask-image: linear-gradient(
    to bottom,
    transparent 0,
    #000 9%,
    #000 91%,
    transparent 100%
  );
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0,
    #000 9%,
    #000 91%,
    transparent 100%
  );
}

/*
 * The rail's body: ruler column + histogram column, side by side.
 *
 * The fade mask sits on the two CONTENT columns rather than the whole body: a
 * mask (not an opacity-gradient overlay) because the canvas behind is a live
 * graph — an overlay would have to paint a color over it, and any color would
 * be wrong the moment the graph moved beneath it. The selection window is a
 * sibling of the masked track, so it and its handles stay crisp edge to edge.
 */
.timeline__body {
  position: relative;
  display: flex;
  gap: 4px;
  flex: 1 1 auto;
  min-height: 0;
  /*
   * Columns are CONTENT-sized, not stretched: every row below has a fixed
   * --timeline-hour height, so the ruler's total height is hours × slot. That
   * fixed total is what keeps the selection window's percentage math and
   * startDrag's height ÷ count mapping exact. If the rail is shorter than the
   * content, the rows keep their height and the body scrolls instead of
   * compressing.
   */
  align-items: flex-start;
  overflow-y: auto;
  /* Scrolling stays functional; the bar itself is hidden (plus the WebKit rule below). */
  scrollbar-width: none;
  /*
   * The rail's soft top/bottom fade, on the SCROLLER itself — a mask, not an
   * overlay, so it dims the rail's own pixels and never paints over the live
   * graph behind. On a scroll container the mask stays pinned to the visible
   * box, so the fade sits at the viewport edges even while the content
   * scrolls beneath it.
   */
  --timeline-fade: 9%;
  mask-image: linear-gradient(
    to bottom,
    transparent 0,
    #000 var(--timeline-fade),
    #000 calc(100% - var(--timeline-fade)),
    transparent 100%
  );
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0,
    #000 var(--timeline-fade),
    #000 calc(100% - var(--timeline-fade)),
    transparent 100%
  );
  /*
   * The rail's ONE geometry source. A cell is one 15-MINUTE interval (12px);
   * an hour block is four of them (:00 / :15 / :30 / :45), with the hour label
   * on the :00 major tick. Hour slots, ruler cells AND histogram rows all
   * derive from this pair, so the lanes cannot drift apart.
   */
  --timeline-cell: 24px;
  --timeline-hour: calc(var(--timeline-cell) * 4);
}

/* Hide the WebKit scrollbar; scrolling itself stays functional. */
.timeline__body::-webkit-scrollbar { display: none; }

/*
 * No fill behind the ruler — deliberately. This used to carry a 10% gray1
 * wash, which read as a pale column standing off the canvas. The rail sits on
 * the graph, so the only thing separating it from the canvas is the frosted
 * pane on .chrome--timeline::before: blur, no color. Don't reintroduce a
 * background here; any fixed color is wrong the moment the graph moves under it.
 */
.timeline__mask {
  border-radius: var(--radius-sm);
}

.timeline__ruler {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
}

.timeline {
  display: flex;
  flex-direction: column;
  list-style: none;
  padding: 0;
  margin: 0;
  position: relative;
}

/*
 * Every hour owns a FIXED hour-block slot — never `flex: 1`, so shrinking the
 * screen can't compress the rows into each other. The slot is what gives the
 * insight dots somewhere to live (a dot at 0.25 = a quarter of the way through
 * the hour) and what the selection window's percentages and startDrag's
 * height ÷ count mapping resolve against; all three stay in step because the
 * ruler's height is exactly hours × --timeline-hour.
 */
.timeline__item {
  position: relative;
  flex: 0 0 var(--timeline-hour);
  height: var(--timeline-hour);
}

/*
 * Period selection window — ONE continuous rounded rectangle spanning the
 * selected slots. Radius is the `sm` step (6px) from the shared scale. The
 * fill is a vertical gradient that brightens toward both ends, so the window
 * reads as a glass pane with lit edges rather than a flat tint. Whites come
 * from on-surface (white in dark theme) so a rebrand flows through.
 */
.timeline__selection {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(var(--selection-start));
  height: calc(var(--selection-end) - var(--selection-start));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.6);
  border-radius: var(--radius-sm);
  background: linear-gradient(
    to top,
    rgba(var(--v-theme-on-surface), 0.12) 0%,
    rgba(var(--v-theme-on-surface), 0.02) 3.2%,
    rgba(var(--v-theme-on-surface), 0.02) 96.7%,
    rgba(var(--v-theme-on-surface), 0.12) 100%
  );
  /* The band is a real drag target now: grab anywhere inside to move the
     whole window (the handles above it keep resizing start/end). */
  pointer-events: auto;
  cursor: grab;
  z-index: 2;
}

.timeline__selection--dragging {
  cursor: grabbing;
}

/*
 * Drag handles — slim pills centered on the window's top and bottom edges.
 * Real <button>s (keyboard-reachable, labelled), not decorative spans; the
 * parent window is pointer-events:none so only the handles take the pointer.
 */
.timeline__handle {
  appearance: none;
  border: 0;
  padding: 0;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: 24px;
  height: 5px;
  background: rgba(var(--v-theme-on-surface), 0.8);
  border-radius: var(--radius-full);
  backdrop-filter: blur(6px);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  cursor: ns-resize;
  z-index: 3;
  pointer-events: auto;
  transition: background-color 0.15s ease, box-shadow 0.15s ease;
}

.timeline__handle--start { top: -3px; }
.timeline__handle--end { bottom: -3px; }

.timeline__handle:hover,
.timeline__handle--dragging {
  background: rgb(var(--v-theme-on-surface));
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.timeline__handle:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

/*
 * Insight dots. The layer spans the whole hour slot and each dot is placed at
 * its own fraction of it (--at, set from the dataset), so several insights in
 * one hour stack down the slot as separate moments instead of sitting in a row.
 * The glow is the brand primary — the same warm tone the canvas draws insight
 * nodes with, so the rail and the graph agree on what "insight" looks like.
 */
.hour__insights {
  position: absolute;
  inset: 0 4px 0 auto;
  width: 8px;
  pointer-events: none;
}

.hour__insight-dot {
  position: absolute;
  right: 0;
  top: var(--at);
  transform: translateY(-50%);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: radial-gradient(
    circle at 50% 45%,
    rgb(var(--v-theme-on-surface)) 0%,
    rgb(var(--v-theme-primary)) 100%
  );
  display: block;
  box-shadow:
    0 0 4px rgba(var(--v-theme-primary), 0.95),
    0 0 10px rgba(var(--v-theme-primary), 0.6),
    0 0 18px rgba(var(--v-theme-primary), 0.28);
}

/*
 * A bare <button> carries UA chrome — a grey fill and a border that read as a
 * filled box on this dark canvas. Anything that must be a real button for
 * keyboard/AT reasons but should look like plain content gets this reset.
 */
.plain-button {
  appearance: none;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  touch-action: manipulation; /* no 300ms tap delay */
}

/*
 * Stripping the UA chrome must not strip the focus ring with it — these are the
 * only controls on the canvas that Vuetify isn't drawing for us.
 */
.plain-button:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/*
 * The hour button fills its slot and stacks the five ruler cells vertically.
 * It stays a real button — click scopes the canvas, double-click starts a
 * period — the ruler drawing is just its content.
 */
.hour {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  border-radius: var(--radius-sm);
  padding: 0 4px 0 2px;
  text-align: left;
}

/*
 * One fixed-height 15-minute cell — no flex growth. Four per hour: the major
 * cell (tick + hour label) then three minor quarter tick cells, together
 * filling the hour block exactly (4 × --timeline-cell = --timeline-hour).
 */
.hour__cell {
  flex: 0 0 var(--timeline-cell);
  height: var(--timeline-cell);
  display: flex;
  align-items: center;
  gap: 6px;
}

/*
 * Ruler ticks: 4px minors, 8px major beside the label. Inks step down from
 * on-surface so the ruler recedes behind the data (dots, selection, bars).
 */
.hour__tick {
  width: 4px;
  height: 2px;
  flex-shrink: 0;
  border-radius: var(--radius-full);
  background: rgba(var(--v-theme-on-surface), 0.1);
}

.hour__tick--major { width: 8px; }

.hour__label {
  color: rgba(var(--v-theme-on-surface), 0.4);
  white-space: nowrap;
  transition: color 0.15s ease;
}

.hour:hover .hour__label,
.hour:focus-visible .hour__label { color: rgba(var(--v-theme-on-surface), 0.7); }

/*
 * Hours inside the selected period lift toward white so the active window
 * reads in the labels as well as the selection pane; hours outside keep the
 * muted 0.4 gray. The label's existing color transition makes the change soft.
 * The --current rules come AFTER so the current hour stays the brightest even
 * when it is also inside the period (equal specificity — order decides).
 */
.hour--in-period .hour__label { color: rgba(var(--v-theme-on-surface), 0.85); }

.hour--current { background: rgba(var(--v-theme-primary), var(--v-activated-opacity)); }
.hour--current .hour__label { color: rgb(var(--v-theme-on-surface)); }

/* ── Activity histogram ── */
.timeline__histogram {
  flex: 0 0 30px;
  width: 30px;
  display: flex;
  flex-direction: column;
  /*
   * Horizontal fade: the lane's own mask, multiplying with the vertical edge
   * fade the scroller applies to everything. Bars emerge from ~35% opacity at
   * the ruler seam to full strength at their growing tips — a mask over the
   * lane's own pixels, never an overlay painted on the graph.
   */
  mask-image: linear-gradient(
    to right,
    rgba(0, 0, 0, 0.35) 0,
    #000 75%,
    #000 100%
  );
  -webkit-mask-image: linear-gradient(
    to right,
    rgba(0, 0, 0, 0.35) 0,
    #000 75%,
    #000 100%
  );
}

/*
 * One row per 15-MINUTE interval at the SAME fixed cell height as the ruler:
 * both lanes size from the one --timeline-cell variable and render four rows
 * per hour, so each .histo__row sits exactly beside its quarter cell — on any
 * screen height, because neither lane's rows can grow or shrink.
 *
 * `align-items: stretch` (not a percentage height on the bar) is what makes
 * the segment fill the row. The 1px padding is the seam that keeps
 * neighboring segments reading as stacked bars, not one strip.
 */
.histo__row {
  flex: 0 0 var(--timeline-cell);
  height: var(--timeline-cell);
  display: flex;
  align-items: stretch;
  padding: 1px 0;
}

/*
 * One SEGMENT per hour — a tall translucent block filling its slot, its width
 * scaled by the dataset's activity proportion (the data owns the ratio, the
 * CSS only draws it). Layered like the app's glass surfaces: a vertical
 * gradient fill, a hairline border, an inset top highlight for depth, and a
 * luminous pill on the growing tip. Hours inside the selected period take the
 * warm brand accent, echoing the selection window on the ruler.
 */
.histo__bar {
  position: relative;
  display: block;
  align-self: stretch;
  width: calc(6px + var(--activity) * 22px);
  /* Deliberate 2px one-off (user-specified) — below the DS radius scale. */
  border-radius: 2px;
  background: linear-gradient(
    180deg,
    rgba(var(--v-theme-on-surface), 0.1) 0%,
    rgba(var(--v-theme-on-surface), 0.04) 100%
  );
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  box-shadow:
    inset 0 1px 0 rgba(var(--v-theme-on-surface), 0.08),
    0 2px 6px rgba(0, 0, 0, 0.35);
  transition: width 0.15s ease, background-color 0.15s ease;
}

/* Luminous pill on the bar's growing tip. */
.histo__bar::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  right: -1px;
  width: 3px;
  border-radius: var(--radius-full);
  background: rgba(var(--v-theme-on-surface), 0.45);
  box-shadow: 0 0 4px rgba(var(--v-theme-on-surface), 0.25);
}

/* Selected-range segments: warm translucent amber with a glowing tip. */
.histo__bar--accent {
  background: linear-gradient(
    180deg,
    rgba(var(--v-theme-primary), 0.3) 0%,
    rgba(var(--v-theme-primary), 0.12) 100%
  );
  border-color: rgba(var(--v-theme-primary), 0.3);
  box-shadow:
    inset 0 1px 0 rgba(var(--v-theme-primary), 0.25),
    0 2px 8px rgba(0, 0, 0, 0.35);
}

.histo__bar--accent::after {
  background: rgb(var(--v-theme-primary));
  box-shadow:
    0 0 4px rgba(var(--v-theme-primary), 0.9),
    0 0 10px rgba(var(--v-theme-primary), 0.45);
}

/* ── Legend swatches: the mark vocabulary, drawn at 10px ── */
/* Padding is the utility on the element (the list pads itself now that the card
   is pa-0). The native <ul> margin-block is what made the list's top and bottom
   read wider than its sides, so it is zeroed here along with the bullets. */
.legend {
  list-style: none;
  margin: 0;
}

/* One size for every swatch shape; the line variants override the height only,
   so they get the same 12px run as the dots and rings get diameter. */
.swatch {
  --swatch-size: 12px;
  width: var(--swatch-size);
  height: var(--swatch-size);
  flex: 0 0 var(--swatch-size);
  color: currentcolor;
}

.swatch--dot { border-radius: 50%; background: currentcolor; }
.swatch--ring { border-radius: 50%; border: 1.5px solid currentcolor; }
.swatch--dashed-ring { border-radius: 50%; border: 1px dashed currentcolor; }
.swatch--line { height: 1px; background: currentcolor; }

.swatch--dotted-line {
  height: 0;
  border-top: 1px dotted currentcolor;
}

/* ── The rail ── */
.rail {
  display: flex;
  width: var(--rail-width);
  flex: 0 0 var(--rail-width);
  flex-direction: column;
  /* Width is the property all three states move through, so it is the one that
     animates: closed (0) ↔ open (--rail-width) ↔ fullscreen (inset:0). Dragging
     suppresses it — see .workspace--rail-dragging — because a transition on a
     value the pointer is already moving reads as lag. */
  transition:
    width 0.28s cubic-bezier(0.4, 0, 0.2, 1),
    flex-basis 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  /*
   * Lightest at the header, settling into the page background at the composer,
   * so the rail reads as one lit surface rather than a flat panel. Painted on
   * .rail (fixed height) rather than .rail__stack (the scrolling region), so the
   * gradient stays anchored to the sidebar while its content scrolls past.
   */
  background: linear-gradient(
    to bottom,
    rgb(var(--v-theme-surface-bright)),
    rgb(var(--v-theme-background))
  );
  /* NOT overflow:hidden — it clipped the send button's glow at the composer's
     edges. Scrolling is already confined to .rail__stack (its own
     overflow-y:auto), so the rail itself has nothing to clip; letting soft
     shadows breathe past its box costs nothing. */
  overflow: visible;
}

/*
 * CLOSED: zero width, and clipped so its content cannot spill into the canvas
 * on the way there. The element stays MOUNTED — that is what preserves the
 * assistant's content and scroll position across a close/reopen, and what gives
 * the width something to animate from.
 */
.rail--closed {
  width: 0;
  flex-basis: 0;
  overflow: hidden;
  pointer-events: none;
}

/* A drag owns the width outright; a transition on top of it reads as lag. */
.workspace--rail-dragging .rail,
.workspace--rail-dragging .rail-handle {
  transition: none;
}

/* Nothing on the page should select while a drag is in progress. */
.workspace--rail-dragging {
  user-select: none;
  cursor: col-resize;
}

/* The thought toggle hugs its content on the left, like the processing row it
   replaces — so the turn does not jump sideways when the answer arrives. */
.chat__thought {
  display: flex;
  justify-content: flex-start;
}

/* ── THE RAIL AT REST ─────────────────────────────────────────────────── */
.rail-summary__body {
  color: rgba(var(--v-theme-button-white-80));
  margin: 0;
}

/*
 * ── THE DASHBOARD BLOCK, BOTTOM-WEIGHTED ──────────────────────────────────
 * `margin-top: auto` in the stack's flex column drives the whole composition:
 * the header stays at the top, the slack collects in the middle, and the
 * summary + counts settle just above the composer. The stack's own `pb-6`
 * keeps a comfortable gap so the content never touches it.
 */
.rail-dashboard {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  /* Summary → counts: one step tighter than the stack's own rhythm, so the
     pair reads as one block rather than two sections. */
  gap: 12px;
}

.rail-kpis {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  /* Three to a row while the rail is wide enough; wraps rather than squeezing
     when it is not (narrow rail, or a longer count). */
  flex-wrap: wrap;
  gap: 8px;
}

/*
 * The count chip: the same pill treatment SourceChip uses — `gray2` hairline
 * on a `gray4` ground — so the rail's chips and the assistant's chips read as
 * one family. Hug-content by construction (inline-flex, no width), and a real
 * <button>, which is why it carries a focus ring.
 */
.rail-kpi-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  border: 1px solid rgb(var(--v-theme-gray2));
  background: rgb(var(--v-theme-gray4));
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.rail-kpi-chip:hover,
.rail-kpi-chip:focus-visible {
  border-color: rgba(var(--v-theme-button-gray-w-40));
  background: rgba(var(--v-theme-button-gray-w-10));
}

.rail-kpi-chip:focus-visible {
  outline: 2px solid rgba(var(--v-theme-button-white-100), 0.3);
  outline-offset: 2px;
}

/* The KPI mark, leading the chip — the SAME icon the cards carried (the key
   still comes from the dataset), just at chip scale. `align-items: center` on
   the chip centres it against the type. */
.rail-kpi-chip__icon {
  color: rgb(var(--v-theme-primary));
  flex-shrink: 0;
}

/* The figure leads; the label is its caption. */
.rail-kpi-chip__value { color: rgba(var(--v-theme-button-white-100)); }
.rail-kpi-chip__label { color: rgba(var(--v-theme-button-white-60)); }

@media (prefers-reduced-motion: reduce) {
  .rail-kpi-chip { transition: none; }
}

/* A sent message hugs the right of the chat column, per the reference. */
.chat__request {
  display: flex;
  justify-content: flex-end;
}

/* Only this region scrolls. */
.rail__stack {
  flex: 1 1 auto;
  overflow-y: auto;
}

/*
 * FULLSCREEN: the scrollbar UI is hidden, the SCROLLING is not.
 *
 * `overflow-y: auto` above is untouched — wheel, trackpad, touch and keyboard
 * all still scroll the stack; only the visible bar is suppressed. In the
 * fullscreen assistant the content is a centred column with wide empty margins,
 * and a bar pinned to the far viewport edge reads as chrome belonging to the
 * page rather than to the column it scrolls. The normal sidebar keeps its
 * scrollbar, where it sits right beside the content and does orient the reader.
 *
 * Three declarations because no single one covers the field: `scrollbar-width`
 * is the standard (Firefox and modern Chromium), `-ms-overflow-style` covers
 * legacy Edge/IE, and the `::-webkit-scrollbar` pseudo-element covers Safari
 * and older Chromium.
 */
.rail--fullscreen .rail__stack {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.rail--fullscreen .rail__stack::-webkit-scrollbar {
  display: none;
}

/*
 * Cards must keep their natural height and let the STACK scroll. Without this
 * they shrink instead: a flex item's automatic min-height only protects content
 * when the item's overflow is visible, and v-card sets overflow:hidden — so the
 * cards silently clipped their own contents (the avatars row, the bar chart)
 * rather than making the rail scroll.
 */
.rail__stack > * { flex-shrink: 0; }

.rail__header { flex: 0 0 auto; }

/*
 * The conversation-switcher button reads as a title, so its content is
 * left-aligned (AppButton centers by default) with the chevron pushed to the
 * right edge by the growing title span. min-width lets the title truncate
 * instead of widening the header.
 */
.rail__conversation-btn { min-width: 0; }
.rail__conversation-btn :deep(.app-button__content) { justify-content: flex-start; }
.rail__conversation-title { min-width: 0; }

/*
 * Memory-growth card divider — the same recipe as .notifications-card__divider:
 * a 1px line carrying a horizontal gray gradient (transparent → 20% gray1 at
 * center → transparent), full card width (the card is pa-0, sections pad
 * themselves). No solid border; the gradient paints on the element's 1px body.
 */
/*
 * Memory-growth KPI cards (Figma spec): a plain vertical flex card — no sheet
 * surface — with fixed 185px width and asymmetric padding from the spec.
 */
.kpi-card {
  position: relative; /* anchors the right-edge divider */
  display: flex;
  width: 185px;
  padding: 12px 24px 12px 16px;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  gap: 8px;
}

/* Label header: full-width quiet strip on the gray-w-10 token. */
.kpi-card__header {
  display: flex;
  padding: 2px 4px 2px 7px;
  justify-content: space-between;
  align-items: center;
  align-self: stretch;
  border-radius: 3px;
  background: rgba(var(--v-theme-button-gray-w-10));
}

/* Value: white, 24px on the title-large base (the MD3 scale has no 24px/500 step). */
.kpi-card__value {
  font-size: 24px;
  color: rgb(var(--v-theme-button-white-100));
}

/*
 * The meter donut. The disc behind the ring falls from the page background at
 * the top to primary-darken-1 at the bottom — the deepest tone of the gold
 * family — so the container reads as lit from below by the arc it carries. Both
 * ends are theme tokens, so a rebrand takes the disc with it.
 */
.meter__donut {
  background: linear-gradient(
    180deg,
    rgb(var(--v-theme-background)) 0%,
    rgb(var(--v-theme-primary-darken-1)) 100%
  );
  border-radius: 50%;
}

/*
 * The track is hidden rather than recoloured: the disc beneath it is already that
 * exact colour, so drawing it again could only introduce a seam.
 */
.meter__donut :deep(.v-progress-circular__underlay) {
  stroke: transparent;
}

/*
 * The value arc is stroked with the gradient defined in the template, not the
 * flat `color` prop — the same gold throughout, ramping from 60% opacity at the
 * top of the ring to full at the bottom. The prop stays on the component: it
 * still colours the icon slot's inherited text and is the fallback if the def
 * ever fails to resolve.
 */
.meter__donut :deep(.v-progress-circular__overlay) {
  stroke: url(#meter-arc);
}

/*
 * One colour, two opacities: primary at 60% where the ring starts, full at the
 * bottom. Fading the token rather than crossing to a second hue keeps the arc
 * unambiguously one value — the disc behind it supplies the darkening.
 */
.meter__stop--from {
  stop-color: rgb(var(--v-theme-primary));
  stop-opacity: 0.6;
}

.meter__stop--to {
  stop-color: rgb(var(--v-theme-primary));
  stop-opacity: 1;
}

/* Takes no space and shows nothing; it exists only to carry <defs>. */
.meter__defs {
  position: absolute;
  width: 0;
  height: 0;
}

/* Splitter on the right edge of every card but the last (see the AppSeam in the
   template). Absolute, so the row's gap stays between the cards themselves. */
.kpi-card__seam {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
}

/*
 * The trend badge, two states off the existing status tokens: success for a
 * positive delta, error for a negative one — text/icon in the status color on
 * a 10% tint of the same token. 2px radius per the spec (deliberately below
 * the radius scale's smallest step).
 */
.kpi-trend {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 4px;
  border-radius: 2px;
}

.kpi-trend--up {
  color: rgb(var(--v-theme-success));
  background: rgba(var(--v-theme-success), 0.10);
}

.kpi-trend--down {
  color: rgb(var(--v-theme-error));
  background: rgba(var(--v-theme-error), 0.10);
}

/*
 * Conversation dropdown — selected row. Hover / focus / pressed come from
 * v-list-item's built-in theme states; only "selected" is custom, styled once
 * off the --active class (never per item) with existing button-surface tokens.
 */
.conversation-menu :deep(.v-list-item--active) {
  color: rgb(var(--v-theme-button-white-100));
  background: rgba(var(--v-theme-button-gray-w-20));
}

/* Custom selected look → drop the default tinted overlay so they don't stack. */
.conversation-menu :deep(.v-list-item--active .v-list-item__overlay) { opacity: 0; }

/*
 * The composer sits on the bottom edge of a full-bleed layout, so it has to
 * clear the home indicator on notched devices.
 */
.rail__composer {
  flex: 0 0 auto;
  /* 24 to match the rail's other edges; a taller safe area still wins. */
  padding-bottom: max(24px, env(safe-area-inset-bottom));
}

/* The composer's nested glass shell lives in SuggestionsPanel.vue now. */

/*
 * The field is chrome-less inside the shell: `plain` already drops the
 * outline/underline/fill; this sizes the text itself (body-large with a
 * roomier line-height) and kills the plain variant's opacity dimming so
 * the draft reads white/light-gray at full strength.
 */
/* The inner shell lays out with align-items: flex-start, so the field must
   opt into filling it. */
/*
 * The composer row. Default: [attach] [field] [mic|send] on one line, the field
 * taking the slack. When the draft needs a second line, .composer--stacked gives
 * the field a full-width basis and `order: -1` lifts it ABOVE the actions, which
 * then wrap onto the row below — space-between pinning attach left and the
 * mic/send pair right. Both states are the same three elements, only re-flowed.
 */
.composer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  /*
   * No COLUMN gap: the horizontal separation between the draft and the actions
   * is the field's own 8px inline padding (see .composer-input :deep(.v-field)).
   * Owning it there rather than here is what gives the draft a left/right inset
   * once it wraps to its own full-width row — a gap would collapse against the
   * shell edge and leave the text flush with it.
   *
   * The ROW gap survives: it is the vertical space between the draft's row and
   * the actions' row in the stacked state.
   */
  column-gap: 0;
  row-gap: 8px;
  width: 100%;
}

/* min-width:0 lets the field shrink below its content width instead of
   pushing the actions out of the row. */
.composer__field {
  flex: 1 1 0;
  min-width: 0;
  width: auto;
}

.composer--stacked .composer__field {
  order: -1;
  flex-basis: 100%;
}

.composer-input :deep(textarea) {
  font-size: 1rem;
  line-height: 1.5;
  color: rgba(var(--v-theme-button-white-80));
  /* No visible scrollbar once auto-grow hits max-rows; scrolling still works. */
  scrollbar-width: none;
}

.composer-input :deep(textarea)::-webkit-scrollbar {
  display: none;
}

.composer-input :deep(.v-field__input) { opacity: 1; }

/*
 * Top spacing above the draft belongs to the gold shell alone
 * (.suggestions__inner's 16px padding-top in SuggestionsPanel.vue).
 *
 * Vuetify's plain field would otherwise stack its own padding on top of that:
 * .v-field__input takes padding-top: var(--v-field-input-padding-top), which is
 * calc(--v-field-padding-top + --v-input-padding-top) = 4px + 16px at default
 * density — pushing the text ~36px below the ring. Zeroing both inputs to that
 * calc leaves the shell's 16px as the only top spacing.
 *
 * Set on .v-field, not on the root: Vuetify declares --v-field-padding-top on
 * .v-field itself, and an element's own declaration beats an inherited one, so
 * a value set higher up would never reach the calc.
 *
 * Bottom spacing is untouched — it reads --v-field-padding-bottom instead.
 */
.composer-input :deep(.v-field) {
  --v-field-padding-top: 0px;
  --v-input-padding-top: 0px;
  --v-field-padding-bottom: 0px;

  /*
   * 8px inline padding is the ONLY horizontal spacing around the draft — the row
   * sets no column gap, so this is what separates the text from the attach and
   * mic buttons, and what insets it from the shell edge once it wraps to its own
   * full-width row. Vuetify's own 16px default is replaced rather than added to.
   *
   * The 48px control height goes entirely: the textarea stretches to fill it, so
   * min-height falls back to 1.5rem — exactly one line — and the field becomes
   * the height of its text, which `align-items: center` on .composer then
   * centres against the 40px action buttons.
   */
  --v-field-padding-start: 8px;
  --v-field-padding-end: 8px;
  --v-input-control-height: 0px;
}

/*
 * The composer's icon-only actions (attach, dictate) are round, matching the
 * send button beside them. The radius is what shapes the ghost variant's
 * pressed fill AND its focus outline — at the size default (8px) both read as
 * rounded squares around a round icon, which is the mismatch this fixes.
 *
 * This is the ONE place the row's shape is decided: send included (its own rule
 * below no longer sets a radius), so all three stay the same shape from a
 * single edit. Switch to var(--radius-md) here to make the row rounded squares.
 */
.rail__composer .app-button--icon-only {
  border-radius: 50%;
}

/*
 * The send action: circular, warm gold/beige, softly glowing. Overrides
 * AppButton's primary skin with the existing outlined-accent gradient pair;
 * the descendant selector outranks AppButton's own single-class rules, and
 * the disabled state still wins via AppButton's !important rules.
 *
 * The skin has to be overridden WHOLE, not partly. Two leftovers from the
 * primary variant used to paint pale arcs at the top and bottom of the circle:
 * its 1px border (only recoloured to transparent, so the edge was still there)
 * and its 24px backdrop blur — invisible under an opaque gradient, but it
 * promotes the button to its own composited layer whose rounded clip
 * antialiases separately from the background, fringing hardest where a circle's
 * curve is flattest. Both are dropped here.
 */
.rail__composer .composer-send {
  /* Shape comes from the icon-only rule above — the whole row moves together. */
  border: none;
  backdrop-filter: none;
  background: linear-gradient(
    180deg,
    rgb(var(--v-theme-button-outlined-accent-1)) 0%,
    rgb(var(--v-theme-button-outlined-accent-2)) 100%
  );
  box-shadow:
    0 0 16px 0 rgba(var(--v-theme-button-outlined-accent-1), 0.35),
    0 0 12px 0 rgba(var(--v-theme-button-black-b-40));
}

.rail__composer .composer-send:hover:not(:disabled) {
  background: linear-gradient(
    180deg,
    rgb(var(--v-theme-button-outlined-accent-1)) 0%,
    rgb(var(--v-theme-button-outlined-accent-1)) 100%
  );
  border: none;
  box-shadow:
    0 0 20px 0 rgba(var(--v-theme-button-outlined-accent-1), 0.5),
    0 0 12px 0 rgba(var(--v-theme-button-black-b-40));
}

/*
 * Stacked source avatars, overlapped by a fixed step. The subtle black ring
 * separates each logo from the one it overlaps — existing button token, no
 * new hex.
 */
/*
 * The sources card's LEFT container. It owns its 16px padding (the card is
 * pa-0), so it can carry the decorative pattern full-bleed to the card's left
 * edge. The asset URL is bound in the template so Vite resolves/fingerprints
 * it; only the painting rules live here. pattern.svg is a 448×208 scene rather
 * than a seamless tile, so it's covered and centred, not repeated.
 * `border-radius: inherit` follows whatever radius the card resolves to (its
 * `rounded` default and .surface--card both have a say) — squared on the right
 * so the pattern stops square at the seam with the text container.
 */
.sources-card__facts {
  /* 88px of content (the widest row is the avatar stack) inside the 16px pads */
  width: 120px;
  border-radius: inherit;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

.avatars .v-avatar + .v-avatar { margin-left: -8px; }
.avatars .v-avatar { border: 1px solid rgba(var(--v-theme-button-black-b-40)); }

/* Figures that sit in a row must not jitter as their digits change. */
.tabular { font-variant-numeric: tabular-nums; }

/*
 * The handle is an ABSOLUTE OVERLAY on the workspace (its positioning
 * context), floating on top of the left edge of the assistant rail:
 * vertically centered, horizontally centered on the canvas/rail seam
 * (`--rail-width` — the same value .rail is sized with). It takes no row
 * width, sits above both panes, and nothing clips it. When the rail is
 * closed it docks at the right edge so the rail can always be reopened.
 */
/* The 2px seam sits just outside the rail, so the handle's centre is the rail
   width plus half the seam — otherwise the chevrons ride 1px off the line. */
/*
 * Centred ON the seam, in both axes.
 *
 * Horizontally: the seam is a 2px rule sitting just outside the rail, so its
 * centre line is `--rail-width + 1px` from the right edge. `right` puts the
 * handle's RIGHT EDGE there and `translate(50%)` pulls it back by half its own
 * width, landing its centre exactly on that line.
 *
 * ⚠️ Because that correction is a PERCENTAGE OF THE BOX'S OWN WIDTH, anything
 * that changes the box width moves the control off the seam. A padded hit area
 * did exactly that — +12px of padding put the chevrons 6px right of the line.
 * Widen the grip with the pseudo-element below, never with padding here.
 *
 * Vertically: flex centring, not the default block flow. The toggle inside is
 * `inline-flex`, so in a block box it sits on a text baseline and the line-box
 * descender pushed it 3px above centre.
 */
.rail-handle {
  position: absolute;
  z-index: 10;
  top: 50%;
  right: calc(var(--rail-width) + 1px);
  transform: translate(50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  /* Rides the rail edge as it opens/closes, in step with .rail's own width. */
  transition: right 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}

/*
 * In the OPEN state the handle is also the resize grip. The cursor is the whole
 * affordance — the control itself does not change shape, so the seam stays one
 * consistent object across all three states.
 */
.rail-handle--resizable {
  cursor: col-resize;
  touch-action: none; /* pointermove must not scroll the page mid-drag */
}

/*
 * The grip's hit area: a transparent pseudo-element bled outward, so the target
 * is comfortable to catch WITHOUT changing the handle's box (see the warning
 * above). Painted behind the chevrons so it never intercepts their clicks —
 * pointer events on it still target .rail-handle, which is what the drag needs.
 */
.rail-handle--resizable::before {
  content: '';
  position: absolute;
  inset: -8px -10px;
  z-index: -1;
}

.rail-handle--resizable:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 3px;
  border-radius: var(--radius-xs);
}

.rail-handle--closed {
  right: 8px;
  transform: translateY(-50%);
}

/*
 * ── FULLSCREEN ASSISTANT — the rail's EXPANDED state (≥ 960px) ─────────────
 *
 * Per the reference: the open assistant is not a side rail but a full-screen
 * workspace. The aside covers the whole viewport-sized .workspace (its opaque
 * surface gradient visually covers the graph, which keeps rendering behind),
 * while the CONTENT does not stretch — header, cards, analytics and the
 * composer all narrow to one centered `--assistant-content-max` column with
 * generous empty space either side.
 *
 * The pieces around it are restyled through `workspace--assistant-full`:
 * - the top-left Osaka navbar (brand chip) stays visible in its own corner —
 *   it is z-lifted above the rail (`.canvas` creates no stacking context, so
 *   the chip's z-index competes in the workspace's root context);
 * - the collapse/expand handle hugs the right viewport edge, exactly like its
 *   collapsed position, so the control lives in one place in both states;
 * - the canvas/rail seam has no boundary left to mark, so it is hidden.
 *
 * Scoped to ≥960px: below that the existing stacked responsive layout (canvas
 * over rail, both scrolling as one page) is preserved unchanged.
 */
@media (min-width: 960px) {
  .rail--fullscreen {
    position: absolute;
    inset: 0;
    width: auto;
    flex: none;
    z-index: 3; /* above the canvas chrome (z 2), below the brand chip (z 4) */
    padding-top: var(--assistant-full-top);
  }

  /* The centered content column. The three direct regions keep their own
     internal layout and paddings — they are only narrowed and centered, so
     nothing inside stretches to viewport width. */
  .rail--fullscreen .rail__header,
  .rail--fullscreen .rail__stack,
  .rail--fullscreen .rail__composer {
    width: 100%;
    max-width: var(--assistant-content-max);
    margin-inline: auto;
  }

  .workspace--assistant-full .chrome--brand-row { z-index: 4; }

  /*
   * TOP-ALIGN the header with the navbar (the reference's fullscreen layout):
   * with the rail's clearance padding removed, the header's own py-6 (24px)
   * equals --chrome-inset, so "New chat" and the Osaka chip start on the same
   * horizontal row. The centered column and its max-width are untouched — only
   * the vertical offset goes — and the docked/open header never had the
   * padding, so it is unaffected.
   *
   * Gated at 1340px, DERIVED not chosen: the navbar ends at x ≈ 282 and the
   * 720px column's left edge is (viewport − 720) / 2, which clears the chip by
   * the 24px inset only once the viewport reaches ≈ 1332px. Below that the
   * two would collide on one row, so the narrow fallback keeps the
   * --assistant-full-top clearance instead.
   */
  @media (min-width: 1340px) {
    .rail--fullscreen { padding-top: 0; }

    /*
     * The header is its OWN LAYER, out of the column flow: absolutely
     * positioned at --assistant-header-top so its vertical CENTRE equals the
     * navbar's centre line (see the token's derivation), horizontally centred
     * on the same --assistant-content-max column as the rest of the content
     * (left 50% + translateX, which outranks the flow rules' margin-inline).
     * Because it no longer participates in the flex column, the cards can
     * neither push it down nor carry it along when .rail__stack scrolls.
     */
    .rail--fullscreen .rail__header {
      position: absolute;
      top: var(--assistant-header-top);
      left: 50%;
      transform: translateX(-50%);
      z-index: 1;
    }

    /* The content starts BELOW the absolute header's reserved band — without
       this the stack would rise into the space the header left in the flow. */
    .rail--fullscreen .rail__stack {
      margin-top: var(--assistant-content-top);
    }
  }

  /*
   * FULLSCREEN: the handle moves to the rail's LEFT edge.
   *
   * There is no canvas/rail seam left to straddle — the rail IS the workspace —
   * so the handle marks the edge the rail would collapse back toward, which is
   * also the side the eye reads as "give the graph its room back". `right: auto`
   * is required: the base rule sets `right` from --rail-width, and leaving both
   * offsets set would stretch the box between them.
   */
  .workspace--assistant-full .rail-handle {
    left: 8px;
    right: auto;
    transform: translateY(-50%);
  }

  .workspace--assistant-full .workspace__seam { display: none; }
}

/*
 * Below md the rail stops being a column and becomes the lower half of the
 * screen: the canvas keeps its own height, and the two scroll as one page.
 */
@media (max-width: 959px) {
  .workspace {
    height: auto;
    flex-direction: column;
    overflow: visible;
  }

  .canvas { height: 62dvh; }

  .rail {
    width: 100%;
    flex: 1 1 auto;
  }

  .rail__stack { overflow-y: visible; }
  .rail-handle { display: none; }
  /* The boundary turns horizontal here and the handle is gone, so a vertical
     seam has nothing left to mark. */
  .workspace__seam { display: none; }
}

/*
 * Tablet/small laptop: hide timeline on smaller screens to save space.
 */
@media (max-width: 799px) {
  .chrome--timeline { display: none; }
}

/*
 * Phone: the canvas chrome is absolutely positioned, so at this width the
 * toolbar lands on top of the brand chip. Stack them instead — brand, then
 * toolbar, then the date scope — and let the toolbar wrap rather than overflow.
 */
@media (max-width: 599px) {
  /*
   * Stacked tops stay relative to the shared inset (the chip is allowed to
   * wrap here, so these are the phone rhythm rather than the desktop rows).
   */
  .chrome--toolbar {
    top: calc(var(--chrome-inset) + 68px);
    right: var(--chrome-inset);
    left: var(--chrome-inset);
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .chrome--date { top: calc(var(--chrome-inset) + 132px); }
  .chrome--zoom { top: calc(var(--chrome-inset) + 132px); }
  .chrome--legend { width: 168px; }
}

@media (prefers-reduced-motion: reduce) {
  .histo__bar,
  .hour__label,
  .timeline__handle { transition: none; }
}
</style>
