<template>
  <MainLayout>
    <div class="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <!-- Hero -->
      <div class="max-w-2xl mx-auto px-4">
        <h1 class="text-4xl font-bold tracking-tight text-foreground sm:text-5xl mb-4">
          Vacay Photo Map
        </h1>
        <p class="text-xl text-muted-foreground mb-8">
          A personal photo journal for sharing travel memories with friends and family.
        </p>

        <!-- About -->
        <div
          class="rounded-2xl bg-card border border-border/50 px-6 py-8 sm:px-10 sm:py-10 mb-8 card-soft text-left"
        >
          <p class="text-muted-foreground mb-4">
            This is a private photo sharing app. If you received a share link to view a trip, click
            it to see the photos.
          </p>
          <p class="text-muted-foreground">
            Built by Joe Czarnecki as a way to share vacation photos without relying on social media
            platforms.
          </p>
        </div>

        <!-- Links -->
        <div class="flex flex-col sm:flex-row gap-4 justify-center">
          <Button as-child variant="outline" size="lg">
            <a href="https://joeczar.com" target="_blank" rel="noopener noreferrer">
              Visit joeczar.com
            </a>
          </Button>
          <Button as-child variant="ghost" size="lg">
            <router-link to="/login">Admin Login</router-link>
          </Button>
        </div>
      </div>
    </div>
  </MainLayout>
</template>

<script setup lang="ts">
import MainLayout from '@/layouts/MainLayout.vue'
import { Button } from '@/components/ui/button'
</script>
