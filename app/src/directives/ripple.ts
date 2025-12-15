import type { DirectiveBinding } from 'vue'

const prefersReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

type RippleHandler = (e: PointerEvent | MouseEvent | TouchEvent) => void
const rippleHandlers = new WeakMap<HTMLElement, RippleHandler>()

function getClientX(e: PointerEvent | MouseEvent | TouchEvent): number {
  return 'touches' in e ? e.touches[0].clientX : e.clientX
}

function getClientY(e: PointerEvent | MouseEvent | TouchEvent): number {
  return 'touches' in e ? e.touches[0].clientY : e.clientY
}

export const ripple = {
  mounted(el: HTMLElement, binding: DirectiveBinding<string>) {
    el.style.position ||= 'relative'
    el.style.overflow ||= 'hidden'
    const color = binding.value || 'currentColor'

    function onPointerDown(e: PointerEvent | MouseEvent | TouchEvent) {
      if (prefersReduced()) return
      const rect = el.getBoundingClientRect()
      const x = getClientX(e) - rect.left
      const y = getClientY(e) - rect.top
      const maxDim = Math.max(rect.width, rect.height)
      const rippleEl = document.createElement('span')
      const size = maxDim * 1.25
      Object.assign(rippleEl.style, {
        position: 'absolute',
        left: `${x - size / 2}px`,
        top: `${y - size / 2}px`,
        width: `${size}px`,
        height: `${size}px`,
        background: `color-mix(in oklab, ${color} 20%, transparent)`,
        borderRadius: '9999px',
        pointerEvents: 'none',
        transform: 'scale(0.5)',
        opacity: '0.0',
        transition: 'transform 500ms cubic-bezier(.22,1,.36,1), opacity 600ms ease-out'
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

    rippleHandlers.set(el, onPointerDown)
    el.addEventListener('pointerdown', onPointerDown, { passive: true })
    el.addEventListener('touchstart', onPointerDown, { passive: true })
  },
  unmounted(el: HTMLElement) {
    const handler = rippleHandlers.get(el)
    if (handler) {
      el.removeEventListener('pointerdown', handler)
      el.removeEventListener('touchstart', handler)
      rippleHandlers.delete(el)
    }
  }
}

export default ripple
