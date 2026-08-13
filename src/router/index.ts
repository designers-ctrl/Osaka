/**
 * src/router/index.ts
 *
 * App routing. Each route maps a URL to a screen in src/screens/. To add a page:
 * drop a `<Name>.vue` in src/screens/, add one entry to `routes` below, done — no
 * App.vue edits.
 *
 * The landing screen is the GRAPH WORKSPACE (`/`) — Osaka's knowledge graph plus the
 * assistant rail. There is no sign-in screen yet, so nothing is gated: the auth guard
 * below is live but every redirect is `hasRoute`-guarded, so it passes navigations
 * through until the routes it points at exist.
 *
 * The DS Storybook is not routed here at all — it is a separate standalone app on
 * port 3001 (storybook.html / src/storybook.ts / vite.storybook.config.mts).
 *
 * CONVENTIONS as you add screens:
 *   - Keep the landing screen and the sign-in screen EAGERLY imported (they are on
 *     the first-paint path); make every other screen lazy — `() => import(...)` —
 *     so each becomes its own chunk.
 *   - Mark protected screens `meta: { requiresAuth: true }` and pre-auth screens
 *     `meta: { public: true }`. The guard below keys off those two flags, so you
 *     never have to edit the guard itself.
 *   - Name the landing route `home` and the sign-in route `signin` (the constants
 *     below) — or change the constants. They are the only two names the guard knows.
 *
 * AUTH FLOW: a global `beforeEach` guard bounces `meta.requiresAuth` routes to the
 * sign-in route when the auth store isn't authenticated, and bounces an already
 * signed-in user off `meta.public` routes back to the landing route. On a fresh load
 * the guard first rehydrates the session from the persisted token (auth.restore() →
 * GET /auth/me), so a reload or deep link keeps the user signed in instead of
 * dropping to sign-in. The dev login mock accepts any credentials on purpose.
 */

import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import GraphWorkspace from '@/screens/GraphWorkspace.vue'
import { useAuthStore } from '@/stores/auth'

/** Route names the auth guard redirects to. Rename here, not in the guard. */
const LANDING_ROUTE = 'home'
const SIGNIN_ROUTE = 'signin'

const routes: RouteRecordRaw[] = [
  // The graph workspace is the landing screen, so it stays EAGERLY imported —
  // it is the first paint. Every screen added after this one should be lazy
  // (`component: () => import('@/screens/X.vue')`) so it becomes its own chunk.
  //
  // No `requiresAuth` yet: there is no sign-in screen to bounce to, and the
  // guard would simply pass the navigation through (it is `hasRoute`-guarded).
  // Add `meta: { requiresAuth: true }` here the same day SignIn.vue lands.
  { path: '/', name: 'home', component: GraphWorkspace },
]

// Fallback → the landing route. Added only once a landing route actually exists:
// with an empty `routes`, a catch-all redirecting to '/' would resolve to itself
// and spin forever.
if (routes.some(r => r.name === LANDING_ROUTE)) {
  routes.push({ path: '/:pathMatch(.*)*', redirect: '/' })
}

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Auth guard. Runs at navigation time (pinia is registered before the router, so the
// store is available here). Protected routes require a signed-in user; pre-auth
// routes redirect away once authenticated.
//
// Each redirect is guarded by `hasRoute` because the template ships no screens: a
// redirect to a route that doesn't exist yet throws at navigation time, which would
// be a runtime crash type-checking can't catch. When the target is missing we let the
// navigation through — the app is mid-build, and a blank screen beats a hard error.
router.beforeEach(async to => {
  const auth = useAuthStore()

  // On the first navigation after a load, rehydrate the session from the saved token
  // before gating — otherwise a reload (incl. Vite's dev re-optimize reload) would
  // look unauthenticated and bounce to sign-in.
  if (!auth.restored && auth.token && !auth.user) await auth.restore()

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return router.hasRoute(SIGNIN_ROUTE) ? { name: SIGNIN_ROUTE } : true
  }

  if (to.meta.public && auth.isAuthenticated) {
    return router.hasRoute(LANDING_ROUTE) ? { name: LANDING_ROUTE } : true
  }

  return true
})
