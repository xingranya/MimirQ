// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ReportsResultSection } from './components/reports-result-section'

vi.mock('./components/reports-dashboard', () => ({
  ReportsDashboard: () => <div>报告内容</div>,
}))

const baseProps = {
  report: null,
  datasetId: '',
  datasetsCount: 1,
  datasetsLoaded: true,
  isLoadingDatasets: false,
  isLoadingReport: false,
  datasetsErrorMessage: '',
  categoriesErrorMessage: '',
  reportErrorMessage: '',
  totalDocs: 0,
  totalBytes: 0,
  successDocs: 0,
  successRate: '0%',
  failed: 0,
  failedRate: '0%',
  pipelineVersions: [],
  pipelineVersionsWithFill: [],
  pipelineFilterLabel: '',
  latestAuditTime: '',
  retrievalAudit: null,
  missingFindingCount: 0,
  duplicateFindingCount: 0,
  lowQualityFindingCount: 0,
  fieldCoverageRows: [],
  fieldCoverageBadge: '',
  topDocumentRows: [],
  topDocumentMax: 0,
  onClearFolderQuery: vi.fn(),
  governanceAuditUrlValue: '',
  governanceAuditUrlSub: '',
  governanceAuditImageValue: '',
  governanceAuditImageSub: '',
  governanceAuditHasSamples: false,
  sensitiveHits: 0,
  piiHits: 0,
  secretHits: 0,
  categoryBarData: [],
  versionTotal: 0,
  issueRows: [],
  onRetryDatasets: vi.fn(),
  onRetryCategories: vi.fn(),
  onRetryReport: vi.fn(),
}

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>

async function renderResult(
  props: Partial<React.ComponentProps<typeof ReportsResultSection>> = {}
) {
  await act(async () => {
    root.render(<ReportsResultSection {...baseProps} {...props} />)
  })
}

function clickButton(label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label
  )
  expect(button).toBeDefined()
  act(() => button?.click())
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

describe('报告页请求状态', () => {
  it('数据集请求失败时显示真实错误并只重试数据集', async () => {
    await renderResult({
      datasetsCount: 0,
      datasetsLoaded: false,
      datasetsErrorMessage: '服务器返回 500',
    })

    expect(container.textContent).toContain('数据集加载失败')
    expect(container.textContent).toContain('服务器返回 500')
    expect(container.textContent).not.toContain('请选择数据集')
    clickButton('重试数据集')
    expect(baseProps.onRetryDatasets).toHaveBeenCalledOnce()
    expect(baseProps.onRetryCategories).not.toHaveBeenCalled()
    expect(baseProps.onRetryReport).not.toHaveBeenCalled()
  })

  it('分类请求失败时保留报告入口并只重试分类', async () => {
    await renderResult({
      datasetId: 'dataset-1',
      categoriesErrorMessage: '服务器返回 500',
    })

    expect(container.textContent).toContain('分类加载失败')
    expect(container.textContent).toContain('其余报告内容不受影响')
    clickButton('重试分类')
    expect(baseProps.onRetryCategories).toHaveBeenCalledOnce()
    expect(baseProps.onRetryDatasets).not.toHaveBeenCalled()
    expect(baseProps.onRetryReport).not.toHaveBeenCalled()
  })

  it('报告请求失败时只重试报告', async () => {
    await renderResult({
      datasetId: 'dataset-1',
      reportErrorMessage: '服务器返回 500',
    })

    expect(container.textContent).toContain('报告加载失败')
    expect(container.textContent).toContain('服务器返回 500')
    clickButton('重试报告')
    expect(baseProps.onRetryReport).toHaveBeenCalledOnce()
    expect(baseProps.onRetryDatasets).not.toHaveBeenCalled()
    expect(baseProps.onRetryCategories).not.toHaveBeenCalled()
  })

  it('数据集接口成功但列表为空时显示真实空状态', async () => {
    await renderResult({ datasetsCount: 0, datasetsLoaded: true })

    expect(container.textContent).toContain('暂无可用数据集')
    expect(container.textContent).toContain('创建或获得数据集访问权限')
    expect(container.textContent).not.toContain('加载失败')
  })
})
