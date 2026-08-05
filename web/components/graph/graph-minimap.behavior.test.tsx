// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GraphMinimap } from './graph-minimap'

describe('图谱缩略图交互', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1)
    )
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('按显示尺寸换算点击位置，并与绘制共用留白边界', () => {
    const centerAt = vi.fn()
    const graphRef = {
      current: {
        getGraphBbox: () => ({ x: [0, 100], y: [0, 100] }),
        centerAt,
        zoom: () => 1,
      },
    }

    act(() => {
      root.render(
        <GraphMinimap
          graphRef={graphRef}
          data={{
            nodes: [
              { x: 0, y: 0 },
              { x: 100, y: 100 },
            ],
            links: [],
          }}
          graphWidth={800}
          graphHeight={600}
        />
      )
    })

    const canvas = container.querySelector('canvas')
    expect(canvas?.getAttribute('role')).toBe('button')
    expect(canvas?.getAttribute('aria-label')).toContain('图谱缩略图')
    vi.spyOn(canvas as HTMLCanvasElement, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 280,
      bottom: 200,
      width: 280,
      height: 200,
      toJSON: () => ({}),
    })

    act(() => {
      canvas?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 70, clientY: 50 }))
    })

    expect(centerAt).toHaveBeenCalledOnce()
    expect(centerAt.mock.calls[0]?.[0]).toBeCloseTo(9.4, 6)
    expect(centerAt.mock.calls[0]?.[1]).toBeCloseTo(21, 6)
    expect(centerAt.mock.calls[0]?.[2]).toBe(400)
  })

  it('键盘操作把图谱移动到缩略图中心', () => {
    const centerAt = vi.fn()
    const graphRef = {
      current: {
        getGraphBbox: () => ({ x: [-50, 150], y: [-20, 80] }),
        centerAt,
        zoom: () => 1,
      },
    }

    act(() => {
      root.render(
        <GraphMinimap
          graphRef={graphRef}
          data={{
            nodes: [
              { x: 0, y: 0 },
              { x: 100, y: 50 },
            ],
            links: [],
          }}
          graphWidth={800}
          graphHeight={600}
        />
      )
    })

    const canvas = container.querySelector('canvas')
    act(() => canvas?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })))

    expect(centerAt).toHaveBeenCalledWith(50, 30, 400)
  })

  it('页面隐藏时暂停重绘，恢复可见后继续', () => {
    const graphRef = {
      current: {
        getGraphBbox: () => ({ x: [0, 100], y: [0, 100] }),
        centerAt: vi.fn(),
        zoom: () => 1,
      },
    }

    act(() => {
      root.render(
        <GraphMinimap
          graphRef={graphRef}
          data={{ nodes: [{ x: 0, y: 0 }], links: [] }}
          graphWidth={800}
          graphHeight={600}
        />
      )
    })

    const requestFrame = vi.mocked(requestAnimationFrame)
    const cancelFrame = vi.mocked(cancelAnimationFrame)
    expect(requestFrame).toHaveBeenCalledTimes(1)

    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(cancelFrame).toHaveBeenCalledWith(1)

    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'visible',
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(requestFrame).toHaveBeenCalledTimes(2)
  })
})
