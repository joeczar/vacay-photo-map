import { onBeforeUnmount, ref } from 'vue'

// Lightweight average color extractor + accent setter
// Produces an HSL string compatible with Tailwind's hsl(var(--accent))

export function useAccentColor() {
  const previous = ref<string | null>(null)

  function setAccentHsl(hsl: string) {
    const root = document.documentElement
    if (previous.value === null) previous.value = root.style.getPropertyValue('--accent')
    root.style.setProperty('--accent', hsl)
    // Ring follows accent for coherence
    root.style.setProperty('--ring', hsl)
  }

  // Compute a perceptual average color in HSL and nudge saturation/ lightness
  async function setAccentFromImage(url: string, sampleSize = 24) {
    if (!url) return
    try {
      const img = await loadImage(url)
      const { r, g, b } = averageColor(img, sampleSize)
      const { h, s, l } = rgbToHsl(r, g, b)
      // Nudge saturation and lightness to keep it lively but safe
      const s2 = clamp(s * 1.2, 0.25, 0.75)
      const l2 = clamp(l * 0.95, 0.25, 0.7)
      setAccentHsl(`${Math.round(h)} ${Math.round(s2 * 100)}% ${Math.round(l2 * 100)}%`)
    } catch {
      /* no-op on failure */
    }
  }

  function resetAccent() {
    if (previous.value !== null) {
      document.documentElement.style.setProperty('--accent', previous.value)
      document.documentElement.style.setProperty('--ring', previous.value)
      previous.value = null
    }
  }

  onBeforeUnmount(resetAccent)

  return { setAccentHsl, setAccentFromImage, resetAccent }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function averageColor(img: HTMLImageElement, sampleSize = 24) {
  const canvas = document.createElement('canvas')
  const w = (canvas.width = sampleSize)
  const h = (canvas.height = sampleSize)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h).data
  let r = 0, g = 0, b = 0, count = 0
  for (let i = 0; i < data.length; i += 4) {
    const R = data[i], G = data[i + 1], B = data[i + 2], A = data[i + 3]
    if (A < 200) continue // skip very transparent
    // skip near-white and near-black to avoid washed accents
    const max = Math.max(R, G, B)
    const min = Math.min(R, G, B)
    if (max > 245 || min < 10) continue
    r += R; g += G; b += B; count++
  }
  if (!count) return { r: 120, g: 120, b: 120 }
  return { r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) }
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0, l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h /= 6
  }
  return { h: h * 360, s, l }
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

