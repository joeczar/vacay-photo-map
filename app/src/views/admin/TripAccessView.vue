<template>
  <AdminLayout>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-foreground">Trip Access</h1>
    </div>

    <!-- Placeholder content -->
    <Card>
      <CardHeader>
        <CardTitle>Access Management</CardTitle>
        <CardDescription>Control which users can view or edit each trip.</CardDescription>
      </CardHeader>
      <CardContent>
        <p class="text-muted-foreground">Trip access management coming soon...</p>
      </CardContent>
    </Card>
  </AdminLayout>
</template>

<script setup lang="ts">
import AdminLayout from '@/layouts/AdminLayout.vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
</script>
