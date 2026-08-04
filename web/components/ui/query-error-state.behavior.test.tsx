// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { QueryErrorState } from './query-error-state'

describe('数据加载错误状态', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean
      }
    ).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('展示错误原因并允许重新加载', () => {
    const onRetry = vi.fn()
    act(() => {
      root.render(
        <QueryErrorState
          title="成员列表加载失败"
          description="服务暂时不可用，请稍后再试。"
          onRetry={onRetry}
        />
      )
    })

    const alert = container.querySelector('[role="alert"]')
    const retryButton = container.querySelector('button')
    expect(alert?.textContent).toContain('成员列表加载失败')
    expect(alert?.textContent).toContain('服务暂时不可用，请稍后再试。')
    expect(retryButton?.textContent).toContain('重新加载')

    act(() => retryButton?.click())
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('重新加载期间禁用重复操作', () => {
    act(() => {
      root.render(
        <QueryErrorState
          title="邀请列表加载失败"
          description="请求超时。"
          onRetry={vi.fn()}
          retrying
        />
      )
    })

    const retryButton = container.querySelector('button')
    expect(retryButton?.textContent).toContain('重新加载中…')
    expect(retryButton).toHaveProperty('disabled', true)
  })
})
