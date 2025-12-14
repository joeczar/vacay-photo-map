import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue')
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('../views/AdminView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/trip/:slug',
      name: 'trip',
      component: () => import('../views/TripView.vue')
    }
  ]
})

// Auth guard - redirect to login if not authenticated, check admin status
router.beforeEach((to, _from, next) => {
  const { isAuthenticated, isAdmin, loading } = useAuth()

  // Wait for auth to initialize before making decisions
  if (loading.value) {
    // Auth still initializing - allow navigation, initializeAuth() will complete first
    // This is a safety check for edge cases like hot reload
    return next()
  }

  if (to.meta.requiresAuth && !isAuthenticated.value) {
    return next({ name: 'login', query: { redirect: to.fullPath } })
  }

  if (to.meta.requiresAdmin && !isAdmin.value) {
    return next({ name: 'home' })
  }

  next()
})

export default router
