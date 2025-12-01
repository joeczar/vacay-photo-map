import { createRouter, createWebHistory } from 'vue-router'
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

// Auth guard will be added when implementing authentication
router.beforeEach((to, _from, next) => {
  if (to.meta.requiresAuth) {
    // TODO: Check authentication status
    // For now, allow all access
    next()
  } else {
    next()
  }
})

export default router
