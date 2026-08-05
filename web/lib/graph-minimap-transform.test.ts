import { describe, expect, it } from 'vitest'

import { computeGraphMinimapTransform } from './graph-minimap-transform'

describe('图谱缩略图坐标变换', () => {
  it('优先使用图谱边界并保留统一留白', () => {
    const transform = computeGraphMinimapTransform({
      graphBbox: { x: [0, 100], y: [-50, 50] },
      nodePositions: [{ x: 20, y: 20 }],
      canvasWidth: 200,
      canvasHeight: 100,
    })

    expect(transform?.bounds).toEqual({ xmin: -8, xmax: 108, ymin: -58, ymax: 58 })
  })

  it('图谱边界无效时回退到节点位置', () => {
    const transform = computeGraphMinimapTransform({
      graphBbox: { x: [0, 0], y: [0, 0] },
      nodePositions: [
        { x: -20, y: -10 },
        { x: 80, y: 90 },
      ],
      canvasWidth: 140,
      canvasHeight: 100,
      paddingRatio: 0,
    })

    expect(transform?.bounds).toEqual({ xmin: -20, xmax: 80, ymin: -10, ymax: 90 })
  })

  it('正向与反向变换使用同一坐标系', () => {
    const transform = computeGraphMinimapTransform({
      graphBbox: { x: [-120, 240], y: [-80, 160] },
      nodePositions: [],
      canvasWidth: 160,
      canvasHeight: 100,
    })
    const graphPoint = { x: 60, y: 20 }
    const restored = transform?.toGraph(transform.toCanvas(graphPoint))

    expect(restored?.x).toBeCloseTo(graphPoint.x, 8)
    expect(restored?.y).toBeCloseTo(graphPoint.y, 8)
  })

  it('点击画布留白时把结果限制在图谱边界内', () => {
    const transform = computeGraphMinimapTransform({
      graphBbox: { x: [0, 100], y: [0, 20] },
      nodePositions: [],
      canvasWidth: 100,
      canvasHeight: 100,
      paddingRatio: 0,
    })

    expect(transform?.toGraph({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
    expect(transform?.toGraph({ x: 100, y: 100 })).toEqual({ x: 100, y: 20 })
  })

  it('单节点或无效画布不创建可交互变换', () => {
    expect(
      computeGraphMinimapTransform({
        nodePositions: [{ x: 1, y: 1 }],
        canvasWidth: 140,
        canvasHeight: 100,
      })
    ).toBeNull()
    expect(
      computeGraphMinimapTransform({
        graphBbox: { x: [0, 10], y: [0, 10] },
        nodePositions: [],
        canvasWidth: 0,
        canvasHeight: 100,
      })
    ).toBeNull()
  })
})
