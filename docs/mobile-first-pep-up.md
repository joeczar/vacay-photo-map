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

## Progress
- Map height made responsive in `TripView.vue` (h-[50vh] sm:h-[60vh] md:h-[600px]).
- Web Share composable added (`useShare`) and Share button wired in Trip share sheet.
- Responsive images implemented:
  - `TripCard.vue` cover image now uses `srcset/sizes` with lazy/async.
  - `TripView.vue` grid, popup, and lightbox images use `srcset/sizes` and optimized fallbacks.
- Verified changes in the browser using Playwright MCP (Home, Trip grid, lightbox, and popup images report proper `srcset/sizes`).
- Bottom navigation added (mobile-only) with safe-area padding and Theme toggle.
- Theme toggle bug fixed: immediate class apply in `useDarkMode`; header Theme toggle hidden on mobile to avoid duplicate toggles.
- TripView segmented control (mobile): Map/Photos tabs to switch views, with both visible on md+.
- Mobile nav duplication resolved: header nav hidden under `md` (`hidden md:flex`) and BottomNav handles primary actions on mobile.

### Subtle Pop Enhancements
- Accent color system: derive `--accent` from cover/first photo via lightweight canvas sampling (`useAccentColor`), reset on unmount.
- Ambient hero: add `.accent-ambient` background and `text-accent-gradient` for Trip title.
- Progressive image reveal: `ProgressiveImage.vue` adds blur-up + scale-in on load (respects reduced motion); used in Trip grid, popups, and trip cards.
- Tactile taps: `v-ripple` directive on primary tappables (BottomNav + key buttons) with motion-safe checks.
- BottomNav polish: frosted card with subtle accent glow shadow.

## Notes / Open Decisions
- Mobile nav is no longer doubled: header nav is hidden under `md`; BottomNav is the primary mobile nav.

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
1) Lightbox gestures (swipe/drag/zoom) for better mobile UX.
2) PWA manifest and caching via `vite-plugin-pwa`.

## Design Research Brief (Modern UI/UX)

Sources reviewed (offline copies in `docs/research/`):
- Apple Human Interface Guidelines — foundations, materials, depth cues
- Material 3 — motion, easing and duration, state layers
- Microsoft Fluent 2 — surfaces, inner borders, radii, elevation
- Linear Design — indigo gradients, minimal chrome, dark mode craft
- Vercel site — aurora gradients, ambient backgrounds, strong contrast

Key takeaways:
- Color: Deep indigo/violet or cyan accents over neutral bases; avoid yellow for modern feel.
- Ambient: Low-saturation aurora/radial gradients behind content; strengthen only on hero/featured.
- Depth: Glass/translucent surfaces with thin inner borders; layered, soft shadows.
- Motion: Short, confident durations (~180–220ms); blur-up image reveals; motion-safe fallbacks.
- Microinteractions: Subtle press/ripple states and tiny elevation shifts on tap/hover.
- Typography: Larger hero titles with tight leading; comfortable body size; occasional gradient text.
- Chrome: Chromeless lightbox; edge-to-edge mobile with safe-area padding.
- A11y: Respect reduced-motion; clamp accent saturation/lightness for contrast.

Applied so far:
- Primary shifted to indigo/violet; accent can derive from cover photo.
- Ambient aurora background utilities added and applied to layouts.
- Progressive image reveal and ripple interactions implemented (motion-safe).
- Yellow removed from UI badges; neutral/rose used instead.

Proposed next visual upgrades:
- Glass header/bottom nav with inner borders for subtle depth.
- Gradient primary buttons with gentle pressed state.
- Featured “bento” card on Home (wider/taller, gradient frame, glass caption).
- Lightbox “peek” when swiping; slightly brighter captions.
- Map marker accent glow ring for clarity over dark/light tiles.
