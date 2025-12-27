<template>
  <div class="admin-space">
    <MainLayout>
      <!-- Admin Sub-Navigation -->
      <div class="mb-6">
        <nav class="flex gap-1 p-1 bg-card rounded-lg border border-border w-fit">
          <router-link
            v-for="tab in tabs"
            :key="tab.to"
            :to="tab.to"
            class="px-4 py-2 text-sm font-medium rounded-md transition-colors"
            :class="[
              isActive(tab.to)
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            ]"
          >
            {{ tab.label }}
          </router-link>
        </nav>
      </div>

      <!-- Page Content -->
      <slot />
    </MainLayout>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import MainLayout from '@/layouts/MainLayout.vue'

const route = useRoute()

const tabs = [
  { label: 'Trips', to: '/admin/trips' },
  { label: 'Upload', to: '/admin' },
  { label: 'Users', to: '/admin/users' },
  { label: 'Invites', to: '/admin/invites' },
  { label: 'Access', to: '/admin/access' }
]

function isActive(path: string): boolean {
  return route.path === path
}
</script>
