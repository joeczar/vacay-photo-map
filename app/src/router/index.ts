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
      path: '/register',
      name: 'register',
      component: () => import('../views/RegisterView.vue'),
      beforeEnter: async (_to, _from, next) => {
        try {
          const response = await fetch(
            `${import.meta.env.VITE_API_URL}/api/auth/registration-status`
          )

          if (!response.ok) {
            // API error - fail closed
            return next({ name: 'login' })
          }

          const { registrationOpen } = await response.json()

          if (registrationOpen) {
            next()
          } else {
            next({ name: 'login' })
          }
        } catch (error) {
          // Network error or JSON parse error - fail closed
          console.error('[ROUTER] Registration status check failed:', error)
          next({ name: 'login' })
        }
      }
    },
    {
      path: '/trips',
      name: 'trips',
      component: () => import('../views/TripsView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('../views/AdminView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true }
    },
    {
      path: '/admin/trips',
      name: 'admin-trips',
      component: () => import('../views/TripManagementView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true }
    },
    {
      path: '/trip/:slug',
      name: 'trip',
      component: () => import('../views/TripView.vue')
    }
  ]
})

// Auth guard - protected routes and redirects
router.beforeEach((to, _from, next) => {
  const { isAuthenticated, isAdmin, loading } = useAuth()

  // Wait for auth to initialize before making decisions
  if (loading.value) {
    return next()
  }

  // Redirect authenticated users away from login/register to trips
  if (isAuthenticated.value && (to.name === 'login' || to.name === 'register')) {
    return next({ name: 'trips' })
  }

  // Redirect authenticated users from home to trips
  if (isAuthenticated.value && to.name === 'home') {
    return next({ name: 'trips' })
  }

  // Protected routes - require auth
  if (to.meta.requiresAuth && !isAuthenticated.value) {
    return next({ name: 'login', query: { redirect: to.fullPath } })
  }

  // Admin routes - require admin role
  if (to.meta.requiresAdmin && !isAdmin.value) {
    return next({ name: 'home' })
  }

  next()
})

export default router
