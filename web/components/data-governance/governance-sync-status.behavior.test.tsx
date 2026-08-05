// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const messages: Record<string, string> = {
  errorTitle: '治理文档加载失败',
  errorDescription: '两个来源都无法读取',
  errorWithFiles: '当前列表保留最近一次同步结果',
  partialTitle: '部分文档暂未同步',
  partialKnowledgeBase: '知识库文档暂时无法读取',
  partialParsingWorkspace: '解析工作区暂时无法读取',
  retry: '重新加载',
  retrying: '重新加载中…',
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => messages[key] || key,
}))

import { GovernanceSyncStatus } from './governance-sync-status'

describe('治理文档同步状态', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

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
    container.remove()
  })

  it('单源失败时说明缺失范围并允许重新加载', () => {
    const onRetry = vi.fn()

    act(() => {
      root.render(
        <GovernanceSyncStatus
          failedSources={['knowledge_base']}
          hasFiles
          isError={false}
          isFetching={false}
          onRetry={onRetry}
        />
      )
    })

    expect(container.querySelector('[role="status"]')?.textContent).toContain('部分文档暂未同步')
    expect(container.textContent).toContain('知识库文档暂时无法读取')

    act(() => {
      container.querySelector('button')?.click()
    })
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('双源失败时显示错误，并说明现有列表不是最新结果', () => {
    act(() => {
      root.render(
        <GovernanceSyncStatus
          failedSources={[]}
          hasFiles
          isError
          isFetching={false}
          onRetry={() => undefined}
        />
      )
    })

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('治理文档加载失败')
    expect(container.textContent).toContain('当前列表保留最近一次同步结果')
  })

  it('重新同步成功后清除警告', () => {
    act(() => {
      root.render(
        <GovernanceSyncStatus
          failedSources={['parsing_workspace']}
          hasFiles={false}
          isError={false}
          isFetching={false}
          onRetry={() => undefined}
        />
      )
    })
    expect(container.querySelector('[role="status"]')).not.toBeNull()

    act(() => {
      root.render(
        <GovernanceSyncStatus
          failedSources={[]}
          hasFiles={false}
          isError={false}
          isFetching={false}
          onRetry={() => undefined}
        />
      )
    })
    expect(container.querySelector('[role="status"]')).toBeNull()
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })
})
