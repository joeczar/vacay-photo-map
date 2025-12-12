import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '@/lib/supabase'
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
router.beforeEach(async (to, _from, next) => {
  if (!to.meta.requiresAuth) {
    return next()
  }

  const {
    data: { session }
  } = await supabase.auth.getSession()

  if (!session) {
    return next({ name: 'login', query: { redirect: to.fullPath } })
  }

  // Authorization check for admin routes
  const { data: profile, error } = (await supabase
    .from('user_profiles')
    .select('is_admin')
    .eq('id', session.user.id)
    .single()) as { data: { is_admin: boolean } | null; error: unknown }

  if (error) {
    console.error('Error fetching user profile:', error)
    return next({ name: 'home' })
  }

  if (profile?.is_admin) {
    return next()
  }

  // Redirect non-admins away from admin routes
  return next({ name: 'home' })
})

export default router
