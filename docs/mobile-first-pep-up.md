# Mobile-First Design Pep-Up Plan

## Findings
- Framework: Vue 3, Vite, Pinia, Vue Router, Tailwind, shadcn-vue UI. Dark mode via class strategy.
- Screens: `HomeView` (trip grid), `TripView` (map + photos + share/manage), `AdminView` (upload flow), `LoginView`.
- Layouts: `MainLayout` (top bar + container), `TripLayout` (floating menu + sheet).
- Media: Cloudinary uploads used directly; no responsive `srcset/sizes`.
- Map: Leaflet map uses a fixed inline height of 600px.
- Strengths: Solid state handling, skeletons, empty/error states, auth guards, share controls, dark theme support.

## Gaps (Mobile)
- Fixed map height on phones; should be viewport-relative.
- No bottom/tab navigation; actions hidden in a floating menu.
- Images overserved on mobile (no `srcset/sizes`).
- Lightbox lacks swipe/drag gestures.
- Missing iOS safe-area padding for bottom UI.
- Touch targets small on some icon-only buttons.
- No PWA manifest/service worker for installability and caching.

## Plan
- Navigation & IA
  - Add compact bottom tab bar (Home, Upload/Admin, Theme), with safe-area padding.
  - Keep top header but reduce prominence on mobile; rely on bottom nav.
- Home (Trips)
  - One-column layout on small screens with larger media; reduce outer padding for edge-to-edge feel.
  - Add responsive images (`srcset/sizes`), `loading="lazy"`, `decoding="async"`.
  - Maintain consistent skeleton heights.
- Trip (Map + Photos)
  - Replace fixed map height with responsive `h-[50vh] sm:h-[60vh] md:h-[600px]`.
  - Add segmented control for “Map” / “Photos” on mobile.
  - Improve grid density: 2-up on small, 3-up on sm, etc.
  - Lightbox: swipe left/right, drag-down-to-close, double-tap zoom.
- Upload (Admin)
  - Primary button-first flow; previews as horizontal scroll row; fields below.
  - Client-side resize (longest edge ~1600px) and EXIF orientation fix.
- Visual System
  - Tap target utilities (`min-h-10 min-w-10`) on icon buttons.
  - Subtle elevation and pressed states; unify radii via tokens.
  - Warmer light neutrals; keep current cozy dark theme.
- Performance
  - Cloudinary width transforms + `srcset/sizes` for covers, thumbs, and lightbox.
  - `content-visibility: auto` on long grids; respect `prefers-reduced-data` where possible.
  - Keep route-level code splitting for map.
- Accessibility
  - Alt text for media; `aria-label` for icon buttons.
  - Focus-visible rings; maintain contrast on cards.
  - Respect `prefers-reduced-motion` for hover/zoom.
- PWA & Meta
  - Add `vite-plugin-pwa`, manifest, icons; `registerType: 'autoUpdate'`.
  - iOS meta: safe areas and dark theme color.

## Quick Wins
- Make map height responsive in `TripView.vue`.
- Add Web Share API fallback (composable) and wire into share sheet.

## Concrete File-Level Changes
- `src/views/TripView.vue`
  - Replace map container inline height with Tailwind responsive classes.
  - Add mobile tabs for Map/Photos (follow-up).
  - Use lazy/async and responsive images for thumbnails and lightbox (follow-up).
- `src/components/TripCard.vue`
  - Add `srcset/sizes`, `loading="lazy"`, `decoding="async"`.
- `src/layouts/MainLayout.vue`, `src/layouts/TripLayout.vue`
  - Add `components/BottomNav.vue` (mobile-only), safe-area padding.
- `src/assets/main.css`
  - Add `.safe-bottom` utility and reduced-motion tweaks.
- `src/composables/useShare.ts`
  - Web Share with clipboard fallback + toast.
- `vite.config.ts`
  - Integrate `vite-plugin-pwa` and manifest.

## Example Tailwind Patterns
- Map container: `h-[50vh] sm:h-[60vh] md:h-[600px]`.
- Safe areas: `.safe-bottom { padding-bottom: max(env(safe-area-inset-bottom), 0.75rem); }`.
- Tap targets: `min-h-10 min-w-10` on icon-only buttons.

## Validation
- Test across 375×812, 390×844, 412×915, 768×1024.
- Verify: ≥44px tap targets, readable lines, smooth Map/Photos switch, native sharing on mobile, crisp images without overserving.

## Next Steps
1) Implement quick wins (map height, Web Share).
2) Add responsive images for TripCard/TripView.
3) Scaffold bottom nav and safe-area utilities.
4) Lightbox gestures.
5) PWA manifest and caching.

