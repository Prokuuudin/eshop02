const COLORS = ['#4f46e5', '#10b981', '#ec4899', '#f59e0b', '#f97316', '#14b8a6', '#e11d48']
const COUNT = 7

export function burstConfetti(originEl: HTMLElement): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const rect = originEl.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2

  for (let i = 0; i < COUNT; i++) {
    const angle = (i / COUNT) * 360
    const rad = (angle * Math.PI) / 180
    const dist = 55 + Math.random() * 35
    const tx = Math.round(Math.cos(rad) * dist)
    const ty = Math.round(Math.sin(rad) * dist)
    const color = COLORS[i % COLORS.length]

    const span = document.createElement('span')
    span.className = 'confetti-particle'
    span.style.cssText = [
      `left:${cx - 4}px`,
      `top:${cy - 4}px`,
      `background:${color}`,
      `--tx:${tx}px`,
      `--ty:${ty}px`,
    ].join(';')
    document.body.appendChild(span)
    span.addEventListener('animationend', () => span.remove(), { once: true })
  }
}
