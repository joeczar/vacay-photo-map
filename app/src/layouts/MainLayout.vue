<template>
  <div class="min-h-screen bg-background">
    <header class="border-b border-border bg-card">
      <div class="max-w-7xl mx-auto flex h-16 items-center justify-between px-4">
        <a href="/" class="text-xl font-bold text-foreground hover:text-primary transition-colors">
          Vacay Photo Map
        </a>
        <nav class="flex items-center gap-4">
          <Button variant="ghost" as-child>
            <a href="/">Home</a>
          </Button>
          <Button variant="ghost" as-child>
            <a href="/admin">Upload</a>
          </Button>
          <ThemeToggle />
        </nav>
      </div>
    </header>
    <main class="container py-8 px-4">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { Button } from '@/components/ui/button'
import ThemeToggle from '@/components/ThemeToggle.vue'
</script>
