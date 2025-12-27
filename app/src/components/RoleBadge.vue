<script setup lang="ts">
import { Badge } from '@/components/ui/badge'

defineProps<{
  role: 'admin' | 'editor' | 'viewer'
}>()

const roleConfig = {
  admin: { variant: 'destructive' as const, label: 'Admin' },
  editor: { variant: 'default' as const, label: 'Editor' },
  viewer: { variant: 'secondary' as const, label: 'Viewer' }
}
</script>

<template>
  <Badge :variant="roleConfig[role].variant">
    {{ roleConfig[role].label }}
  </Badge>
</template>
