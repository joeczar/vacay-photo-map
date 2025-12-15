import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { initializeAuth } from '@/composables/useAuth'
import './assets/main.css'
import ripple from './directives/ripple'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.directive('ripple', ripple)

// Initialize auth state before mounting to ensure router guards have valid state
;(async () => {
  await initializeAuth()
  app.mount('#app')
  // Try to register PWA service worker if plugin is available
  try {
    const mod = await import(/* @vite-ignore */ 'virtual:pwa-register')
    if (mod && typeof mod.registerSW === 'function') {
      mod.registerSW({ immediate: true })
    }
  } catch {
    // PWA plugin not available in this environment; ignore
  }
})()
