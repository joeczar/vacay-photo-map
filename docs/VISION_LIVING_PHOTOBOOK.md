# Living Photobook Vision

> "Artwork and personal letter, packaged beautifully for friends and family to unwrap and wonder at."

---

## The Core Concept

This is a **photobook** - not a photo sharing app, not a travel tracker. A digital photobook that brings together photos and the places they were taken, creating beautiful experiences to gift to the people you love.

Each trip is:
- **Uniquely crafted** - one of a kind, not from a template
- **A gift** - packaged and wrapped for specific people
- **A love letter** - to places, people, and memories

---

## Two Worlds

### The Darkroom (Admin/Gallery)

Your private workshop where trips are crafted.

| Aspect | Description |
|--------|-------------|
| **Access** | Private, creator only |
| **Personality** | Craftsman - focused, precise, functional beauty |
| **Purpose** | Create, organize, curate, manage |
| **Feeling** | A photographer's workshop, tools that feel good to use |

The darkroom is where you work. It has personality, but it's the personality of craft and precision.

### The Adventure (Shared Trip View)

What recipients unwrap and experience.

| Aspect | Description |
|--------|-------------|
| **Access** | Shared via link, anyone with the link |
| **Personality** | Playful, warm, adventurous |
| **Purpose** | Experience, explore, delight |
| **Feeling** | Unwrapping a gift, going on a journey |

The trip view is where the magic happens. This is what you're crafting FOR.

---

## The Trip Experience

### The Unveiling

When someone opens a shared trip link:

1. **The Unwrapping** - A beautiful animation unfolds
   - Map appears and unfolds
   - Photo pins pop in with staggered animation
   - Trip title reveals
   - Sets the emotional stage

2. **The Choice** - After the unveiling, a prompt:

   > *"How would you like to experience?"*
   >
   > **Explore** - Wander freely
   >
   > **Passenger Princess** - Sit back & enjoy the ride

3. **The Journey** - Based on their choice, they either:
   - **Explore**: Self-directed, click around the map, pick chapters
   - **Passenger Princess**: Guided cinematic playthrough with animations

### Slideshow Mode (Passenger Princess)

The cinematic experience:

- **Opening**: Map unfolds, pins appear
- **Navigation**: Vehicle travels between locations
  - ✈️ Plane for intercontinental (great circle arcs)
  - 🚗 Car for road trips (follows actual roads via routing API)
  - 🚶 Walking for city exploration
  - 🚴 Bike for cycling trips
- **Progression**: Photos reveal as vehicle approaches
- **Chapters**: Natural breaks at location changes
- **Pacing**: Breathing room between segments

### Explore Mode

The self-directed experience:

- Full map visible with all pins
- Click any location/chapter to dive in
- Wander freely between photos
- No prescribed order
- Can switch to Passenger Princess anytime

### Remembered Preferences

After first visit, the system could remember:
- Preferred mode
- Skip the prompt for returning visitors
- Or always show the unveiling (it's part of the magic)

---

## Photo Treatments

Photos are the story. Enhancements are subtle:

### Standard
- Photo displayed beautifully
- Caption/description below
- Location context

### Postcard
- Styled as a physical postcard
- Front: The image with "Greetings from [Location]"
- Back: The message/description
- Stamp with date, postmark
- "Wish you were here" energy

### Future Possibilities
- Polaroid style
- Full bleed (edge to edge, immersive)
- Side-by-side comparisons
- Before/after

---

## Chapter Structure

Large trips organize into chapters:

```
TRIP
├── Chapter 1: Location A (45 photos)
│   └── Travel animation to next
├── Chapter 2: Location B (80 photos)
│   └── Travel animation to next
├── Chapter 3: Location C (60 photos)
│   └── ...
```

Chapters provide:
- Natural pacing in slideshow mode
- Entry points in explore mode
- Visual grouping on the map
- Manageable segments for long trips

GPS data in photos naturally clusters into chapters. Manual curation refines this.

---

## Theming System

A framework for giving each trip its own personality.

### Theme Components

| Component | Description | Examples |
|-----------|-------------|----------|
| **Palette** | Colors that evoke the place | Earth tones, cool grays, bold accents |
| **Typography** | The voice of the text | Handwritten, rugged, refined |
| **Map Style** | How the terrain appears | Terrain, minimal, topo, satellite, watercolor |
| **Transport** | What makes the journey | Car, plane, walking, bike |
| **Envelope** | How it's wrapped for sharing | The preview, the sealed gift |
| **Animations** | How things move | Slow & cinematic, quick & energetic |
| **Ambient** | Subtle textures & touches | Paper texture, subtle patterns |

### Theme Examples

**Mountain Adventure**
- Earthy palette (greens, browns, sky blue)
- Rugged typography
- Terrain map showing elevation
- Car/truck transport
- Warm, grounded feeling

**European City**
- Cool, sophisticated palette
- Refined typography
- Minimal/clean map
- Walking transport
- Cozy, wandering feeling

**Bikepacking**
- Bold accent colors
- Active, energetic typography
- Topo map
- Bike transport
- Kinetic, personal feeling

---

## First Trip: Colorado/Utah Homecoming

### Overview

| Attribute | Value |
|-----------|-------|
| **Photos** | ~360 |
| **Chapters** | ~10 (location-based) |
| **Duration** | One epic journey |
| **Recipients** | Family, friends, loved ones |

### The Route

```
DIA (start)
    │
    ├── Estes Park (alpine, mountains)
    │
    ├── Berthoud / Longmont (front range)
    │
    ├── Westminster (Denver metro)
    │
    ══════ The Drive to Utah ══════
    │
    ├── Orem (Utah valley)
    │
    ├── St. George (red rock country)
    │
    ├── Monument Valley (otherworldly)
    │
    ├── Glenwood Springs (mountain town)
    │
    └── Boulder (end)
```

### The Soul

> **Partner, mountains, family.**

This is a love letter. A homecoming. The mountains are always there - starting in the Rockies, crossing through, seeing them in different forms (red rock monuments are still mountains), always on the horizon.

- Partner is who you experience it with
- Mountains are the visual constant
- Family is why you came back

### Theme Direction

**Palette**: Earth tones that shift subtly by chapter
- Alpine greens (Estes Park)
- Golden plains (Front Range)
- Red rock warmth (Utah)
- Back to mountain greens

**Typography**: Handwritten but legible - personal, like a journal

**Map**: Terrain - you see the mountains, feel the elevation

**Transport**: Car for the road portions, following real roads

**Feeling**: Warm, grounded, returning home

### Physical Companion

A printed photo album already exists - created as a birthday gift. The digital version is the shareable companion, the same photos brought to life with place and journey.

---

## The Gift Metaphor

Every shared trip is a gift:

1. **Wrapped** - Has an envelope, a sealed appearance
2. **Addressed** - "For Mom & Dad", "For [Name]"
3. **Unwrapped** - The unveiling animation IS the unwrapping
4. **Personal** - Made with love for specific people

The recipients might be:
- **People who were there** - They'll see themselves, remember moments
- **People who weren't** - They're getting the full story

Both experiences are valid. The gift works for both.

---

## Summary

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   THE DARKROOM          →        THE ADVENTURE              │
│   (craft)                        (experience)               │
│                                                             │
│   ┌─────────────┐               ┌─────────────────────┐    │
│   │             │               │                     │    │
│   │  Organize   │    publish    │  ✦ Unveiling ✦      │    │
│   │  Curate     │   ────────►   │                     │    │
│   │  Theme      │     gift      │  Explore │ Princess │    │
│   │  Craft      │               │                     │    │
│   │             │               │  Journey + Photos   │    │
│   └─────────────┘               │                     │    │
│                                 │  Chapters + Map     │    │
│   Craftsman                     │                     │    │
│   personality                   │  Playful & warm     │    │
│                                 │                     │    │
│                                 └─────────────────────┘    │
│                                                             │
│   Your workshop          →      Their gift to unwrap        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

*This vision document captures the brainstorming session of December 2024. It serves as the north star for building the trip theming system and the Colorado/Utah Homecoming trip specifically.*
