// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { GraphLoadingIndicator } from './graph-loading-indicator'

describe('图谱加载状态', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    document.body.innerHTML = ''
  })

  it('使用中文默认文案并播报加载状态', () => {
    act(() => root.render(<GraphLoadingIndicator />))

    const status = container.querySelector('[role="status"]')
    expect(status?.getAttribute('aria-live')).toBe('polite')
    expect(status?.textContent).toContain('正在加载图谱')
    expect(status?.querySelector('svg')?.getAttribute('aria-hidden')).toBe(
      'true'
    )
  })

  it('展示调用方提供的进度说明', () => {
    act(() =>
      root.render(
        <GraphLoadingIndicator
          message="正在构建关系图"
          srMessage="关系图正在构建"
          hint="正在整理节点位置"
        />
      )
    )

    expect(container.textContent).toContain('正在构建关系图')
    expect(container.textContent).toContain('正在整理节点位置')
    expect(container.textContent).toContain('关系图正在构建')
  })
})
