// @vitest-environment happy-dom

import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderHook, waitForAssertion } from '@/test/hook-harness'

const mocks = vi.hoisted(() => ({
  createItem: vi.fn(),
  datasetGet: vi.fn(),
  feedbackToEvidence: vi.fn(),
  getSuiteDashboard: vi.fn(),
  getSuiteHardcaseCandidates: vi.fn(),
  importItems: vi.fn(),
  listItems: vi.fn(),
  listSuites: vi.fn(),
  retrieveEvidence: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    message: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock('@/lib/api', () => ({
  datasetApi: { get: mocks.datasetGet },
  evidenceApi: {
    createItem: mocks.createItem,
    getSuiteDashboard: mocks.getSuiteDashboard,
    getSuiteHardcaseCandidates: mocks.getSuiteHardcaseCandidates,
    importItems: mocks.importItems,
    listItems: mocks.listItems,
    listSuites: mocks.listSuites,
  },
  feedbackApi: { toEvidenceItem: mocks.feedbackToEvidence },
  ragApi: { retrieveEvidence: mocks.retrieveEvidence },
}))

import { useEvidenceSuiteWorkbenchState } from './use-evidence-suite-workbench-state'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

function suite(id: string, datasetId: string) {
  return {
    id,
    dataset_id: datasetId,
    name: id,
    description: null,
    tags: [],
    item_counts: null,
  }
}

function dashboard(suiteId: string) {
  return {
    generated_at: '2026-08-05T00:00:00Z',
    suite_id: suiteId,
    dataset_id: 'dataset-a',
    item_counts: {},
  }
}

function hardcases(suiteId: string) {
  return {
    generated_at: '2026-08-05T00:00:00Z',
    suite_id: suiteId,
    dataset_id: 'dataset-a',
    enabled: true,
    metrics_path: '/metrics',
    window_minutes: 60,
    max_bytes: 1024,
    truncated: false,
    feedback_scanned: 0,
    trace_index_size: 0,
    candidates: [],
  }
}

function retrieveResult(query: string) {
  return {
    schema: 'mimirq.evidence.v1',
    query_for_retrieval: query,
    citations: [],
    has_evidence: false,
    abstain_triggered: false,
  }
}

describe('证据工作台数据集切换', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.datasetGet.mockImplementation(async (datasetId: string) => ({
      id: datasetId,
      name: datasetId,
    }))
    mocks.listItems.mockResolvedValue({ items: [] })
    mocks.getSuiteDashboard.mockResolvedValue(dashboard('suite-a'))
    mocks.getSuiteHardcaseCandidates.mockResolvedValue(hardcases('suite-a'))
    mocks.retrieveEvidence.mockResolvedValue(retrieveResult('默认查询'))
    mocks.importItems.mockResolvedValue({
      parsed: 1,
      created: 1,
      skipped: 0,
      errors: [],
    })
  })

  it('切换证据集后忽略旧 Dashboard 响应', async () => {
    const dashboardA = deferred<ReturnType<typeof dashboard>>()
    const dashboardB = deferred<ReturnType<typeof dashboard>>()
    mocks.listSuites.mockResolvedValue({
      items: [suite('suite-a', 'dataset-a'), suite('suite-b', 'dataset-a')],
    })
    mocks.getSuiteDashboard.mockImplementation((suiteId: string) =>
      suiteId === 'suite-a' ? dashboardA.promise : dashboardB.promise
    )

    const hook = renderHook(() => useEvidenceSuiteWorkbenchState('dataset-a'))
    await waitForAssertion(() => {
      expect(hook.result.current.selectedSuiteId).toBe('suite-a')
      expect(hook.result.current.datasetLoading).toBe(false)
      expect(hook.result.current.itemsLoading).toBe(false)
    })

    act(() => hook.result.current.setDashboardOpen(true))
    await waitForAssertion(() => {
      expect(mocks.getSuiteDashboard).toHaveBeenCalledWith('suite-a', expect.any(Object))
    })

    act(() => hook.result.current.setSelectedSuiteId('suite-b'))
    await waitForAssertion(() => {
      expect(hook.result.current.selectedSuiteId).toBe('suite-b')
      expect(hook.result.current.itemsLoading).toBe(false)
      expect(mocks.getSuiteDashboard).toHaveBeenCalledWith('suite-b', expect.any(Object))
    })

    await act(async () => {
      dashboardB.resolve(dashboard('suite-b'))
      await dashboardB.promise
    })
    expect(hook.result.current.dashboard?.suite_id).toBe('suite-b')
    expect(hook.result.current.dashboardLoading).toBe(false)

    await act(async () => {
      dashboardA.resolve(dashboard('suite-a'))
      await dashboardA.promise
    })
    expect(hook.result.current.dashboard?.suite_id).toBe('suite-b')
    expect(hook.result.current.dashboardLoading).toBe(false)
    hook.unmount()
  })

  it('关闭并重新打开 Dashboard 后忽略关闭前的响应', async () => {
    const firstDashboard = deferred<ReturnType<typeof dashboard>>()
    const secondDashboard = deferred<ReturnType<typeof dashboard>>()
    mocks.listSuites.mockResolvedValue({ items: [suite('suite-a', 'dataset-a')] })
    mocks.getSuiteDashboard
      .mockImplementationOnce(() => firstDashboard.promise)
      .mockImplementationOnce(() => secondDashboard.promise)

    const hook = renderHook(() => useEvidenceSuiteWorkbenchState('dataset-a'))
    await waitForAssertion(() => {
      expect(hook.result.current.selectedSuiteId).toBe('suite-a')
      expect(hook.result.current.datasetLoading).toBe(false)
      expect(hook.result.current.itemsLoading).toBe(false)
    })

    act(() => hook.result.current.setDashboardOpen(true))
    await waitForAssertion(() => {
      expect(mocks.getSuiteDashboard).toHaveBeenCalledTimes(1)
    })
    act(() => hook.result.current.setDashboardOpen(false))
    await waitForAssertion(() => {
      expect(hook.result.current.dashboardLoading).toBe(false)
    })
    act(() => hook.result.current.setDashboardOpen(true))
    await waitForAssertion(() => {
      expect(mocks.getSuiteDashboard).toHaveBeenCalledTimes(2)
    })

    await act(async () => {
      secondDashboard.resolve(dashboard('suite-a'))
      await secondDashboard.promise
    })
    expect(hook.result.current.dashboard?.suite_id).toBe('suite-a')

    await act(async () => {
      firstDashboard.resolve({ ...dashboard('suite-a'), generated_at: '2026-08-04T00:00:00Z' })
      await firstDashboard.promise
    })
    expect(hook.result.current.dashboard?.generated_at).toBe('2026-08-05T00:00:00Z')
    expect(hook.result.current.dashboardLoading).toBe(false)
    hook.unmount()
  })

  it('切换证据集后忽略旧难例候选响应', async () => {
    const hardcasesA = deferred<ReturnType<typeof hardcases>>()
    const hardcasesB = deferred<ReturnType<typeof hardcases>>()
    mocks.listSuites.mockResolvedValue({
      items: [suite('suite-a', 'dataset-a'), suite('suite-b', 'dataset-a')],
    })
    mocks.getSuiteHardcaseCandidates.mockImplementation((suiteId: string) =>
      suiteId === 'suite-a' ? hardcasesA.promise : hardcasesB.promise
    )

    const hook = renderHook(() => useEvidenceSuiteWorkbenchState('dataset-a'))
    await waitForAssertion(() => {
      expect(hook.result.current.selectedSuiteId).toBe('suite-a')
      expect(hook.result.current.datasetLoading).toBe(false)
      expect(hook.result.current.itemsLoading).toBe(false)
    })

    act(() => hook.result.current.setHardcaseOpen(true))
    await waitForAssertion(() => {
      expect(mocks.getSuiteHardcaseCandidates).toHaveBeenCalledWith('suite-a', expect.any(Object))
    })

    act(() => hook.result.current.setSelectedSuiteId('suite-b'))
    await waitForAssertion(() => {
      expect(hook.result.current.selectedSuiteId).toBe('suite-b')
      expect(hook.result.current.itemsLoading).toBe(false)
      expect(mocks.getSuiteHardcaseCandidates).toHaveBeenCalledWith('suite-b', expect.any(Object))
    })

    await act(async () => {
      hardcasesB.resolve(hardcases('suite-b'))
      await hardcasesB.promise
    })
    expect(hook.result.current.hardcaseRes?.suite_id).toBe('suite-b')
    expect(hook.result.current.hardcaseLoading).toBe(false)

    await act(async () => {
      hardcasesA.resolve(hardcases('suite-a'))
      await hardcasesA.promise
    })
    expect(hook.result.current.hardcaseRes?.suite_id).toBe('suite-b')
    expect(hook.result.current.hardcaseLoading).toBe(false)
    hook.unmount()
  })

  it('连续检索时只保留最后一次响应和加载状态', async () => {
    const firstRetrieve = deferred<ReturnType<typeof retrieveResult>>()
    const secondRetrieve = deferred<ReturnType<typeof retrieveResult>>()
    mocks.listSuites.mockResolvedValue({ items: [suite('suite-a', 'dataset-a')] })
    mocks.retrieveEvidence
      .mockImplementationOnce(() => firstRetrieve.promise)
      .mockImplementationOnce(() => secondRetrieve.promise)

    const hook = renderHook(() => useEvidenceSuiteWorkbenchState('dataset-a'))
    await waitForAssertion(() => {
      expect(hook.result.current.selectedSuiteId).toBe('suite-a')
      expect(hook.result.current.datasetLoading).toBe(false)
      expect(hook.result.current.itemsLoading).toBe(false)
    })

    act(() => {
      hook.result.current.openCreateItem()
      hook.result.current.setNewQuery('第一次查询')
    })
    act(() => {
      void hook.result.current.runRetrieve()
    })
    await waitForAssertion(() => {
      expect(mocks.retrieveEvidence).toHaveBeenCalledTimes(1)
    })

    act(() => hook.result.current.setNewQuery('第二次查询'))
    act(() => {
      void hook.result.current.runRetrieve()
    })
    await waitForAssertion(() => {
      expect(mocks.retrieveEvidence).toHaveBeenCalledTimes(2)
    })

    await act(async () => {
      secondRetrieve.resolve(retrieveResult('第二次查询'))
      await secondRetrieve.promise
    })
    expect(hook.result.current.retrieveRes?.query_for_retrieval).toBe('第二次查询')
    expect(hook.result.current.retrieving).toBe(false)

    await act(async () => {
      firstRetrieve.resolve(retrieveResult('第一次查询'))
      await firstRetrieve.promise
    })
    expect(hook.result.current.retrieveRes?.query_for_retrieval).toBe('第二次查询')
    expect(hook.result.current.retrieving).toBe(false)
    hook.unmount()
  })

  it('新数据集证据集返回前阻止所有旧证据集写入', async () => {
    const datasetBSuites = deferred<{ items: ReturnType<typeof suite>[] }>()
    mocks.listSuites.mockImplementation(({ dataset_id }: { dataset_id: string }) => {
      if (dataset_id === 'dataset-b') return datasetBSuites.promise
      return Promise.resolve({ items: [suite('suite-a', 'dataset-a')] })
    })

    let datasetId = 'dataset-a'
    const hook = renderHook(() => useEvidenceSuiteWorkbenchState(datasetId))
    await waitForAssertion(() => {
      expect(hook.result.current.selectedSuiteId).toBe('suite-a')
      expect(hook.result.current.datasetTransitioning).toBe(false)
    })

    datasetId = 'dataset-b'
    hook.rerender()

    expect(hook.result.current.datasetTransitioning).toBe(true)
    expect(hook.result.current.selectedSuite).toBeNull()
    expect(hook.result.current.selectedSuiteId).toBe('')

    await act(async () => {
      await hook.result.current.handleImportQAFaq(
        new File(['question,answer'], 'questions.csv', { type: 'text/csv' })
      )
      await hook.result.current.handleConvertFeedbackToEvidence('feedback-a')
    })
    act(() => hook.result.current.openCreateItem())

    expect(mocks.importItems).not.toHaveBeenCalled()
    expect(mocks.feedbackToEvidence).not.toHaveBeenCalled()
    expect(hook.result.current.createItemOpen).toBe(false)

    await act(async () => {
      datasetBSuites.resolve({ items: [suite('suite-b', 'dataset-b')] })
      await datasetBSuites.promise
    })
    await waitForAssertion(() => {
      expect(hook.result.current.selectedSuiteId).toBe('suite-b')
      expect(hook.result.current.datasetTransitioning).toBe(false)
    })

    await act(async () => {
      await hook.result.current.handleImportQAFaq(
        new File(['question,answer'], 'questions.csv', { type: 'text/csv' })
      )
    })
    expect(mocks.importItems).toHaveBeenCalledWith('suite-b', expect.any(File))
    hook.unmount()
  })

  it('忽略切换前尚未返回的证据集响应', async () => {
    const datasetASuites = deferred<{ items: ReturnType<typeof suite>[] }>()
    mocks.listSuites.mockImplementation(({ dataset_id }: { dataset_id: string }) => {
      if (dataset_id === 'dataset-a') return datasetASuites.promise
      return Promise.resolve({ items: [suite('suite-b', 'dataset-b')] })
    })

    let datasetId = 'dataset-a'
    const hook = renderHook(() => useEvidenceSuiteWorkbenchState(datasetId))
    expect(hook.result.current.datasetTransitioning).toBe(true)

    datasetId = 'dataset-b'
    hook.rerender()
    await waitForAssertion(() => {
      expect(hook.result.current.selectedSuiteId).toBe('suite-b')
      expect(hook.result.current.datasetTransitioning).toBe(false)
    })

    await act(async () => {
      datasetASuites.resolve({ items: [suite('suite-a', 'dataset-a')] })
      await datasetASuites.promise
    })

    expect(hook.result.current.selectedSuiteId).toBe('suite-b')
    expect(hook.result.current.selectedSuite?.dataset_id).toBe('dataset-b')
    hook.unmount()
  })
})
