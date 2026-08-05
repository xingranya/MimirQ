'use client'

import { useCallback, useEffect, useMemo, useRef, type KeyboardEvent, type MouseEvent } from 'react'

import { computeGraphMinimapTransform, type GraphMinimapPoint } from '@/lib/graph-minimap-transform'
import { cn } from '@/lib/utils'

type GraphMinimapProps = {
  readonly graphRef: Readonly<{ current?: GraphMinimapHandle | null }>
  readonly data: {
    nodes: GraphMinimapNode[]
    links: unknown[]
  }
  readonly graphWidth: number
  readonly graphHeight: number
  readonly isDark?: boolean
  readonly className?: string
  readonly width?: number
  readonly height?: number
}

type GraphMinimapNode = {
  readonly x?: unknown
  readonly y?: unknown
}

type GraphBbox = {
  readonly x?: readonly unknown[]
  readonly y?: readonly unknown[]
}

type GraphMinimapHandle = {
  readonly getGraphBbox?: () => GraphBbox | null | undefined
  readonly centerAt?: (x?: number, y?: number, ms?: number) => unknown
  readonly zoom?: () => unknown
}

function safeNumber(value: unknown, fallback: number): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function clampCanvasCoordinate(value: number, limit: number): number {
  return Math.min(limit, Math.max(0, value))
}

export function GraphMinimap({
  graphRef,
  data,
  graphWidth,
  graphHeight,
  isDark = false,
  className,
  width = 140,
  height = 100,
}: GraphMinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const nodePositions = useMemo(() => {
    const positions: GraphMinimapPoint[] = []
    for (const node of data.nodes || []) {
      const x = safeNumber(node?.x, Number.NaN)
      const y = safeNumber(node?.y, Number.NaN)
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      positions.push({ x, y })
    }
    return positions
  }, [data.nodes])

  const getTransform = useCallback(() => {
    const canvas = canvasRef.current
    const graph = graphRef.current
    if (!canvas || !graph) return null

    let graphBbox: GraphBbox | null = null
    try {
      graphBbox = graph.getGraphBbox?.() ?? null
    } catch {
      // 图布局尚未稳定时，坐标变换会自动回退到节点位置。
    }

    return computeGraphMinimapTransform({
      graphBbox,
      nodePositions,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
    })
  }, [graphRef, nodePositions])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const graph = graphRef.current
    if (!canvas || !graph || !graphWidth || !graphHeight) return

    const context = canvas.getContext('2d')
    if (!context) return

    const transform = getTransform()
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = isDark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.98)'
    context.fillRect(0, 0, canvas.width, canvas.height)
    if (!transform) return

    context.fillStyle = isDark ? 'rgba(148, 163, 184, 0.72)' : 'rgba(71, 85, 105, 0.62)'
    for (const point of nodePositions) {
      const canvasPoint = transform.toCanvas(point)
      context.fillRect(canvasPoint.x - 1, canvasPoint.y - 1, 2, 2)
    }

    let center = { x: 0, y: 0 }
    let zoom = 1
    try {
      const currentCenter = graph.centerAt?.()
      if (
        currentCenter &&
        typeof currentCenter === 'object' &&
        'x' in currentCenter &&
        'y' in currentCenter
      ) {
        center = {
          x: safeNumber(currentCenter.x, center.x),
          y: safeNumber(currentCenter.y, center.y),
        }
      }
      zoom = safeNumber(graph.zoom?.(), 1)
    } catch {
      // 图谱实例切换期间保留默认视口，下一帧会重新读取。
    }
    zoom = Math.max(0.1, zoom)

    const topLeft = transform.toCanvas({
      x: center.x - graphWidth / (2 * zoom),
      y: center.y - graphHeight / (2 * zoom),
    })
    const bottomRight = transform.toCanvas({
      x: center.x + graphWidth / (2 * zoom),
      y: center.y + graphHeight / (2 * zoom),
    })
    const left = clampCanvasCoordinate(Math.min(topLeft.x, bottomRight.x), canvas.width)
    const right = clampCanvasCoordinate(Math.max(topLeft.x, bottomRight.x), canvas.width)
    const top = clampCanvasCoordinate(Math.min(topLeft.y, bottomRight.y), canvas.height)
    const bottom = clampCanvasCoordinate(Math.max(topLeft.y, bottomRight.y), canvas.height)

    context.strokeStyle = isDark ? 'rgba(56, 189, 248, 0.95)' : 'rgba(2, 132, 199, 0.95)'
    context.lineWidth = 1
    context.strokeRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top))
  }, [getTransform, graphHeight, graphRef, graphWidth, isDark, nodePositions])

  useEffect(() => {
    let animationFrame = 0
    let lastDrawAt = 0

    const tick = (timestamp: number) => {
      if (timestamp - lastDrawAt > 140) {
        lastDrawAt = timestamp
        draw()
      }
      animationFrame = requestAnimationFrame(tick)
    }

    animationFrame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animationFrame)
  }, [draw])

  const centerGraphAtCanvasPoint = useCallback(
    (canvasPoint: GraphMinimapPoint) => {
      const graphPoint = getTransform()?.toGraph(canvasPoint)
      if (!graphPoint) return
      graphRef.current?.centerAt?.(graphPoint.x, graphPoint.y, 400)
    },
    [getTransform, graphRef]
  )

  const handleClick = useCallback(
    (event: MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      centerGraphAtCanvasPoint({
        x: ((event.clientX - rect.left) / rect.width) * canvas.width,
        y: ((event.clientY - rect.top) / rect.height) * canvas.height,
      })
    },
    [centerGraphAtCanvasPoint]
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLCanvasElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      const canvas = canvasRef.current
      if (!canvas) return
      event.preventDefault()
      centerGraphAtCanvasPoint({ x: canvas.width / 2, y: canvas.height / 2 })
    },
    [centerGraphAtCanvasPoint]
  )

  return (
    <div className={cn('max-w-full rounded-md border border-border bg-background', className)}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        role="button"
        tabIndex={0}
        className="block h-auto max-w-full cursor-crosshair rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        aria-label="图谱缩略图，点击定位，按回车居中"
      />
    </div>
  )
}
