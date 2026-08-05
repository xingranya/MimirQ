// @vitest-environment happy-dom

import React, { act } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { queryKeys } from '@/lib/query-keys'

const datasetApiMock = vi.hoisted(() => ({
  get: vi.fn(),
  getDbCatalogTable: vi.fn(),
  listDbCatalogProfiles: vi.fn(),
  listDbCatalogTables: vi.fn(),
}))
const connectorApiMock = vi.hoisted(() => ({
  createRun: vi.fn(),
  listRuns: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'dataset-1' }),
}))
vi.mock('@/lib/api', () => ({
  connectorApi: connectorApiMock,
  datasetApi: datasetApiMock,
}))
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
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import DatasetDbCatalogPage from './page'

const CATALOG_PARAMS = {
  skip: 0,
  limit: 200,
  engine: undefined,
  q: undefined,
}

const TABLE_SUMMARY = {
  id: 'table-1',
  connector_config_id: null,
  engine: 'mysql',
  db_name: 'crm',
  schema_name: null,
  table_name: 'customers',
  table_type: 'table',
  comment: '客户主表',
  fingerprint: 'fingerprint-1',
  last_seen_at: '2026-08-05T10:00:00Z',
  created_at: '2026-08-05T10:00:00Z',
  updated_at: '2026-08-05T10:00:00Z',
}

const TABLE_DETAIL = {
  ...TABLE_SUMMARY,
  columns: [
    {
      id: 'column-1',
      table_id: TABLE_SUMMARY.id,
      ordinal: 1,
      name: 'customer_name',
      data_type: 'varchar',
      nullable: false,
      comment: null,
      created_at: '2026-08-05T10:00:00Z',
    },
  ],
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
        <DatasetDbCatalogPage />
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

function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function openSyncDialog(container: HTMLElement) {
  act(() => findButton(container, '新建同步').click())
  await act(async () => {
    await vi.waitFor(() => expect(document.body.textContent).toContain('数据库目录同步'))
  })
}

function fillRequiredSyncFields() {
  const fieldValues = [
    ['#catalog-host', 'db.example.com'],
    ['#catalog-database', 'customer'],
    ['#catalog-username', 'reader'],
    ['#catalog-password', 'secret-password'],
  ] as const
  fieldValues.forEach(([selector, value]) => {
    const input = document.querySelector<HTMLInputElement>(selector)
    expect(input, `未找到输入框：${selector}`).not.toBeNull()
    setInputValue(input as HTMLInputElement, value)
  })
}

beforeEach(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  datasetApiMock.get.mockResolvedValue({ id: 'dataset-1', name: '客户知识库' })
  datasetApiMock.listDbCatalogTables.mockResolvedValue({ total: 0, items: [] })
  datasetApiMock.getDbCatalogTable.mockResolvedValue(TABLE_DETAIL)
  datasetApiMock.listDbCatalogProfiles.mockResolvedValue({ total: 0, items: [] })
  connectorApiMock.listRuns.mockResolvedValue({ total: 0, items: [] })
})

afterEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

describe('数据库目录请求状态', () => {
  it('首次目录请求失败时显示错误和重试，不伪装成空目录', async () => {
    datasetApiMock.listDbCatalogTables.mockRejectedValueOnce(new Error('network unavailable'))
    const { container, root } = renderPage()

    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('无法加载数据库目录'))
    })
    expect(container.textContent).not.toContain('暂无数据库目录')

    const retryButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('重新加载')
    )
    expect(retryButton).not.toBeUndefined()
    act(() => retryButton?.click())

    await act(async () => {
      await vi.waitFor(() => expect(datasetApiMock.listDbCatalogTables).toHaveBeenCalledTimes(2))
      await vi.waitFor(() => expect(container.textContent).toContain('暂无数据库目录'))
    })

    act(() => root.unmount())
  })

  it('后台刷新失败时保留已加载的目录', async () => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(queryKeys.datasets.dbCatalogTables('dataset-1', CATALOG_PARAMS), {
      total: 1,
      items: [TABLE_SUMMARY],
    })
    datasetApiMock.listDbCatalogTables.mockRejectedValueOnce(new Error('refresh failed'))
    const { container, root } = renderPage(queryClient)

    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('刷新数据库目录失败'))
    })
    expect(container.textContent).toContain('crm.customers')
    expect(container.textContent).not.toContain('暂无数据库目录')

    act(() => root.unmount())
  })

  it('同步状态首次加载失败时不显示为暂无同步', async () => {
    connectorApiMock.listRuns.mockRejectedValueOnce(new Error('runs unavailable'))
    const { container, root } = renderPage()

    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('同步状态加载失败'))
    })
    expect(container.textContent).not.toContain('暂无同步')

    act(() => root.unmount())
  })

  it('表结构失败时保持选中项并可就地重试', async () => {
    datasetApiMock.listDbCatalogTables.mockResolvedValue({
      total: 1,
      items: [TABLE_SUMMARY],
    })
    datasetApiMock.getDbCatalogTable.mockRejectedValueOnce(new Error('detail unavailable'))
    const { container, root } = renderPage()

    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('表结构加载失败'))
    })
    expect(datasetApiMock.getDbCatalogTable).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('crm.customers')
    expect(container.textContent).not.toContain('请选择一张表查看结构。')

    const retryButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('重新加载')
    )
    expect(retryButton).not.toBeUndefined()
    act(() => retryButton?.click())

    await act(async () => {
      await vi.waitFor(() => expect(datasetApiMock.getDbCatalogTable).toHaveBeenCalledTimes(2))
      await vi.waitFor(() => expect(container.textContent).toContain('customer_name'))
    })

    act(() => root.unmount())
  })

  it('安全画像失败时继续显示表结构', async () => {
    datasetApiMock.listDbCatalogTables.mockResolvedValue({
      total: 1,
      items: [TABLE_SUMMARY],
    })
    datasetApiMock.listDbCatalogProfiles.mockRejectedValueOnce(new Error('profile unavailable'))
    const { container, root } = renderPage()

    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('安全画像加载失败'))
      await vi.waitFor(() => expect(container.textContent).toContain('customer_name'))
    })

    act(() => root.unmount())
  })

  it('提交同步前校验端口和表数上限', async () => {
    const { container, root } = renderPage()

    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('暂无数据库目录'))
    })
    await openSyncDialog(container)
    fillRequiredSyncFields()

    const portInput = document.querySelector<HTMLInputElement>('#catalog-port')
    const maxTablesInput = document.querySelector<HTMLInputElement>('#catalog-max-tables')
    expect(portInput).not.toBeNull()
    expect(maxTablesInput).not.toBeNull()

    setInputValue(portInput as HTMLInputElement, '65536')
    act(() => findButton(document, '开始同步').click())
    expect(document.body.textContent).toContain('端口必须在 1 到 65535 之间')
    expect(connectorApiMock.createRun).not.toHaveBeenCalled()

    setInputValue(portInput as HTMLInputElement, '1433')
    setInputValue(maxTablesInput as HTMLInputElement, '2001')
    act(() => findButton(document, '开始同步').click())
    expect(document.body.textContent).toContain('最多同步表数必须在 1 到 2000 之间')
    expect(connectorApiMock.createRun).not.toHaveBeenCalled()

    act(() => root.unmount())
  })

  it('创建同步失败时保留表单并隐藏后端内部异常', async () => {
    connectorApiMock.createRun.mockRejectedValueOnce(
      new Error('postgresql://internal-user:internal-password@db:5432')
    )
    const { container, root } = renderPage()

    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('暂无数据库目录'))
    })
    await openSyncDialog(container)
    fillRequiredSyncFields()
    await act(async () => {
      findButton(document, '开始同步').click()
      await Promise.resolve()
    })

    await act(async () => {
      await vi.waitFor(() =>
        expect(document.body.textContent).toContain(
          '创建同步任务失败，请检查连接信息和服务状态后重试'
        )
      )
    })
    expect(document.body.textContent).not.toContain('internal-password')
    expect(document.querySelector<HTMLInputElement>('#catalog-host')?.value).toBe('db.example.com')
    expect(connectorApiMock.createRun).toHaveBeenCalledTimes(1)

    act(() => root.unmount())
  })
})
