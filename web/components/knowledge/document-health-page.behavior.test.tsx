// @vitest-environment happy-dom

import type { DocumentHealthCard } from '@/types'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getHealth: vi.fn(),
  push: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  documentApi: { health: mocks.getHealth },
}))

vi.mock('@/components/app-frame', () => ({
  AppFrame: ({ children }: Readonly<{ children: ReactNode }>) => <>{children}</>,
}))

vi.mock('@/components/ui/page-scaffold', () => ({
  PageScaffold: ({
    actions,
    children,
    description,
    title,
    top,
  }: Readonly<{
    actions?: ReactNode
    children: ReactNode
    description?: ReactNode
    title: ReactNode
    top?: ReactNode
  }>) => (
    <main>
      <h1>{title}</h1>
      <div>{description}</div>
      <div>{actions}</div>
      <div>{top}</div>
      {children}
    </main>
  ),
}))

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}))

import DocumentHealthPage from './document-health-page'

const healthPayload: DocumentHealthCard = {
  document_id: 'document-secret-id',
  dataset_id: 'dataset-secret-id',
  filename: '产品手册.pdf',
  file_type: 'pdf',
  file_size: 2048,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T01:00:00Z',
  generated_at: '2026-08-01T02:00:00Z',
  status: 'completed',
  parsing: {
    parser_backend: 'magicpdf',
    parser_backend_requested: 'auto',
    parse_quality: { score: 0.82 },
    is_scanned: true,
    page_count: 12,
    processed_at: '2026-08-01T01:30:00Z',
  },
  chunking: {
    chunk_strategy: 'semantic_sentence',
    chunk_strategy_requested: 'auto',
    chunk_count: 42,
    total_characters: 12000,
    coverage: {
      sum_chunk_chars: 12500,
      covered_chars: 11880,
      coverage_ratio: 0.99,
      overlap_waste_ratio: 0.05,
      gap_count: 1,
      largest_gap: 120,
    },
    semantic_quality: {
      sampled_chunks: 20,
      needs_review: 2,
      needs_review_ratio: 0.1,
      mean_information_density: 0.7,
      mean_semantic_completeness: 0.8,
      mean_self_containedness: 0.75,
      mean_pronoun_ratio: 0.04,
      overall_histogram_10: [0, 0, 0, 0, 0, 1, 2, 5, 8, 4],
    },
  },
  kg: {
    summary: {
      events: 3,
      entities: 15,
      relations: 21,
      isolated_entity_ratio: 0.1,
    },
    components: {
      components: 2,
      largest_component_ratio: 0.9,
    },
  },
  retrieval_hits: {
    enabled: false,
    available: false,
    window_minutes: 1440,
    max_bytes: 1024,
    truncated: false,
    traces_scanned: 0,
    traces_with_hits: 0,
    citations_matched: 0,
    unique_chunks_matched: 0,
    hit_rate: null,
  },
}

describe('文档健康审计页', () => {
  let container: HTMLDivElement
  let queryClient: QueryClient
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    queryClient.clear()
    container.remove()
  })

  async function renderPage() {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <DocumentHealthPage documentId="document-secret-id" />
        </QueryClientProvider>
      )
    })
  }

  async function waitForText(text: string) {
    await act(async () => {
      await vi.waitFor(() => {
        expect(container.textContent).toContain(text)
      })
    })
  }

  it('初次请求期间显示明确的加载状态', async () => {
    mocks.getHealth.mockReturnValue(new Promise(() => undefined))

    await renderPage()

    expect(container.textContent).toContain('正在加载文档健康数据')
    expect(container.textContent).not.toContain('暂无健康数据')
  })

  it('加载失败时提供就地重试，并在成功后恢复内容', async () => {
    mocks.getHealth
      .mockRejectedValueOnce(new Error('health unavailable'))
      .mockResolvedValueOnce(healthPayload)

    await renderPage()
    await waitForText('文档健康数据加载失败')

    const retryButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('重新加载')
    )
    expect(retryButton).toBeDefined()

    await act(async () => {
      retryButton?.click()
    })
    await waitForText('产品手册.pdf')

    expect(mocks.getHealth).toHaveBeenCalledTimes(2)
    expect(container.textContent).not.toContain('文档健康数据加载失败')
  })

  it('请求成功但没有结果时才显示空状态', async () => {
    mocks.getHealth.mockResolvedValue(null)

    await renderPage()
    await waitForText('暂无健康数据')

    expect(container.textContent).toContain('文档处理完成后再刷新此页')
    expect(container.textContent).not.toContain('文档健康数据加载失败')
  })

  it('完整数据使用中文概览和默认折叠的明细，不展示内部编号', async () => {
    mocks.getHealth.mockResolvedValue(healthPayload)

    await renderPage()
    await waitForText('产品手册.pdf')

    expect(container.textContent).toContain('解析质量')
    expect(container.textContent).toContain('内容覆盖')
    expect(container.textContent).toContain('知识图谱')
    expect(container.textContent).toContain('检索命中')
    expect(container.textContent).toContain('MagicPDF')
    expect(container.textContent).toContain('检索统计尚未启用')
    expect(container.textContent).not.toContain('document-secret-id')
    expect(container.textContent).not.toContain('dataset-secret-id')
    expect(Array.from(container.querySelectorAll('details')).every((item) => !item.open)).toBe(true)
  })
})
