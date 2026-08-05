// @vitest-environment happy-dom

import React, { act } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { queryKeys } from '@/lib/query-keys'

const datasetApiMock = vi.hoisted(() => ({
  exportConfig: vi.fn(),
  get: vi.fn(),
  importConfig: vi.fn(),
}))
const guardState = vi.hoisted(() => ({ enabled: false }))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'dataset-1' }),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/lib/api', () => ({ datasetApi: datasetApiMock }))
vi.mock('@/lib/client-logging', () => ({ reportClientError: vi.fn() }))
vi.mock('@/components/app-frame', () => ({
  AppFrame: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-app-frame': 'true' }, children),
}))
vi.mock('@/components/datasets/dataset-detail-shell', () => ({
  DatasetDetailShell: ({
    children,
    actions,
  }: {
    children: React.ReactNode
    actions?: React.ReactNode
  }) => React.createElement('main', null, actions, children),
}))
vi.mock('@/components/workflow/workflow-editor', () => ({
  WorkflowEditor: ({
    workflowLayout,
    onWorkflowLayoutChange,
  }: {
    workflowLayout?: Record<string, unknown> | null
    onWorkflowLayoutChange: (layout: Record<string, unknown>) => void
  }) =>
    React.createElement(
      'div',
      {
        'data-workflow-editor': 'true',
        'data-layout': JSON.stringify(workflowLayout ?? null),
      },
      React.createElement(
        'button',
        { type: 'button', onClick: () => onWorkflowLayoutChange({ marker: 'layout-a' }) },
        '应用布局 A'
      ),
      React.createElement(
        'button',
        { type: 'button', onClick: () => onWorkflowLayoutChange({ marker: 'layout-b' }) },
        '应用布局 B'
      )
    ),
}))
vi.mock('@/hooks/use-unsaved-navigation-guard', () => ({
  useUnsavedNavigationGuard: ({ enabled }: { enabled: boolean }) => {
    guardState.enabled = enabled
    return {
      cancelNavigation: vi.fn(),
      confirmNavigation: vi.fn(),
      navigationPending: false,
      requestNavigation: vi.fn(),
    }
  },
}))
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import DatasetWorkflowPage from './page'

const SERVER_EXPORT = {
  version: 'version-1',
  dataset_id: 'dataset-1',
  name: '客户知识库',
  exported_at: '2026-08-05T10:00:00Z',
  config: {
    workflow_layout: { marker: 'server-layout' },
  },
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
}

function renderPage(queryClient = createTestQueryClient()) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <DatasetWorkflowPage />
      </QueryClientProvider>
    )
  })

  return { container, root }
}

function findButton(scope: ParentNode, label: string): HTMLButtonElement {
  const button = Array.from(scope.querySelectorAll<HTMLButtonElement>('button')).find((item) =>
    item.textContent?.includes(label)
  )
  expect(button, `未找到按钮：${label}`).not.toBeUndefined()
  return button as HTMLButtonElement
}

beforeEach(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  guardState.enabled = false
  datasetApiMock.get.mockReset()
  datasetApiMock.exportConfig.mockReset()
  datasetApiMock.importConfig.mockReset()
  datasetApiMock.get.mockResolvedValue({ id: 'dataset-1', name: '客户知识库' })
  datasetApiMock.exportConfig.mockResolvedValue(SERVER_EXPORT)
  datasetApiMock.importConfig.mockResolvedValue({ id: 'dataset-1', name: '客户知识库' })
})

afterEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

describe('工作流配置请求状态', () => {
  it('首次配置请求失败时显示错误并可就地重试', async () => {
    datasetApiMock.exportConfig.mockRejectedValueOnce(new Error('service unavailable'))
    const { container, root } = renderPage()

    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('无法加载工作流配置'))
    })
    expect(container.querySelector('[data-workflow-editor]')).toBeNull()

    act(() => findButton(container, '重新加载').click())
    await act(async () => {
      await vi.waitFor(() => {
        const editor = container.querySelector('[data-workflow-editor]')
        expect(editor, container.textContent || '工作流页面没有可见文本').not.toBeNull()
      })
    })

    act(() => root.unmount())
  })

  it('后台刷新失败时保留画布和上次配置', async () => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(queryKeys.datasets.config('dataset-1'), SERVER_EXPORT)
    datasetApiMock.exportConfig.mockRejectedValueOnce(new Error('refresh failed'))
    const { container, root } = renderPage(queryClient)

    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('刷新工作流配置失败'))
    })
    const editor = container.querySelector<HTMLElement>('[data-workflow-editor]')
    expect(editor?.dataset.layout).toContain('server-layout')

    act(() => {
      findButton(container, '应用布局 A').click()
      findButton(container, '重新加载').click()
    })
    await act(async () => {
      await vi.waitFor(() => expect(datasetApiMock.exportConfig).toHaveBeenCalledTimes(2))
    })
    expect(
      container.querySelector<HTMLElement>('[data-workflow-editor]')?.dataset.layout
    ).toContain('layout-a')
    expect(container.textContent).toContain('有未保存更改')

    act(() => root.unmount())
  })

  it('保存期间产生的新布局不会被已提交快照覆盖', async () => {
    let resolveImport: ((value: { id: string; name: string }) => void) | undefined
    datasetApiMock.importConfig.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveImport = resolve
      })
    )
    const { container, root } = renderPage()

    await act(async () => {
      await vi.waitFor(() => {
        const editor = container.querySelector('[data-workflow-editor]')
        expect(editor, container.textContent || '工作流页面没有可见文本').not.toBeNull()
      })
    })
    act(() => findButton(container, '应用布局 A').click())
    act(() => findButton(container, '保存布局').click())
    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('正在保存'))
    })
    expect(guardState.enabled).toBe(true)

    act(() => findButton(container, '应用布局 B').click())
    await act(async () => {
      resolveImport?.({ id: 'dataset-1', name: '客户知识库' })
      await vi.waitFor(() => expect(container.textContent).not.toContain('正在保存'))
    })

    expect(datasetApiMock.importConfig).toHaveBeenCalledWith(
      'dataset-1',
      expect.objectContaining({
        config: expect.objectContaining({ workflow_layout: { marker: 'layout-a' } }),
      })
    )
    expect(
      container.querySelector<HTMLElement>('[data-workflow-editor]')?.dataset.layout
    ).toContain('layout-b')
    expect(container.textContent).toContain('有未保存更改')

    act(() => root.unmount())
  })

  it('保存失败时保留布局并隐藏后端内部异常', async () => {
    let rejectImport: ((reason: Error) => void) | undefined
    datasetApiMock.importConfig.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectImport = reject
      })
    )
    const { container, root } = renderPage()

    await act(async () => {
      await vi.waitFor(() => {
        const editor = container.querySelector('[data-workflow-editor]')
        expect(editor, container.textContent || '工作流页面没有可见文本').not.toBeNull()
      })
    })
    act(() => findButton(container, '应用布局 A').click())
    act(() => findButton(container, '保存布局').click())
    await act(async () => {
      await vi.waitFor(() => expect(datasetApiMock.importConfig).toHaveBeenCalledTimes(1))
      rejectImport?.(new Error('postgresql://internal-user:internal-password@db:5432'))
      await Promise.resolve()
    })
    await vi.waitFor(() =>
      expect(container.textContent).toContain('保存工作流布局失败，请稍后重试')
    )

    expect(container.textContent).not.toContain('internal-password')
    expect(
      container.querySelector<HTMLElement>('[data-workflow-editor]')?.dataset.layout
    ).toContain('layout-a')
    expect(container.textContent).toContain('有未保存更改')

    act(() => root.unmount())
  })
})
