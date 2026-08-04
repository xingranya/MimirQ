// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PrecheckSummaryStatus } from './precheck-summary-status'

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
const retrySummary = vi.fn()

async function renderStatus(
  props: Partial<React.ComponentProps<typeof PrecheckSummaryStatus>> = {}
) {
  await act(async () => {
    root.render(
      <PrecheckSummaryStatus
        loading={false}
        errorMessage=""
        hasSummary={false}
        runStatus="completed"
        onRetry={retrySummary}
        {...props}
      />
    )
  })
}

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('预检摘要状态', () => {
  it('加载失败时显示错误和重试，不显示零值空状态', async () => {
    await renderStatus({ errorMessage: '服务器返回 500' })

    expect(container.textContent).toContain('摘要加载失败')
    expect(container.textContent).toContain('服务器返回 500')
    expect(container.textContent).not.toContain('暂无数据')
    expect(container.textContent).not.toContain('文件总数')
    expect(container.textContent).not.toContain('P50 长度')

    const button = container.querySelector('button')
    expect(button?.textContent).toContain('重试摘要')
    act(() => button?.click())
    expect(retrySummary).toHaveBeenCalledOnce()
  })

  it('刷新失败时说明继续显示已有摘要', async () => {
    await renderStatus({
      hasSummary: true,
      errorMessage: '网络连接中断',
    })

    expect(container.textContent).toContain('摘要刷新失败')
    expect(container.textContent).toContain('当前仍显示上次加载的摘要')
  })

  it('加载中和扫描中使用不同提示', async () => {
    await renderStatus({ loading: true })
    expect(container.textContent).toContain('正在加载扫描摘要')

    await renderStatus({ runStatus: 'running' })
    expect(container.textContent).toContain('扫描完成后会显示')
  })
})
