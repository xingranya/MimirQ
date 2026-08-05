// @vitest-environment happy-dom

import React, { act } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { queryKeys } from '@/lib/query-keys'

const datasetApiMock = vi.hoisted(() => ({
  askTable: vi.fn(),
  get: vi.fn(),
  getTable: vi.fn(),
  listTables: vi.fn(),
  lotusSemFilter: vi.fn(),
  queryTable: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'dataset-1' }),
}))
vi.mock('@/lib/api', () => ({ datasetApi: datasetApiMock }))
vi.mock('@/lib/client-logging', () => ({ reportClientError: vi.fn() }))
vi.mock('@/components/app-frame', () => ({
  AppFrame: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-app-frame': 'true' }, children),
}))
vi.mock('@/components/datasets/dataset-detail-shell', () => ({
  DatasetDetailShell: ({ children }: { children: React.ReactNode }) =>
    React.createElement('main', null, children),
}))
vi.mock('@/i18n/navigation', () => ({
  Link: (props: React.ComponentProps<'a'>) => React.createElement('a', props),
}))

import DatasetTablesPage from './page'

const TABLE_SUMMARY = {
  table_id: 'table-1',
  document_id: 'document-1',
  document_filename: 'customers.xlsx',
  sheet_index: 0,
  sheet_name: '客户明细',
  row_count: 20,
  col_count: 2,
  truncated: false,
  columns: [],
  sample_rows: [],
}

const TABLE_DETAIL = {
  ...TABLE_SUMMARY,
  columns: [
    { name: 'customer_name', dtype: 'string' },
    { name: 'region', dtype: 'string' },
  ],
  sample_rows: [{ customer_name: '见外传媒', region: '华东' }],
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
        <DatasetTablesPage />
      </QueryClientProvider>
    )
  })

  return { container, queryClient, root }
}

beforeEach(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  datasetApiMock.get.mockResolvedValue({ id: 'dataset-1', name: '客户知识库' })
  datasetApiMock.listTables.mockResolvedValue({ total: 0, items: [] })
  datasetApiMock.getTable.mockResolvedValue(TABLE_DETAIL)
})

afterEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

describe('数据集表格资产请求状态', () => {
  it('首次列表请求失败时显示错误和重试，不伪装成空资产', async () => {
    datasetApiMock.listTables.mockRejectedValueOnce(new Error('network unavailable'))
    const { container, root } = renderPage()

    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('无法加载表格资产'))
    })
    expect(container.textContent).not.toContain('暂无表格资产')

    const retryButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('重新加载')
    )
    expect(retryButton).not.toBeUndefined()
    await act(async () => {
      retryButton?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      await vi.waitFor(() => expect(datasetApiMock.listTables).toHaveBeenCalledTimes(2))
      await vi.waitFor(() => expect(container.textContent).toContain('暂无表格资产'))
    })

    act(() => root.unmount())
  })

  it('后台刷新失败时保留已加载的表格列表', async () => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(queryKeys.datasets.tables('dataset-1', { skip: 0, limit: 200 }), {
      total: 1,
      items: [TABLE_SUMMARY],
    })
    datasetApiMock.listTables.mockRejectedValueOnce(new Error('refresh failed'))
    const { container, root } = renderPage(queryClient)

    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('刷新表格列表失败'))
    })
    expect(container.textContent).toContain(TABLE_SUMMARY.sheet_name)
    expect(container.textContent).not.toContain('暂无表格资产')

    act(() => root.unmount())
  })

  it('详情失败时只发送一次请求，并可就地重试恢复字段', async () => {
    datasetApiMock.listTables.mockResolvedValue({ total: 1, items: [TABLE_SUMMARY] })
    datasetApiMock.getTable.mockRejectedValueOnce(new Error('detail unavailable'))
    const { container, root } = renderPage()

    await act(async () => {
      await vi.waitFor(() => expect(datasetApiMock.getTable).toHaveBeenCalledTimes(1))
      await vi.waitFor(() =>
        expect(container.querySelector('[aria-pressed="true"]')).not.toBeNull()
      )
      await vi.waitFor(() => expect(container.textContent).toContain('表格详情加载失败'))
    })
    expect(datasetApiMock.getTable).toHaveBeenCalledTimes(1)

    const retryButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('重新加载')
    )
    expect(retryButton).not.toBeUndefined()
    act(() => retryButton?.click())

    await act(async () => {
      await vi.waitFor(() => expect(datasetApiMock.getTable).toHaveBeenCalledTimes(2))
      await vi.waitFor(() => expect(container.textContent).toContain('customer_name'))
    })

    act(() => root.unmount())
  })

  it('SQL 查询失败时提供页内重试并恢复结果', async () => {
    datasetApiMock.listTables.mockResolvedValue({ total: 1, items: [TABLE_SUMMARY] })
    datasetApiMock.queryTable
      .mockRejectedValueOnce(new Error('database detail should stay private'))
      .mockResolvedValue({
        sql: 'SELECT * FROM "sheet_0" LIMIT 20',
        columns: ['customer_name'],
        rows: [['见外传媒']],
        truncated: false,
      })
    const { container, root } = renderPage()

    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('customer_name'))
    })
    const sqlTab = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === 'SQL 查询'
    )
    expect(sqlTab).not.toBeUndefined()
    act(() => {
      sqlTab?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
    })

    let runButton: HTMLButtonElement | undefined
    await act(async () => {
      await vi.waitFor(() => {
        runButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
          (button) => button.textContent === '执行查询'
        )
        expect(runButton).not.toBeUndefined()
      })
    })
    expect(runButton).not.toBeUndefined()
    await act(async () => {
      runButton?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      await vi.waitFor(() => expect(datasetApiMock.queryTable).toHaveBeenCalledTimes(1))
      await vi.waitFor(() => expect(container.textContent).toContain('查询执行失败'))
    })
    expect(container.textContent).not.toContain('database detail should stay private')

    const retryButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('重新加载')
    )
    expect(retryButton).not.toBeUndefined()
    await act(async () => {
      retryButton?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      await vi.waitFor(() => expect(datasetApiMock.queryTable).toHaveBeenCalledTimes(2))
      await vi.waitFor(() => expect(container.textContent).toContain('见外传媒'))
    })

    act(() => root.unmount())
  })
})
