// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { QuerySnapshotState } from './query-snapshot-state'

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>

async function renderState(
  props: Partial<React.ComponentProps<typeof QuerySnapshotState>> = {}
) {
  await act(async () => {
    root.render(
      <QuerySnapshotState
        areaName="表格资产"
        errorMessage={null}
        hasSnapshot={false}
        loading={true}
        onRetry={vi.fn()}
        {...props}
      >
        <div>已有表格数据</div>
      </QuerySnapshotState>
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
  container.remove()
  vi.clearAllMocks()
})

describe('查询快照状态', () => {
  it('首次加载期间不提前渲染空数据', async () => {
    await renderState()

    expect(container.textContent).toContain('正在加载表格资产')
    expect(container.textContent).not.toContain('已有表格数据')
  })

  it('首次加载失败时提供重试且不渲染数据区', async () => {
    const retry = vi.fn()
    await renderState({
      errorMessage: '服务器暂时不可用。',
      loading: false,
      onRetry: retry,
    })

    expect(container.textContent).toContain('表格资产加载失败')
    expect(container.textContent).toContain('服务器暂时不可用。')
    expect(container.textContent).not.toContain('已有表格数据')

    act(() => container.querySelector('button')?.click())
    expect(retry).toHaveBeenCalledOnce()
  })

  it('刷新失败时保留已有数据并说明当前状态', async () => {
    await renderState({
      errorMessage: '网络连接中断。',
      hasSnapshot: true,
      loading: false,
    })

    expect(container.textContent).toContain('表格资产刷新失败')
    expect(container.textContent).toContain('当前仍显示上次加载的数据')
    expect(container.textContent).toContain('已有表格数据')
  })
})
