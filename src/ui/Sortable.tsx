import { useEffect, useRef, useState, type ReactNode } from 'react'

type Drag = { id: string; from: number; to: number; startY: number; dy: number; tops: number[]; mids: number[]; h: number; active: boolean }

/**
 * 長按一項、上下拖、放開：換順序。
 * 手指一按就移動算捲動頁面；按住 0.35 秒不動才「拿起來」，這時頁面不捲。
 */
export function Sortable<T extends { id: string }>({
  items,
  render,
  onMove,
}: {
  items: T[]
  render: (t: T, lifted: boolean) => ReactNode
  onMove: (ids: string[]) => void
}) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const ref = useRef<Drag | null>(null)
  const rows = useRef<(HTMLDivElement | null)[]>([])
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const set = (d: Drag | null) => {
    ref.current = d
    setDrag(d)
  }

  // 拿起來之後擋住頁面捲動（iOS 要用非 passive 的 touchmove）
  useEffect(() => {
    const stop = (e: TouchEvent) => {
      if (ref.current?.active) e.preventDefault()
    }
    document.addEventListener('touchmove', stop, { passive: false })
    return () => {
      document.removeEventListener('touchmove', stop)
      clearTimeout(timer.current)
    }
  }, [])

  const down = (e: React.PointerEvent, i: number) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const rects = rows.current.slice(0, items.length).map((r) => r?.getBoundingClientRect())
    const tops = rects.map((r) => r?.top ?? 0)
    const mids = rects.map((r) => (r ? r.top + r.height / 2 : 0))
    const h = rows.current[i]?.getBoundingClientRect().height ?? 56
    const d: Drag = { id: items[i].id, from: i, to: i, startY: e.clientY, dy: 0, tops, mids, h, active: false }
    ref.current = d
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (ref.current !== d) return
      navigator.vibrate?.(10)
      set({ ...d, active: true })
    }, 350)
  }
  const move = (e: React.PointerEvent) => {
    const d = ref.current
    if (!d) return
    const dy = e.clientY - d.startY
    if (!d.active) {
      if (Math.abs(dy) > 8) {
        clearTimeout(timer.current)
        ref.current = null
      }
      return
    }
    const mid = d.tops[d.from] + dy + d.h / 2
    // 拿起來那一項的中線越過幾項的中線，就排到第幾個
    const to = d.mids.filter((c, k) => k !== d.from && c < mid).length
    set({ ...d, dy, to })
  }
  const up = () => {
    clearTimeout(timer.current)
    const d = ref.current
    set(null)
    if (!d?.active || d.to === d.from) return
    const ids = items.map((x) => x.id)
    const [m] = ids.splice(d.from, 1)
    ids.splice(d.to, 0, m)
    onMove(ids)
  }

  return (
    <>
      {items.map((t, i) => {
        let y = 0
        if (drag?.active) {
          if (i === drag.from) y = drag.dy
          else if (drag.from < drag.to && i > drag.from && i <= drag.to) y = -drag.h
          else if (drag.to < drag.from && i >= drag.to && i < drag.from) y = drag.h
        }
        const lifted = Boolean(drag?.active && i === drag.from)
        return (
          <div
            key={t.id}
            ref={(el) => {
              rows.current[i] = el
            }}
            className={`sortrow ${lifted ? 'lifted' : ''} ${drag?.active && !lifted ? 'shifting' : ''}`}
            style={y ? { transform: `translateY(${y}px)` } : undefined}
            onPointerDown={(e) => down(e, i)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onContextMenu={(e) => e.preventDefault()}
          >
            {render(t, lifted)}
          </div>
        )
      })}
    </>
  )
}
