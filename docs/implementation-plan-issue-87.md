# Implementation Plan: Extract shared layouts and components to reduce duplication

**Issue:** #87
**Branch:** `feature/issue-87-extract-shared-components`
**Complexity:** Simple
**Total Commits:** 5

## Overview

Extract duplicated UI patterns from LoginView, RegisterView, HomeView, and TripView into reusable components and layouts. This improves maintainability, reduces code duplication (saving ~100 lines), and ensures consistent UX across the app.

## Prerequisites

- [x] Research complete - duplication identified
- [x] Existing patterns documented (slot-based layouts, shadcn-vue components)

## Architecture

### Components to Create

**Layouts:**
- `AuthLayout.vue` - Wraps auth pages with centered card layout and navigation header

**Components:**
- `ErrorState.vue` - Reusable error state with icon, message, and action slot
- `EmptyState.vue` - Reusable empty state with icon, message, and action slot
- `LoadingState.vue` - Reusable loading spinner with optional message

### Data Flow

```
Auth Views → AuthLayout → Centered Card (slot)
List/Detail Views → ErrorState/EmptyState/LoadingState → Consistent UI
```

### Design Principles

- **Slot-based composition** - Following existing layout patterns (MainLayout, TripLayout)
- **Props for customization** - title, message, variant, etc.
- **shadcn-vue first** - Use existing Button, Card components
- **CSS variables** - Leverage design tokens for consistency

## Atomic Commits

### Commit 1: Create AuthLayout component

**Type:** feat
**Scope:** layouts
**Files:**
- `app/src/layouts/AuthLayout.vue` - Create

**Changes:**
- Extract shared auth header from LoginView/RegisterView (lines 2-18)
- Create layout with header (logo, home link, theme toggle)
- Centered main content area with flex layout
- Slot for card content (cards inserted by consuming views)
- Import Button and ThemeToggle components

**Acceptance Criteria:**
- [x] AuthLayout renders header with Vacay Photo Map logo
- [x] Header includes Home link and ThemeToggle
- [x] Main area centers content with flex
- [x] Default slot accepts card content
- [x] Types pass: `pnpm type-check`

**Component Structure:**
```vue
<template>
  <div class="min-h-screen bg-background flex flex-col">
    <header class="border-b border-border bg-card">
      <!-- Logo and nav -->
    </header>
    <main class="flex-1 flex items-center justify-center p-4">
      <slot /> <!-- Card content from LoginView/RegisterView -->
    </main>
  </div>
</template>
```

---

### Commit 2: Refactor LoginView and RegisterView to use AuthLayout

**Type:** refactor
**Scope:** views
**Files:**
- `app/src/views/LoginView.vue` - Modify (remove lines 2-18, wrap with AuthLayout)
- `app/src/views/RegisterView.vue` - Modify (remove lines 2-18, wrap with AuthLayout)

**Changes:**
- Replace header/main wrapper with `<AuthLayout>` component
- Remove duplicate Button and ThemeToggle imports (now in AuthLayout)
- Keep all form logic and validation unchanged
- Verify redirect logic still works correctly

**Acceptance Criteria:**
- [x] LoginView uses AuthLayout, form renders correctly
- [x] RegisterView uses AuthLayout, form renders correctly
- [x] Both views maintain existing functionality
- [x] WebAuthn flow works unchanged
- [x] Tests pass: `pnpm test`
- [x] Types pass: `pnpm type-check`

**Before (LoginView.vue lines 1-20):**
```vue
<template>
  <div class="min-h-screen bg-background flex flex-col">
    <header class="border-b border-border bg-card">
      <!-- 17 lines of duplicate header -->
    </header>
    <main class="flex-1 flex items-center justify-center p-4">
      <Card class="w-full max-w-md">
        <!-- form content -->
      </Card>
    </main>
  </div>
</template>
```

**After:**
```vue
<template>
  <AuthLayout>
    <Card class="w-full max-w-md">
      <!-- form content unchanged -->
    </Card>
  </AuthLayout>
</template>
```

---

### Commit 3: Create ErrorState component

**Type:** feat
**Scope:** components
**Files:**
- `app/src/components/ErrorState.vue` - Create

**Changes:**
- Create reusable error state component with props
- Props: `title?: string`, `message: string`, `showIcon?: boolean` (default true)
- Default slot for action buttons (e.g., retry, back to home)
- Use consistent icon, spacing, and text styles
- Apply muted-foreground colors for secondary text

**Acceptance Criteria:**
- [x] ErrorState renders icon (when showIcon is true)
- [x] Displays title and message
- [x] Slot accepts action buttons
- [x] Types pass: `pnpm type-check`

**Component Structure:**
```vue
<template>
  <div class="text-center py-16">
    <div v-if="showIcon" class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-4">
      <!-- Error icon SVG -->
    </div>
    <h2 v-if="title" class="text-2xl font-bold mb-2">{{ title }}</h2>
    <p class="text-muted-foreground mb-4">{{ message }}</p>
    <slot /> <!-- Action buttons -->
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title?: string
  message: string
  showIcon?: boolean
}>()
</script>
```

---

### Commit 4: Create EmptyState and LoadingState components

**Type:** feat
**Scope:** components
**Files:**
- `app/src/components/EmptyState.vue` - Create
- `app/src/components/LoadingState.vue` - Create

**Changes:**

**EmptyState:**
- Props: `title: string`, `description: string`
- Named slot `icon` for custom icon (default: plus icon)
- Default slot for action button
- Dashed border container with muted background

**LoadingState:**
- Props: `message?: string` (default: "Loading...")
- Animated spinner using existing pattern
- Center alignment with flex
- Optional full-screen mode via prop `fullScreen?: boolean`

**Acceptance Criteria:**
- [x] EmptyState renders with title, description, and action slot
- [x] EmptyState allows custom icon via slot
- [x] LoadingState shows spinner and message
- [x] LoadingState supports fullScreen prop
- [x] Types pass: `pnpm type-check`

**EmptyState Structure:**
```vue
<template>
  <div class="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-2xl bg-card/50">
    <div class="h-14 w-14 bg-muted rounded-full flex items-center justify-center mb-5 text-muted-foreground">
      <slot name="icon">
        <!-- Default plus icon -->
      </slot>
    </div>
    <h2 class="text-xl font-semibold text-foreground mb-2">{{ title }}</h2>
    <p class="text-muted-foreground mb-6">{{ description }}</p>
    <slot /> <!-- Action button -->
  </div>
</template>
```

**LoadingState Structure:**
```vue
<template>
  <div class="flex items-center justify-center" :class="fullScreen ? 'min-h-screen' : 'py-16'">
    <div class="text-center">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
      <p class="text-muted-foreground">{{ message }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    message?: string
    fullScreen?: boolean
  }>(),
  {
    message: 'Loading...',
    fullScreen: false
  }
)
</script>
```

---

### Commit 5: Refactor HomeView and TripView to use new components

**Type:** refactor
**Scope:** views
**Files:**
- `app/src/views/HomeView.vue` - Modify (replace lines 27-82 with new components)
- `app/src/views/TripView.vue` - Modify (replace lines 42-60 with new components)

**Changes:**

**HomeView:**
- Replace loading skeleton (lines 27-34) with `<LoadingState />` (simpler than skeleton for this case)
- Replace error state (lines 38-58) with `<ErrorState>`
- Replace empty state (lines 61-82) with `<EmptyState>`
- Remove duplicate icon SVGs, use component slots

**TripView:**
- Replace loading state (lines 42-49) with `<LoadingState fullScreen message="Loading trip..." />`
- Replace error state (lines 52-60) with `<ErrorState>` with custom title and back button

**Acceptance Criteria:**
- [x] HomeView uses ErrorState, EmptyState components
- [x] TripView uses LoadingState, ErrorState components
- [x] All existing functionality preserved
- [x] Manual verification in browser: loading, error, empty states render correctly
- [x] Tests pass: `pnpm test`
- [x] Types pass: `pnpm type-check`
- [x] Lint passes: `pnpm lint`

**Before (HomeView.vue lines 38-58):**
```vue
<!-- Error State -->
<div v-else-if="error" class="text-center py-16">
  <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-4">
    <svg class="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <!-- Icon path -->
    </svg>
  </div>
  <p class="text-muted-foreground mb-4">Couldn't load trips right now</p>
  <Button variant="outline" size="sm" class="btn-gradient-primary" @click="loadTrips">
    Try again
  </Button>
</div>
```

**After:**
```vue
<!-- Error State -->
<ErrorState v-else-if="error" message="Couldn't load trips right now">
  <Button variant="outline" size="sm" class="btn-gradient-primary" @click="loadTrips">
    Try again
  </Button>
</ErrorState>
```

---

## Testing Strategy

Tests are lightweight for UI components - focus on integration testing in views:

**Manual Testing (per commit using Playwright MCP or browser):**
1. After Commit 1: Visit /login and /register in browser - verify header renders
2. After Commit 2: Test login/register flows - verify forms work, WebAuthn flow intact
3. After Commit 3: Temporarily add ErrorState to a view - verify it renders
4. After Commit 4: Temporarily add EmptyState and LoadingState - verify rendering
5. After Commit 5: Test all states in HomeView and TripView:
   - Loading: Refresh page
   - Error: Temporarily break API endpoint
   - Empty: Delete all trips
   - Normal: Verify trips load correctly

**Automated Tests:**
- Type checking after each commit: `pnpm type-check`
- Lint after final commit: `pnpm lint`
- Existing test suite: `pnpm test`

## Verification Checklist

Before PR creation:
- [x] All commits completed and reviewed
- [x] Full test suite passes (`pnpm test`)
- [x] Type check passes (`pnpm type-check`)
- [x] Lint passes (`pnpm lint`)
- [x] Manual verification in browser:
  - Login/Register pages render correctly
  - Auth flows work (login, register, WebAuthn)
  - HomeView shows loading/error/empty/normal states
  - TripView shows loading/error/normal states
  - Dark mode toggles correctly in all views
  - Responsive behavior intact (mobile, tablet, desktop)

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking WebAuthn flow in auth views | Keep all form logic unchanged, only wrap with layout. Test login/register after Commit 2. |
| Inconsistent styling across components | Use existing shadcn-vue components and CSS variables. Reference existing patterns. |
| Loading state breaks existing skeleton | Keep skeleton approach in HomeView if preferred - LoadingState is optional alternative. |

## Open Questions

None - all patterns are established in the codebase.

## Code Savings Summary

**Before:** ~140 lines of duplicated code
- Auth header: 34 lines (17 x 2 views)
- Error states: ~30 lines
- Empty state: 22 lines
- Loading state: 8 lines

**After:** ~60 lines of reusable components + minimal usage in views

**Net reduction:** ~80 lines of code, improved maintainability and consistency.
