<template>
  <div class="min-h-screen bg-background">
    <!-- Floating Menu Button -->
    <div class="fixed top-4 right-4 z-50">
      <Button variant="outline" size="icon" @click="menuOpen = true" class="bg-card/90 backdrop-blur">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </Button>
    </div>

    <!-- Offcanvas Sheet Menu -->
    <Sheet v-model:open="menuOpen">
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>

        <div class="flex flex-col space-y-4 py-6">
          <Button variant="ghost" as-child class="justify-start">
            <a href="/">
              <svg class="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
              </svg>
              Home
            </a>
          </Button>

          <Separator />

          <div class="flex items-center justify-between px-3 py-2">
            <span class="text-sm font-medium">Theme</span>
            <ThemeToggle />
          </div>

          <Separator />

          <slot name="actions" />
        </div>
      </SheetContent>
    </Sheet>

    <main>
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import ThemeToggle from '@/components/ThemeToggle.vue'

const menuOpen = ref(false)
</script>
