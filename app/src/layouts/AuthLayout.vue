<template>
  <div class="min-h-screen bg-background flex flex-col">
    <header class="border-b border-border bg-card">
      <div class="max-w-7xl mx-auto flex h-16 items-center justify-between px-4">
        <router-link
          to="/"
          class="text-xl font-bold text-foreground hover:text-primary transition-colors"
        >
          Vacay Photo Map
        </router-link>
        <nav class="flex items-center gap-4">
          <Button variant="ghost" as-child>
            <router-link to="/">Home</router-link>
          </Button>
          <ThemeToggle />
        </nav>
      </div>
    </header>
    <main class="flex-1 flex items-center justify-center p-4">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { Button } from '@/components/ui/button'
import ThemeToggle from '@/components/ThemeToggle.vue'
</script>
