<template>
  <nav
    class="md:hidden fixed bottom-0 inset-x-0 z-50 bg-card/90 backdrop-blur border-t border-border safe-bottom"
    role="navigation"
    aria-label="Primary"
  >
    <div class="max-w-7xl mx-auto px-4">
      <ul class="flex items-stretch justify-between gap-2 py-2">
        <!-- Home -->
        <li class="flex-1">
          <RouterLink
            to="/"
            class="w-full h-12 min-h-12 flex flex-col items-center justify-center rounded-md text-xs text-foreground/80 hover:bg-accent"
            aria-label="Home"
          >
            <svg class="w-5 h-5 mb-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
            </svg>
            Home
          </RouterLink>
        </li>

        <!-- Upload/Admin or Login -->
        <li class="flex-1">
          <RouterLink
            v-if="isAuthenticated"
            to="/admin"
            class="w-full h-12 min-h-12 flex flex-col items-center justify-center rounded-md text-xs text-foreground/80 hover:bg-accent"
            aria-label="Upload"
          >
            <svg class="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            Upload
          </RouterLink>
          <RouterLink
            v-else
            to="/login"
            class="w-full h-12 min-h-12 flex flex-col items-center justify-center rounded-md text-xs text-foreground/80 hover:bg-accent"
            aria-label="Login"
          >
            <svg class="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7" />
            </svg>
            Login
          </RouterLink>
        </li>

        <!-- Theme -->
        <li class="flex-1 flex items-center justify-center">
          <ThemeToggle />
        </li>
      </ul>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'
import ThemeToggle from '@/components/ThemeToggle.vue'
import { useAuth } from '@/composables/useAuth'

const { isAuthenticated } = useAuth()
</script>

