// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SimilarityDiagnosticLink, SimilarityDiagnosticNode } from './similarity-diagnostics'

const mocks = vi.hoisted(() => ({
  graphProps: [] as Array<Record<string, unknown>>,
}))

vi.mock('next/dynamic', async () => {
  const ReactModule = await import('react')
  return {
    default: () =>
      function ForceGraphProbe(props: Record<string, unknown>) {
        mocks.graphProps.push(props)
        return ReactModule.createElement('div', { 'data-force-graph': 'true' })
      },
  }
})

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    ({
      linkCardEmptyDescription: '点击连线后显示关联节点。',
      linkCardEmptyTitle: '点击连线查看匹配强度',
      linkCardLabel: '当前连线',
      noGraphData: '当前筛选结果没有可展示的节点，请调整数据范围后重试。',
      noLinksDescription: '节点仍会保留在图中。可以降低相似度阈值，查看更多节点之间的关联。',
      noLinksTitle: '当前阈值下未形成关联',
      nodeCardEmptyDescription: '选中节点后显示摘要。',
      nodeCardEmptyTitle: '点击节点查看摘要',
      nodeCardLabel: '当前节点',
      previewHint: '颜色越亮代表越值得关注。',
      previewLabel: '3D 投影预览',
    })[key] || key,
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}))

vi.mock('@/hooks/use-resize-observer', () => ({
  useResizeObserver: () => ({ width: 640, height: 320 }),
}))

vi.mock('@/lib/css-vars', () => ({
  getCssHslColor: (name: string) => name,
}))

import { SimilarityDiagnosticsGraph } from './similarity-diagnostics-graph'

const node = (id: string): SimilarityDiagnosticNode => ({
  id,
  axis: 'x',
  label: `节点 ${id}`,
  color: '#2563eb',
  x: 0,
  y: 0,
  z: 0,
  averageSimilarity: 0.6,
  peakSimilarity: 0.8,
  supportCount: 1,
  isOutlier: false,
  isMarked: false,
  isDisabled: false,
})

const link: SimilarityDiagnosticLink = {
  id: 'link-a-b',
  source: 'a',
  target: 'b',
  sourceLabel: '节点 a',
  targetLabel: '节点 b',
  similarity: 0.82,
  lexicalOverlap: 0.4,
  isOutlier: false,
  isMarked: false,
}

describe('相似度诊断图', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    mocks.graphProps.length = 0
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderGraph(nodes: SimilarityDiagnosticNode[], links: SimilarityDiagnosticLink[]) {
    act(() => {
      root.render(<SimilarityDiagnosticsGraph nodes={nodes} links={links} />)
    })
  }

  it('零节点时显示真正的空状态', () => {
    renderGraph([], [])

    expect(container.textContent).toContain('当前筛选结果没有可展示的节点')
    expect(container.querySelector('[data-force-graph]')).toBeNull()
  })

  it('单节点且无连线时仍渲染节点', () => {
    renderGraph([node('a')], [])

    expect(container.querySelector('[data-force-graph]')).not.toBeNull()
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      '当前阈值下未形成关联'
    )
    expect(mocks.graphProps.at(-1)?.graphData).toMatchObject({
      nodes: [{ id: 'a' }],
      links: [],
    })
  })

  it('多个节点且无连线时保留全部节点和阈值说明', () => {
    renderGraph([node('a'), node('b'), node('c')], [])

    expect(container.querySelector('[data-force-graph]')).not.toBeNull()
    expect(container.textContent).toContain('节点仍会保留在图中')
    expect(mocks.graphProps.at(-1)?.graphData).toMatchObject({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      links: [],
    })
  })

  it('存在连线时正常渲染图并隐藏无连线提示', () => {
    renderGraph([node('a'), node('b')], [link])

    expect(container.querySelector('[data-force-graph]')).not.toBeNull()
    expect(container.querySelector('[role="status"]')).toBeNull()
    expect(mocks.graphProps.at(-1)?.graphData).toMatchObject({
      nodes: [{ id: 'a' }, { id: 'b' }],
      links: [{ id: 'link-a-b' }],
    })
  })
})
