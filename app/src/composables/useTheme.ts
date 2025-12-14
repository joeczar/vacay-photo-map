import { watchEffect, type Ref, isRef } from 'vue'

export type Theme = 'vogue' | 'outdoorsy' | 'scrapbook'

const THEMES: Theme[] = ['vogue', 'outdoorsy', 'scrapbook']

export function useTheme(themeStart: Theme | string | Ref<string | undefined>) {
  
  const applyTheme = (t: string | undefined) => {
    // Remove all existing theme classes
    document.body.classList.remove(...THEMES.map(theme => `theme-${theme}`))
    
    // Add new theme class (fallback to vogue if invalid or missing)
    const newTheme = t && THEMES.includes(t as Theme) ? t : 'vogue'
    document.body.classList.add(`theme-${newTheme}`)
  }

  watchEffect(() => {
    const rawTheme = isRef(themeStart) ? themeStart.value : themeStart
    applyTheme(rawTheme)
  })
}
