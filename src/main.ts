/**
 * main.ts
 *
 * Bootstraps Vuetify and other plugins then mounts the App`
 */

// Composables
import { createApp } from 'vue'

// Plugins
import { registerPlugins } from '@/plugins'

// Components
import App from './App.vue'

// Styles
import 'unfonts.css'
// The Sass radius scale, republished as CSS custom properties (--radius-*) so
// plain CSS can read it. Must precede overrides.css, which consumes them.
import './styles/css-tokens.scss'
// Background utilities — three-layer system (base, gradient, noise)
import './styles/backgrounds.scss'
// Glass-morphism surface treatments for cards and chrome
import './styles/surfaces.scss'
// Global Vuetify-quirk overrides — imported last so it wins over component CSS.
import './styles/overrides.css'

async function bootstrap () {
  // Dev-only: boot the mock backend (MSW) before mounting so the very first
  // API call is intercepted. Frontend-only project — see src/mocks/.
  if (import.meta.env.DEV) {
    const { startMocks } = await import('./mocks/browser')
    await startMocks()
  }

  const app = createApp(App)
  registerPlugins(app)
  app.mount('#app')
}

bootstrap()
