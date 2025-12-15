import type { DirectiveBinding } from 'vue'

const prefersReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const ripple = {
  mounted(el: HTMLElement, binding: DirectiveBinding<string>) {
    el.style.position ||= 'relative'
    el.style.overflow ||= 'hidden'
    const color = binding.value || 'currentColor'

    function onPointerDown(e: PointerEvent | MouseEvent | TouchEvent) {
      if (prefersReduced()) return
      const rect = el.getBoundingClientRect()
      const x = ('touches' in e ? e.touches[0].clientX : (e as any).clientX) - rect.left
      const y = ('touches' in e ? e.touches[0].clientY : (e as any).clientY) - rect.top
      const maxDim = Math.max(rect.width, rect.height)
      const rippleEl = document.createElement('span')
      const size = maxDim * 1.25
      Object.assign(rippleEl.style, {
        position: 'absolute',
        left: `${x - size / 2}px`,
        top: `${y - size / 2}px`,
        width: `${size}px`,
        height: `${size}px`,
        background: `color-mix(in oklab, ${color} 20%, transparent)` ,
        borderRadius: '9999px',
        pointerEvents: 'none',
        transform: 'scale(0.5)',
        opacity: '0.0',
        transition: 'transform 500ms cubic-bezier(.22,1,.36,1), opacity 600ms ease-out',
      } as CSSStyleDeclaration)
      el.appendChild(rippleEl)
      requestAnimationFrame(() => {
        rippleEl.style.opacity = '0.45'
        rippleEl.style.transform = 'scale(1)'
      })
      setTimeout(() => {
        rippleEl.style.opacity = '0'
        setTimeout(() => rippleEl.remove(), 300)
      }, 250)
    }

    ;(el as any).__rippleHandler__ = onPointerDown
    el.addEventListener('pointerdown', onPointerDown, { passive: true })
    el.addEventListener('touchstart', onPointerDown, { passive: true })
  },
  unmounted(el: HTMLElement) {
    const handler = (el as any).__rippleHandler__
    if (handler) {
      el.removeEventListener('pointerdown', handler)
      el.removeEventListener('touchstart', handler)
      delete (el as any).__rippleHandler__
    }
  },
}

export default ripple
