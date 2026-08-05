export type GraphMinimapPoint = Readonly<{
  x: number
  y: number
}>

export type GraphMinimapBounds = Readonly<{
  xmin: number
  xmax: number
  ymin: number
  ymax: number
}>

type GraphBbox =
  | Readonly<{
      x?: readonly unknown[]
      y?: readonly unknown[]
    }>
  | null
  | undefined

type GraphMinimapTransformArgs = Readonly<{
  graphBbox?: GraphBbox
  nodePositions: readonly GraphMinimapPoint[]
  canvasWidth: number
  canvasHeight: number
  paddingRatio?: number
}>

export type GraphMinimapTransform = Readonly<{
  bounds: GraphMinimapBounds
  toCanvas: (point: GraphMinimapPoint) => GraphMinimapPoint
  toGraph: (point: GraphMinimapPoint) => GraphMinimapPoint
}>

function finiteNumber(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function boundsFromGraphBbox(graphBbox: GraphBbox): GraphMinimapBounds | null {
  if (!Array.isArray(graphBbox?.x) || !Array.isArray(graphBbox?.y)) return null
  const xmin = finiteNumber(graphBbox.x[0])
  const xmax = finiteNumber(graphBbox.x[1])
  const ymin = finiteNumber(graphBbox.y[0])
  const ymax = finiteNumber(graphBbox.y[1])
  if (xmin == null || xmax == null || ymin == null || ymax == null) return null
  if (xmax <= xmin || ymax <= ymin) return null
  return { xmin, xmax, ymin, ymax }
}

function boundsFromNodes(nodePositions: readonly GraphMinimapPoint[]): GraphMinimapBounds | null {
  let xmin = Number.POSITIVE_INFINITY
  let xmax = Number.NEGATIVE_INFINITY
  let ymin = Number.POSITIVE_INFINITY
  let ymax = Number.NEGATIVE_INFINITY

  for (const point of nodePositions) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
    xmin = Math.min(xmin, point.x)
    xmax = Math.max(xmax, point.x)
    ymin = Math.min(ymin, point.y)
    ymax = Math.max(ymax, point.y)
  }

  if (![xmin, xmax, ymin, ymax].every(Number.isFinite)) return null
  if (xmax <= xmin || ymax <= ymin) return null
  return { xmin, xmax, ymin, ymax }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function computeGraphMinimapTransform({
  graphBbox,
  nodePositions,
  canvasWidth,
  canvasHeight,
  paddingRatio = 0.08,
}: GraphMinimapTransformArgs): GraphMinimapTransform | null {
  if (!Number.isFinite(canvasWidth) || !Number.isFinite(canvasHeight)) return null
  if (canvasWidth <= 0 || canvasHeight <= 0) return null

  const rawBounds = boundsFromGraphBbox(graphBbox) ?? boundsFromNodes(nodePositions)
  if (!rawBounds) return null

  const normalizedPadding = Number.isFinite(paddingRatio) ? clamp(paddingRatio, 0, 0.45) : 0.08
  const spanX = rawBounds.xmax - rawBounds.xmin
  const spanY = rawBounds.ymax - rawBounds.ymin
  const padX = spanX * normalizedPadding
  const padY = spanY * normalizedPadding
  const bounds = {
    xmin: rawBounds.xmin - padX,
    xmax: rawBounds.xmax + padX,
    ymin: rawBounds.ymin - padY,
    ymax: rawBounds.ymax + padY,
  }
  const paddedSpanX = bounds.xmax - bounds.xmin
  const paddedSpanY = bounds.ymax - bounds.ymin
  const scale = Math.min(canvasWidth / paddedSpanX, canvasHeight / paddedSpanY)
  if (!Number.isFinite(scale) || scale <= 0) return null

  const offsetX = (canvasWidth - paddedSpanX * scale) / 2
  const offsetY = (canvasHeight - paddedSpanY * scale) / 2

  return {
    bounds,
    toCanvas: (point) => ({
      x: offsetX + (point.x - bounds.xmin) * scale,
      y: offsetY + (point.y - bounds.ymin) * scale,
    }),
    toGraph: (point) => ({
      x: clamp(bounds.xmin + (point.x - offsetX) / scale, bounds.xmin, bounds.xmax),
      y: clamp(bounds.ymin + (point.y - offsetY) / scale, bounds.ymin, bounds.ymax),
    }),
  }
}
