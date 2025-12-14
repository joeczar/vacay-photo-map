import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { initializeAuth } from '@/composables/useAuth'
import './assets/main.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)

// Initialize auth state before mounting to ensure router guards have valid state
;(async () => {
  await initializeAuth()
  app.mount('#app')
})()
