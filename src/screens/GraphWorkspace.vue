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
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { BarChart, useChartTheme, withAlpha } from '@/components/charts'
import NetworkGraphD3 from '@/components/graphs/NetworkGraphD3.vue'
import AppButton from '@/components/AppButton.vue'
import AssistantRailToggle from '@/components/AssistantRailToggle.vue'
import AppTabSegments from '@/components/AppTabSegments.vue'
import ProfileMenu from '@/components/ProfileMenu.vue'
import SuggestionsPanel from '@/components/SuggestionsPanel.vue'
import NotificationsMenu from '@/components/NotificationsMenu.vue'
import { brand } from '@/data/brand'
import { graphWorkspace, type TimelineHour } from '@/data/graphWorkspace'
import logoUrl from '@/assets/Osakalogo.svg'

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
const legendOpen = ref(true)
const railOpen = ref(true)
const zoom = ref(1)
/** Which hour of the time rail the canvas is scoped to. */
const currentHour = ref(data.timeline.findIndex(h => h.current))
/** Period selection: start and end hour indices. Initialized to default. */
// Initial selection: 02 PM → 07 PM (slot indices 1–5; the window's bottom edge
// sits on end+1's hour line). Temporarily overrides data.defaultPeriod.
const selectedPeriod = ref<{ start: number, end: number } | null>({ start: 1, end: 5 })
/** Track which handle is being dragged. */
const draggingHandle = ref<'start' | 'end' | null>(null)
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

/** A suggestion row was picked — confirm in the toast until the flow is built. */
function onSuggestion(id: string) {
  const picked = data.composer.suggestions.find(s => s.id === id)
  if (picked) notify(`Suggestion: “${picked.text}”`)
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

// ── Derived view data ─────────────────────────────────────────────────────
const insightCount = computed(() => filteredNodes.value.filter(n => n.kind === 'insight').length)
const sourceCount = computed(() => filteredNodes.value.filter(n => n.kind === 'source').length)
const sentimentMeter = computed(() => data.meters.find(m => m.id === 'sentiment'))

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

const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`)

function handleClusterClick(nodeId: string) {
  selectedCluster.value = nodeId
  notify(`Navigating to ${nodeId}…`)
  // Navigate to cluster details screen
  // TODO: Replace with actual route when screen is built
  setTimeout(() => {
    notify(`Cluster ${nodeId} details view (screen not yet built)`, 'info')
  }, 1000)
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

function send() {
  if (!draft.value.trim()) return
  notify('Question sent to Osaka')
  draft.value = ''
}
</script>

<template>
  <v-app>
    <div class="workspace">
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
          :sentiment-percent="sentimentMeter?.ratio ? sentimentMeter.ratio * 100 : undefined"
          :sentiment-label="sentimentMeter?.label"
          @cluster-click="handleClusterClick"
          @viewport-change="viewportChanged = !$event"
        />
        <!-- The canvas summary in text, for keyboard and screen-reader users. -->
        <p class="d-sr-only">{{ graphSummary }}</p>

        <!-- Brand chip + Reset — float together at the top-left, 16px apart -->
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
            Figma: 1px full-height dividers between the brand block, profile and
            notifications. v-divider's --vertical class carries align-self:
            stretch, so each spans the chip's height with no fixed px. Color is
            the existing Gray/4 theme token (the Figma divider hex), applied
            through v-divider's own border CSS variables — see .brand-divider.
          -->
          <v-divider class="brand-divider" vertical />
          <div class="d-flex align-center px-3 py-2">
          <ProfileMenu
            :user="data.user"
            @settings="notify('Settings opened')"
            @help="notify('Help Center opened')"
            @logout="notify('Signed out')"
          />
          </div>
          <v-divider class="brand-divider" vertical />
          <div class="d-flex align-center px-3 py-2">
          <NotificationsMenu
            :notifications="data.notifications"
            @show-all="notify('All notifications opened')"
            @overflow="notify('Notification options opened')"
          />
          </div>
        </v-sheet>
        <AppButton v-if="viewportChanged" variant="secondary" size="m" @click="resetGraphView">
          <template #icon><v-icon icon="refresh" /></template>
          Reset
        </AppButton>
        </div>

        <!-- Canvas toolbar -->
        <div class="chrome chrome--toolbar d-flex align-center">
          <AppButton variant="secondary" size="m" icon-only aria-label="Search the graph" @click="notify('Graph search opened')">
            <template #icon><v-icon icon="search" /></template>
          </AppButton>
          <AppButton variant="secondary" size="m" icon-only aria-label="Filter what the canvas shows" @click="notify('Filters opened')">
            <template #icon><v-icon icon="filter" /></template>
          </AppButton>

          <AppButton variant="primary" size="m" @click="notify('Analyzing the current view…')">
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
                        'hour--in-period': selectedPeriod && i >= selectedPeriod.start && i <= selectedPeriod.end,
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
                Period selection window — derived from selectedPeriod (whole hour
                slots: start's top edge to end's bottom edge, hence the +1),
                never a fixed pixel box. The two handles are the REAL drag
                targets, wired to the same startDrag as before.
              -->
              <div
                v-if="selectedPeriod"
                class="timeline__selection"
                :style="{
                  '--selection-start': `${(selectedPeriod.start / data.timeline.length) * 100}%`,
                  '--selection-end': `${((selectedPeriod.end + 1) / data.timeline.length) * 100}%`,
                }"
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
                    :class="{ 'histo__bar--accent': selectedPeriod && i >= selectedPeriod.start && i <= selectedPeriod.end }"
                    :style="{ '--activity': quarterActivity(hour, q - 1) }"
                  />
                </div>
              </template>
            </div>
          </div>

        </nav>

        <!-- Legend — the key to what is a fact and what Osaka inferred -->
        <v-card class="chrome chrome--legend pa-3 surface--legend">
          <button
            class="plain-button d-flex align-center justify-space-between w-100 mb-1"
            type="button"
            :aria-expanded="legendOpen"
            @click="legendOpen = !legendOpen"
          >
            <span class="text-title-small font-weight-medium">Legend</span>
            <v-icon :icon="legendOpen ? 'collapse' : 'expand'" size="small" />
          </button>
          <v-expand-transition>
            <ul v-show="legendOpen" class="legend">
              <li v-for="entry in data.legend" :key="entry.id" class="d-flex align-center ga-3 py-1">
                <span
                  :class="`swatch swatch--${entry.shape}`"
                  :style="{ color: legendColor(entry.ink) }"
                />
                <span class="text-body-small text-medium-emphasis">{{ entry.label }}</span>
              </li>
            </ul>
          </v-expand-transition>
        </v-card>
      </section>

      <!-- Rail collapse handle — glass two-chevron control; state stays here.
           An absolute overlay on the workspace: centered on the canvas/rail
           seam while the rail is open, hugging the right edge when closed so
           the rail can always be reopened. -->
      <div class="rail-handle" :class="{ 'rail-handle--closed': !railOpen }">
        <AssistantRailToggle
          :open="railOpen"
          @collapse="railOpen = false"
          @expand="railOpen = true"
        />
      </div>

      <!-- ── THE ASSISTANT RAIL ─────────────────────────────────────── -->
      <aside v-if="railOpen" class="rail bg-surface-bright" aria-label="Osaka assistant">
        <header class="rail__header d-flex align-center ga-2 py-6 px-6">
          <AppButton variant="primary" size="m" icon-only aria-label="Conversation history" @click="notify('Conversation history opened')">
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
                class="rail__conversation-btn text-title-medium flex-grow-1"
              >
                <!-- No flex-grow: the title hugs its text so the chevron sits right beside it -->
                <span class="rail__conversation-title text-left text-truncate">{{ activeConversation.title }}</span>
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

        <div class="rail__stack px-6 pb-6 pt-0 d-flex flex-column ga-4">
          <!--
            What Osaka just noticed. It is model output, so it states its
            confidence and what it read — never a bare claim.
          -->
          <v-card class="pa-4 surface--card">
            <div class="d-flex align-center ga-4">
              <div class="text-left" style="width: 56px">
                <img :src="logoUrl" alt="" width="28" height="28">
                <div class="text-label-small text-medium-emphasis mt-1">{{ data.insightPrompt.kind }}</div>
              </div>
              <div class="flex-grow-1">
                <p class="text-body-medium">{{ data.insightPrompt.body }}</p>
                <!-- <p class="text-label-small text-medium-emphasis mt-2">
                  {{ Math.round(data.insightPrompt.confidence * 100) }}% confidence · from {{ data.insightPrompt.derivedFrom }}
                </p> -->
              </div>
              <AppButton variant="primary" size="s" @click="notify('Opening the reasoning behind this insight')">
                {{ data.insightPrompt.action }}
              </AppButton>
            </div>
          </v-card>

          <!-- What Osaka can see -->
          <v-card class="pa-4 surface--card">
            <div class="d-flex ga-4 align-start">
              <div class="flex-shrink-0" style="width: 88px">
                <div class="text-label-small text-medium-emphasis">Connected</div>
                <div class="text-headline-small tabular">
                  {{ data.sources.connected }}<span class="text-medium-emphasis text-title-medium"> / {{ data.sources.total }}</span>
                </div>
                <div class="d-flex avatars mt-3" role="list" :aria-label="`Connected: ${data.sources.tools.map(t => t.name).join(', ')}`">
                  <v-avatar
                    v-for="(tool, i) in data.sources.tools.slice(0, 3)"
                    :key="tool.name"
                    role="listitem"
                    :aria-label="tool.name"
                    :style="{ zIndex: 3 - i }"
                    color="surface-light"
                    size="28"
                  >
                    <v-img v-if="tool.image" :src="tool.image" alt="" />
                    <span v-else class="text-label-small">{{ tool.name.charAt(0) }}</span>
                  </v-avatar>
                  <v-avatar color="surface-light" size="28">
                    <span class="text-label-small">+{{ data.sources.tools.length - 3 }}</span>
                  </v-avatar>
                </div>
              </div>
              <div class="flex-grow-1">
                <div class="text-body-medium">{{ data.sources.body }}</div>
                <div class="d-flex align-center ga-3 mt-3">
                  <AppButton variant="primary" size="s" @click="notify('Source picker opened')">
                    {{ data.sources.action }}
                  </AppButton>
                </div>
              </div>
            </div>
          </v-card>

          <!--
            How fast the graph is learning. The card itself carries NO padding
            (pa-0, this instance only): the header and content sections pad
            themselves, so the divider between them can run edge to edge.
          -->
          <v-card class="pa-0 surface--card">
            <!-- Header section -->
            <div class="d-flex align-center ga-3 pa-4">
              <!-- div instead of h2: no native heading margins; role keeps it a heading for AT -->
              <div role="heading" aria-level="2" class="text-title-medium flex-grow-1">Memory growth over time</div>
              <!-- Range switcher — same v-menu construction as the conversation switcher above -->
              <v-menu v-model="memoryMenuOpen" location="bottom end" :offset="8">
                <template #activator="{ props: activatorProps }">
                  <AppButton v-bind="activatorProps" variant="outlined" size="s">
                    {{ memoryRange }}
                    <template #rightIcon><v-icon icon="chevronDown" /></template>
                  </AppButton>
                </template>

                <v-sheet class="memory-range-menu surface--card" width="200">
                  <v-list density="comfortable" nav class="bg-transparent pa-2" aria-label="Chart time range">
                    <v-list-item
                      v-for="r in data.memory.ranges"
                      :key="r"
                      :title="r"
                      :active="r === memoryRange"
                      @click="selectMemoryRange(r)"
                    >
                      <template #append>
                        <v-icon v-if="r === memoryRange" icon="check" size="small" />
                      </template>
                    </v-list-item>
                  </v-list>
                </v-sheet>
              </v-menu>
            </div>

            <!-- Edge-to-edge divider between header and content (Figma spec) -->
            <div class="memory-card__divider" aria-hidden="true"></div>

            <!-- KPI section -->
            <div>
              <div class="d-flex ga-2">
                <div v-for="stat in data.memory.stats" :key="stat.id" class="kpi-card">
                  <div class="kpi-card__header">
                    <span class="text-label-small text-medium-emphasis">{{ stat.label }}</span>
                  </div>
                  <div class="d-flex align-center ga-2">
                    <!-- Icon-only badge: direction only; the delta stays in the aria-label -->
                    <span
                      class="kpi-trend"
                      :class="stat.delta < 0 ? 'kpi-trend--down' : 'kpi-trend--up'"
                      :aria-label="`${stat.delta > 0 ? 'Up' : 'Down'} ${Math.abs(stat.delta)} this week`"
                      role="img"
                    >
                      <v-icon :icon="stat.delta < 0 ? 'minus' : 'plus'" size="x-small" />
                    </span>
                    <div class="kpi-card__value text-title-large font-weight-medium tabular">{{ stat.value }}</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Full-width divider between the KPI and chart sections -->
            <div class="memory-card__divider" aria-hidden="true"></div>

            <!-- Chart section -->
            <div class="pa-4">
              <!-- `glass`: translucent backdrop bars, matching the time-rail histogram -->
              <BarChart
                :data="data.memory.series"
                x="day"
                y="added"
                :height="180"
                glass
                title="New nodes added to the graph each day"
              />
            </div>
          </v-card>

          <!-- Two figures that qualify any answer the assistant gives -->
          <div class="d-flex ga-4">
                        <v-card
              v-for="meter in data.meters"
              :key="meter.id"
              class="pa-4 flex-grow-1 surface--card"
            >
              <div class="d-flex align-center ga-3">
                <v-progress-circular
                  v-if="meter.ratio !== undefined"
                  :model-value="meter.ratio * 100"
                  :aria-label="`${meter.label}: ${meter.display}`"
                  color="primary"
                  size="36"
                  width="3"
                >
                  <v-icon :icon="meter.icon" size="x-small" />
                </v-progress-circular>
                <v-avatar v-else color="surface-light" size="36">
                  <v-icon :icon="meter.icon" size="small" />
                </v-avatar>
                <div>
                  <div class="text-label-small text-medium-emphasis">{{ meter.label }}</div>
                  <div class="text-title-medium font-weight-medium tabular">{{ meter.display }}</div>
                </div>
              </div>
              <!-- What the figure counts, in the open — a tooltip would hide it from touch. -->
              <p class="text-label-small text-medium-emphasis mt-2">{{ meter.hint }}</p>
            </v-card>
          </div>
        </div>

        <!-- The anchor: everything above feeds this -->
        <div class="rail__composer pa-4 pt-0">
          <!--
            The composer's nested shell (Figma node 1105:146056 + the
            container-in-container revision). SuggestionsPanel owns the outer
            dark shell, the suggestions tab/list and the gold Level-2 ring;
            the composer content below is slotted into that inner ring, so
            the input logic (draft, send, mic, attach) stays in this screen.
            The field is `plain` so the ring — not Vuetify's outline — is the
            input's visible boundary; the accessible name is the aria-label.
          -->
          <SuggestionsPanel :suggestions="data.composer.suggestions" @select="onSuggestion">
            <!-- Enter sends, shift+Enter starts a new line — the chat convention. -->
            <v-textarea
              v-model="draft"
              class="composer-input px-2"
              :placeholder="data.composer.placeholder"
              :aria-label="`Ask ${brand.identity.shortName}`"
              variant="plain"
              name="question"
              autocomplete="off"
              rows="3"
              auto-grow
              max-rows="8"
              hide-details
              @keydown.enter.exact.prevent="send"
            />

            <div class="d-flex align-center ga-1 w-100">
              <AppButton variant="ghost" size="m" icon-only aria-label="Attach a document" @click="notify('Attach a document')">
                <template #icon><v-icon icon="plus" /></template>
              </AppButton>
              <v-spacer />
              <AppButton variant="ghost" size="m" icon-only aria-label="Dictate your question" @click="notify('Listening…')">
                <template #icon><v-icon icon="microphone" /></template>
              </AppButton>
              <AppButton class="composer-send" variant="primary" size="l" icon-only aria-label="Send question" :disabled="!draft.trim()" @click="send">
                <template #icon><v-icon icon="send" /></template>
              </AppButton>
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
  /* One source for the rail's width: .rail is sized with it, and
     .rail-handle centers itself on the seam it defines. */
  --rail-width: 460px;
  position: relative; /* positioning context for the .rail-handle overlay */
  display: flex;
  height: 100dvh;
  overflow: hidden;
}

.canvas {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  background: radial-gradient(46.61% 109.78% at 51.61% 55.8%, var(--Gray-3, #1B2220) 0%, #000 100%);
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

/* The row holds the brand chip and the Reset control, 16px apart (ga-4). */
.chrome--brand-row { top: 16px; left: 16px; }

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
  top: 16px;
  right: 16px;
  background: rgb(var(--v-theme-background));
  border-radius: 8px;
  padding: 2px;
  gap: 2px;
}

.chrome--date {
  top: 88px;
  left: 16px;
}

.chrome--zoom {
  top: 88px;
  right: 16px;
  background: rgb(var(--v-theme-background));
  border-radius: 8px;
  padding-top: 2px;
  padding-bottom: 2px;
  gap: 2px;
}
.chrome--legend { right: 16px; bottom: 16px; width: 200px; }

/* ── Time rail ── */
.chrome--timeline {
  /* 16px below the date control: its top (88px) + the size-s button (32px) + 16. */
  top: 136px;
  bottom: 24px;
  left: 16px;
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
 * Subtle gray backdrop behind the ruler — gray1 is the theme's #949B99 (the
 * Figma Gray/W primitive), with a hex fallback for themes that don't define
 * it. The body's edge fade dims this fill along with everything else, so it
 * dissolves into the canvas rather than ending on a hard line.
 */
.timeline__mask {
  background: rgba(var(--v-theme-gray1, 148, 155, 153), 0.1);
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
  pointer-events: none;
  z-index: 2;
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
.legend { list-style: none; padding: 0; }

.swatch {
  width: 10px;
  height: 10px;
  flex: 0 0 10px;
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
  /* NOT overflow:hidden — it clipped the send button's glow at the composer's
     edges. Scrolling is already confined to .rail__stack (its own
     overflow-y:auto), so the rail itself has nothing to clip; letting soft
     shadows breathe past its box costs nothing. */
  overflow: visible;
}

/* Only this region scrolls. */
.rail__stack {
  flex: 1 1 auto;
  overflow-y: auto;
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
.memory-card__divider {
  border: 0;
  width: 100%;
  height: 1px;
  max-height: 1px;
  opacity: 1;
  background: linear-gradient(
    270deg,
    rgba(var(--v-theme-gray1), 0) 0%,
    rgba(var(--v-theme-gray1), 0.2) 50%,
    rgba(var(--v-theme-gray1), 0) 100%
  );
}

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
 * Vertical splitter on the right edge of every card but the last — the
 * .memory-card__divider recipe rotated: 1px, transparent → 20% gray1 at the
 * center → transparent, drawn by a pseudo-element instead of a solid border.
 */
.kpi-card:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 1px;
  height: 100%;
  background: linear-gradient(
    180deg,
    rgba(var(--v-theme-gray1), 0) 0%,
    rgba(var(--v-theme-gray1), 0.2) 50%,
    rgba(var(--v-theme-gray1), 0) 100%
  );
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
  padding-bottom: max(16px, env(safe-area-inset-bottom));
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
.composer-input {
  width: 100%;
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
 * The send action: circular, warm gold/beige, softly glowing. Overrides
 * AppButton's primary skin with the existing outlined-accent gradient pair;
 * the descendant selector outranks AppButton's own single-class rules, and
 * the disabled state still wins via AppButton's !important rules.
 */
.rail__composer .composer-send {
  border-radius: 50%;
  border-color: transparent;
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
  border-color: transparent;
  box-shadow:
    0 0 20px 0 rgba(var(--v-theme-button-outlined-accent-1), 0.5),
    0 0 12px 0 rgba(var(--v-theme-button-black-b-40));
}

/*
 * Stacked source avatars, overlapped by a fixed step. The subtle black ring
 * separates each logo from the one it overlaps — existing button token, no
 * new hex.
 */
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
.rail-handle {
  position: absolute;
  z-index: 10;
  top: 50%;
  right: var(--rail-width);
  transform: translate(50%, -50%);
}

.rail-handle--closed {
  right: 8px;
  transform: translateY(-50%);
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
  .chrome--toolbar {
    top: 84px;
    right: 16px;
    left: 16px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .chrome--date { top: 148px; }
  .chrome--zoom { top: 148px; }
  .chrome--legend { width: 168px; }
}

@media (prefers-reduced-motion: reduce) {
  .histo__bar,
  .hour__label,
  .timeline__handle { transition: none; }
}
</style>
