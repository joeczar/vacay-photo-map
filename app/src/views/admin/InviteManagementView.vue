<template>
  <AdminLayout>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-foreground">Invites</h1>
      <Button class="btn-gradient-primary"> <span class="mr-2">+</span> Create Invite </Button>
    </div>

    <!-- Placeholder content -->
    <Card>
      <CardHeader>
        <CardTitle>Invite Management</CardTitle>
        <CardDescription>Create and manage invitation links for new users.</CardDescription>
      </CardHeader>
      <CardContent>
        <p class="text-muted-foreground">Invite management coming soon...</p>
      </CardContent>
    </Card>
  </AdminLayout>
</template>

<script setup lang="ts">
import AdminLayout from '@/layouts/AdminLayout.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
</script>
