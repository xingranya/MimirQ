'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertCircle,
  Archive,
  Clock3,
  Database,
  Download,
  FileDigit,
  FileSearch,
  FileText,
  Folder,
  Hash,
  History,
  Info,
  ListChecks,
  Loader2,
  MoreHorizontal,
  Play,
  Settings2,
  Shield,
  Sparkles,
  StopCircle,
  Timer,
  Wand2,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { AppFrame } from '@/components/app-frame'
import { DatasetDetailShell } from '@/components/datasets/dataset-detail-shell'
import { Panel } from '@/components/ui/panel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { StatCard, StatsGrid } from '@/components/ui/stats-card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SafeResponsiveChart } from '@/components/ui/safe-responsive-chart'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { datasetApi, sseApi } from '@/lib/api'
import { formatApiError } from '@/lib/api-errors'
import { reportClientError, reportClientWarning } from '@/lib/client-logging'
import { queryKeys } from '@/lib/query-keys'
import { cn, formatFileSize, formatDate, detachPromise } from '@/lib/utils'

import type {
  DatasetPrecheckFileOut,
  DatasetPrecheckFindingSummary,
  DatasetPrecheckScanRunCreateRequest,
  DatasetPrecheckScanRunOut,
  DatasetPrecheckSummary,
  IngestionPolicyImportResponse,
} from '@/types'

const PIE_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-6))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-7))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-8))',
]

const PRECHECK_RUNS_PARAMS = { skip: 0, limit: 20 } as const
const PRECHECK_POLICY_SUGGESTION_PARAMS = { max_names_per_bucket: 50 } as const
const PRECHECK_FINDING_PAGE_SIZE = 50

function asDatasetId(raw: unknown): string | null {
  if (typeof raw === 'string' && raw.trim()) return raw
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0]
  return null
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function findingBadgeVariant(sev: string): 'secondary' | 'outline' | 'soft' | 'destructive' {
  const s = String(sev || '').toLowerCase()
  if (s === 'error') return 'destructive'
  if (s === 'warning') return 'soft'
  return 'outline'
}

function readStringField(value: unknown, key: string): string {
  if (!value || typeof value !== 'object') return ''
  const raw = (value as Record<string, unknown>)[key]
  return typeof raw === 'string' ? raw : ''
}

function readNumberField(value: unknown, key: string): number | null {
  if (!value || typeof value !== 'object') return null
  const raw = (value as Record<string, unknown>)[key]
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw !== 'string' || !raw.trim()) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function formatPrecheckTimestamp(value?: string | null): string {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function formatRunStatus(status?: string | null): string {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'pending') return '排队中'
  if (normalized === 'running') return '运行中'
  if (normalized === 'completed') return '已完成'
  if (normalized === 'failed') return '失败'
  if (normalized === 'cancelled' || normalized === 'canceled') return '已取消'
  return '未启动'
}

function getRunStatusTone(status?: string | null): string {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'completed') return 'border-success/30 bg-success/10 text-success'
  if (normalized === 'running' || normalized === 'pending') return 'border-info/30 bg-info/10 text-info'
  if (normalized === 'failed') return 'border-destructive/30 bg-destructive/10 text-destructive'
  return 'border-muted-foreground/20 bg-muted/50 text-muted-foreground'
}

export function isPrecheckSseAbortError(error: unknown): boolean {
  const candidate = error as { code?: unknown; name?: unknown; message?: unknown } | null
  if (!candidate || typeof candidate !== 'object') return false
  if (candidate.code === 'ERR_CANCELED') return true
  if (candidate.name === 'AbortError' || candidate.name === 'CanceledError') return true

  const message = typeof candidate.message === 'string' ? candidate.message.trim().toLowerCase() : ''
  return message === 'canceled'
}

export function isCurrentPrecheckSseStream(
  controller: AbortController,
  activeController: AbortController | null,
  runId: string,
  activeRunId: string | null
): boolean {
  return activeController === controller && activeRunId === runId
}

export function shouldFallbackToPrecheckPolling(
  error: unknown,
  controller: AbortController,
  activeController: AbortController | null,
  runId: string,
  activeRunId: string | null
): boolean {
  return isCurrentPrecheckSseStream(controller, activeController, runId, activeRunId) && !isPrecheckSseAbortError(error)
}

export default function DatasetPrecheckPage() {
  const params = useParams()
  const datasetId = asDatasetId((params as Record<string, unknown>)?.id)

  const [selectedRun, setSelectedRun] = useState<DatasetPrecheckScanRunOut | null>(null)
  const [summary, setSummary] = useState<DatasetPrecheckSummary | null>(null)

  const [scanRunning, setScanRunning] = useState(false)
  const [configHelpOpen, setConfigHelpOpen] = useState(false)
  const pollTimerRef = useRef<number | null>(null)
  const pollRunRef = useRef<(datasetIdValue: string, runId: string) => Promise<void>>(async () => {})
  const sseAbortRef = useRef<AbortController | null>(null)
  const sseRunIdRef = useRef<string | null>(null)

  const [isExporting, setIsExporting] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const [policyOpen, setPolicyOpen] = useState(false)
  const [policyApplying, setPolicyApplying] = useState(false)
  const [policyApplyReplace, setPolicyApplyReplace] = useState(false)

  const [scanConfig, setScanConfig] = useState<DatasetPrecheckScanRunCreateRequest>({
    root_path: '',
    max_files: null,
    enable_pdf_quality: true,
    enable_text_extract: true,
    enable_pii: false,
    enable_secrets: false,
    compute_file_hash: false,
    pdf_sample_pages: null,
    text_extract_max_bytes: null,
    redact_paths: false,
    pdf_min_text_chars_per_page: null,
    pdf_text_chars_per_page: null,
    pdf_scan_ratio_threshold: null,
    enable_pii_samples: false,
    pii_context_chars: null,
    pii_max_samples_per_file: null,
    enable_secrets_samples: false,
    secrets_context_chars: null,
    secrets_max_samples_per_file: null,
    enable_near_dup: false,
    near_dup_hamming_threshold: null,
    near_dup_max_pairs: null,
    enable_sampling: true,
    sample_size: null,
    reuse_unchanged_files: false,
    reuse_from_scan_run_id: null,
  })

  const [findingOpen, setFindingOpen] = useState(false)
  const [selectedFinding, setSelectedFinding] = useState<DatasetPrecheckFindingSummary | null>(null)

  const [fileDetailOpen, setFileDetailOpen] = useState(false)
  const [fileDetail, setFileDetail] = useState<DatasetPrecheckFileOut | null>(null)

  const [diffBaseRunId, setDiffBaseRunId] = useState<string>('')

  const stopPolling = useCallback(() => {
    const t = pollTimerRef.current
    if (t) globalThis.window.clearTimeout(t)
    pollTimerRef.current = null
  }, [])

  const stopSse = useCallback(() => {
    const ctrl = sseAbortRef.current
    if (ctrl) ctrl.abort()
    sseAbortRef.current = null
    sseRunIdRef.current = null
  }, [])

  const datasetQuery = useQuery({
    queryKey: queryKeys.datasets.detail(datasetId || ''),
    queryFn: () => datasetApi.get(datasetId as string),
    enabled: Boolean(datasetId),
  })

  const runsQuery = useQuery({
    queryKey: queryKeys.datasets.precheckRuns(datasetId || '', PRECHECK_RUNS_PARAMS),
    queryFn: () => datasetApi.listPrecheckScanRuns(datasetId as string, PRECHECK_RUNS_PARAMS),
    enabled: Boolean(datasetId),
  })

  const dataset = datasetQuery.data ?? null
  const runs = useMemo(() => runsQuery.data?.items || [], [runsQuery.data?.items])
  const loading = Boolean(datasetId) && (datasetQuery.isPending || runsQuery.isPending)
  const selectedRunId = selectedRun?.id || ''
  const selectedFindingKey = selectedFinding?.key || ''
  const sampleSize = scanConfig.sample_size ?? undefined

  const samplesQuery = useQuery({
    queryKey: queryKeys.datasets.precheckSamples(datasetId || '', selectedRunId, {
      size: sampleSize,
      prefer_artifact: true,
    }),
    enabled: false,
    queryFn: () =>
      datasetApi.getPrecheckSamples(datasetId as string, selectedRunId, {
        size: sampleSize,
        prefer_artifact: true,
      }),
  })
  const nearDupQuery = useQuery({
    queryKey: queryKeys.datasets.precheckNearDups(datasetId || '', selectedRunId),
    enabled: false,
    queryFn: () => datasetApi.getPrecheckNearDups(datasetId as string, selectedRunId),
  })
  const diffQuery = useQuery({
    queryKey: queryKeys.datasets.precheckDiff(datasetId || '', selectedRunId, {
      base_scan_run_id: diffBaseRunId,
    }),
    enabled: false,
    queryFn: () =>
      datasetApi.diffPrecheckScanRuns(datasetId as string, selectedRunId, {
        base_scan_run_id: diffBaseRunId,
      }),
  })
  const policySuggestionQuery = useQuery({
    queryKey: queryKeys.datasets.precheckIngestionPolicySuggestion(
      datasetId || '',
      selectedRunId,
      PRECHECK_POLICY_SUGGESTION_PARAMS
    ),
    enabled: false,
    queryFn: () => {
      if (!datasetId || !selectedRunId) throw new Error('缺少预检扫描 ID')
      return datasetApi.suggestPrecheckIngestionPolicy(
        datasetId,
        selectedRunId,
        PRECHECK_POLICY_SUGGESTION_PARAMS
      )
    },
  })
  const findingItemsQuery = useInfiniteQuery({
    queryKey: queryKeys.datasets.precheckFindingFiles(
      datasetId || '',
      selectedRunId,
      selectedFindingKey,
      { limit: PRECHECK_FINDING_PAGE_SIZE }
    ),
    enabled: Boolean(datasetId && selectedRunId && selectedFindingKey && findingOpen),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      if (!datasetId || !selectedRunId || !selectedFindingKey) throw new Error('缺少预检清单 ID')
      return datasetApi.listPrecheckFinding(
        datasetId,
        selectedRunId,
        selectedFindingKey,
        { skip: Number(pageParam) || 0, limit: PRECHECK_FINDING_PAGE_SIZE }
      )
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((acc, page) => acc + (page.items?.length || 0), 0)
      return loaded < (lastPage.total || 0) ? loaded : undefined
    },
  })
  const samplesLoading = samplesQuery.isFetching
  const samplesRes = samplesQuery.data ?? null
  const nearDupLoading = nearDupQuery.isFetching
  const nearDupRes = nearDupQuery.data ?? null
  const diffLoading = diffQuery.isFetching
  const diffRes = diffQuery.data ?? null
  const policyLoading = policySuggestionQuery.isFetching
  const policyRes = policySuggestionQuery.data ?? null
  const findingLoading = findingItemsQuery.isFetching
  const findingRes = useMemo(() => {
    const pages = findingItemsQuery.data?.pages || []
    if (!pages.length) return null
    const items = pages.flatMap((page) => page.items || [])
    return {
      total: pages[pages.length - 1]?.total || 0,
      items,
    }
  }, [findingItemsQuery.data])

  useEffect(() => {
    const error = datasetQuery.error || runsQuery.error
    if (!error) return
    reportClientError('Failed to load dataset precheck', error)
    toast.error(formatApiError(error, '加载预检页面失败'))
  }, [datasetQuery.error, datasetQuery.errorUpdatedAt, runsQuery.error, runsQuery.errorUpdatedAt])

  useEffect(() => {
    const error = findingItemsQuery.error
    if (!error) return
    reportClientError('Failed to load precheck finding', error)
    toast.error(formatApiError(error, '加载清单失败'))
  }, [findingItemsQuery.error, findingItemsQuery.errorUpdatedAt])

  const { refetch: refetchRunsQuery } = runsQuery
  const { refetch: refetchPolicySuggestion } = policySuggestionQuery
  const { fetchNextPage: fetchNextFindingPage } = findingItemsQuery

  const refreshPrecheckRuns = useCallback(async () => {
    await refetchRunsQuery()
  }, [refetchRunsQuery])

  const refetchPrecheckQuery = useCallback(
    async (
      action: () => Promise<{ error: unknown }>,
      errorMessage: string,
      logLabel: string
    ) => {
      const { error } = await action()
      if (!error) return
      reportClientError(logLabel, error)
      toast.error(formatApiError(error, errorMessage))
    },
    []
  )

  useEffect(() => {
    if (!selectedRun && runs.length) {
      setSelectedRun(runs[0])
    }
  }, [runs, selectedRun])

  useEffect(() => {
    return () => {
      stopPolling()
      stopSse()
    }
  }, [stopPolling, stopSse])

  const pollRun = useCallback(
    async (datasetIdValue: string, runId: string) => {
      try {
        const next = await datasetApi.getPrecheckScanRun(datasetIdValue, runId)
        setSelectedRun(next)
        const st = String(next.status || '').toLowerCase()
        if (st === 'pending' || st === 'running') {
          pollTimerRef.current = globalThis.window.setTimeout(() => detachPromise(pollRunRef.current(datasetIdValue, runId)), 2000)
          return
        }
        setScanRunning(false)
        stopPolling()
        await refreshPrecheckRuns()
        if (st === 'completed') {
          const s = await datasetApi.getPrecheckSummary(datasetIdValue, runId)
          setSummary(s)
        } else if (next.error_message) {
          toast.error(`预检扫描失败：${next.error_message}`)
        }
      } catch (e: unknown) {
        reportClientError('Failed to poll precheck run', e)
        setScanRunning(false)
        stopPolling()
      }
    },
    [refreshPrecheckRuns, stopPolling]
  )

  useEffect(() => {
    pollRunRef.current = pollRun
  }, [pollRun])

  const startSse = useCallback(
    (datasetIdValue: string, runId: string) => {
      const activeController = sseAbortRef.current
      if (activeController && !activeController.signal.aborted && sseRunIdRef.current === runId) return

      stopPolling()
      stopSse()
      const ctrl = new AbortController()
      sseAbortRef.current = ctrl
      sseRunIdRef.current = runId
      const isCurrentStream = () =>
        isCurrentPrecheckSseStream(ctrl, sseAbortRef.current, runId, sseRunIdRef.current)

      detachPromise(sseApi
        .streamPrecheckScanEvents(
          datasetIdValue,
          runId,
          (jsonStr) => {
            if (!isCurrentStream()) return
            try {
              const obj = JSON.parse(String(jsonStr || '') || '{}')
              if (obj?.id) setSelectedRun(obj)
              const st = String(obj?.status || '').toLowerCase()
              if (st && st !== 'pending' && st !== 'running') {
                if (!isCurrentStream()) return
                setScanRunning(false)
                stopSse()
                stopPolling()
                detachPromise(refreshPrecheckRuns())
              }
            } catch {
              // ignore
            }
          },
          {
            onError: (err) => {
              if (!isCurrentStream() || isPrecheckSseAbortError(err)) return
              reportClientError('Precheck SSE error', err)
            },
            signal: ctrl.signal,
          }
        )
        .catch((e) => {
          if (!shouldFallbackToPrecheckPolling(e, ctrl, sseAbortRef.current, runId, sseRunIdRef.current)) {
            return
          }
          reportClientWarning('Precheck SSE unavailable; fallback to polling', e)
          if (isCurrentStream()) {
            stopSse()
          }
          pollTimerRef.current = globalThis.window.setTimeout(() => {
            detachPromise(pollRun(datasetIdValue, runId))
          }, 800)
        }))
    },
    [pollRun, refreshPrecheckRuns, stopPolling, stopSse]
  )

  // When selectedRun changes, load summary (if available) and resume polling (if running).
  useEffect(() => {
    if (!datasetId || !selectedRun?.id) return
    const st = String(selectedRun.status || '').toLowerCase()
    if (st === 'pending' || st === 'running') {
      setScanRunning(true)
      startSse(datasetId, selectedRun.id)
      return
    }
    setScanRunning(false)
    stopPolling()
    stopSse()
    if (st === 'completed') {
      detachPromise(datasetApi
        .getPrecheckSummary(datasetId, selectedRun.id)
        .then(setSummary)
        .catch(() => setSummary(null)))
      return
    }
    setSummary(null)
  }, [datasetId, selectedRun, startSse, stopPolling, stopSse])

  const startScan = useCallback(async () => {
    if (!datasetId) return
    if (!scanConfig.root_path?.trim()) {
      toast.error('请输入要扫描的文件夹路径')
      return
    }
    setScanRunning(true)
    try {
      const run = await datasetApi.startPrecheckScan(datasetId, scanConfig)
      setSelectedRun(run)
      await refreshPrecheckRuns()
      const st = String(run.status || '').toLowerCase()
      if (st === 'pending' || st === 'running') {
        startSse(datasetId, run.id)
      } else {
        setScanRunning(false)
      }
      toast.success('已启动预检扫描')
    } catch (e: unknown) {
      reportClientError('Failed to start precheck scan', e)
      toast.error(formatApiError(e, '启动预检扫描失败'))
      setScanRunning(false)
    }
  }, [datasetId, refreshPrecheckRuns, scanConfig, startSse])

  const cancelScan = useCallback(async () => {
    if (!datasetId || !selectedRun?.id) return
    setScanRunning(true)
    try {
      const run = await datasetApi.cancelPrecheckScan(datasetId, selectedRun.id)
      setSelectedRun(run)
      toast.success('已请求取消')
    } catch (e: unknown) {
      reportClientError('Failed to cancel precheck scan', e)
      toast.error(formatApiError(e, '取消失败'))
    } finally {
      setScanRunning(false)
    }
  }, [datasetId, selectedRun?.id])

  const openPolicy = useCallback(async () => {
    if (!datasetId || !selectedRunId) return
    setPolicyOpen(true)
    const { error } = await refetchPolicySuggestion()
    if (error) {
      reportClientError('Failed to suggest ingestion policy', error)
      toast.error(formatApiError(error, '生成入库策略失败'))
    }
  }, [datasetId, refetchPolicySuggestion, selectedRunId])

  const applyPolicy = useCallback(async () => {
    if (!datasetId || !selectedRun?.id) return
    setPolicyApplying(true)
    try {
      const res: IngestionPolicyImportResponse = await datasetApi.applyPrecheckIngestionPolicy(datasetId, selectedRun.id, {
        replace: !!policyApplyReplace,
      })
      toast.success(`已应用入库策略（rules=${res.rule_count}）`)
    } catch (e: unknown) {
      reportClientError('Failed to apply ingestion policy', e)
      toast.error(formatApiError(e, '应用失败'))
    } finally {
      setPolicyApplying(false)
    }
  }, [datasetId, policyApplyReplace, selectedRun?.id])

  const exportJson = useCallback(async () => {
    if (!datasetId || !selectedRun?.id) return
    setIsExporting(true)
    try {
      const blob = await datasetApi.exportPrecheckSummary(datasetId, selectedRun.id)
      const safe = String(dataset?.name || 'dataset').replaceAll(/[^a-zA-Z0-9_.-]+/g, '_').slice(0, 64)
      downloadBlob(blob, `${safe}.precheck.json`)
      toast.success('已导出 JSON 报告')
    } catch (e: unknown) {
      reportClientError('Failed to export precheck json', e)
      toast.error(formatApiError(e, '导出失败'))
    } finally {
      setIsExporting(false)
    }
  }, [datasetId, dataset?.name, selectedRun?.id])

  const exportHtml = useCallback(async () => {
    if (!datasetId || !selectedRun?.id) return
    setIsExporting(true)
    try {
      const blob = await datasetApi.exportPrecheckHtml(datasetId, selectedRun.id, { redact: true })
      const safe = String(dataset?.name || 'dataset').replaceAll(/[^a-zA-Z0-9_.-]+/g, '_').slice(0, 64)
      downloadBlob(blob, `${safe}.precheck.html`)
      toast.success('已导出 HTML 报告')
    } catch (e: unknown) {
      reportClientError('Failed to export precheck html', e)
      toast.error(formatApiError(e, '导出失败'))
    } finally {
      setIsExporting(false)
    }
  }, [datasetId, dataset?.name, selectedRun?.id])

  const downloadJsonObject = useCallback((obj: unknown, filename: string) => {
    try {
      const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
      downloadBlob(blob, filename)
    } catch {
      // ignore
    }
  }, [])

  const fileTypeChartData = useMemo(() => {
    const m = summary?.by_file_type || {}
    const entries = Object.entries(m)
      .map(([name, value]) => ({ name, value: Number(value || 0) }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value)
    const top = entries.slice(0, 10)
    const rest = entries.slice(10)
    const other = rest.reduce((acc, x) => acc + x.value, 0)
    if (other > 0) top.push({ name: '其他', value: other })
    return top.map((entry, idx) => ({ ...entry, fill: PIE_COLORS[idx % PIE_COLORS.length] }))
  }, [summary])

  const lengthHistogramData = useMemo(() => {
    return (summary?.length_histogram || []).map((b) => ({ name: b.label, value: Number(b.count || 0) }))
  }, [summary])

  const fileSizeHistogramData = useMemo(() => {
    return (summary?.file_size_histogram || []).map((b) => ({ name: b.label, value: Number(b.count || 0) }))
  }, [summary])

  const pdfScanData = useMemo(() => {
    const s = summary?.pdf_scan
    if (!s) return []
    return [
      { name: 'scanned', value: Number(s.scanned || 0), fill: '#fb7185' },
      { name: 'text', value: Number(s.not_scanned || 0), fill: '#38bdf8' },
      { name: 'unknown', value: Number(s.unknown || 0), fill: '#94a3b8' },
    ]
  }, [summary])

  const piiChartData = useMemo(() => {
    const m = summary?.pii_hits_total || {}
    return Object.entries(m)
      .map(([name, value]) => ({ name, value: Number(value || 0) }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  }, [summary])

  const secretsChartData = useMemo(() => {
    const m = summary?.secrets_hits_total || {}
    return Object.entries(m)
      .map(([name, value]) => ({ name, value: Number(value || 0) }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  }, [summary])

  const openFinding = useCallback(
    (finding: DatasetPrecheckFindingSummary) => {
      if (!datasetId || !selectedRunId) return
      setSelectedFinding(finding)
      setFindingOpen(true)
      setFileDetailOpen(false)
      setFileDetail(null)
    },
    [datasetId, selectedRunId]
  )

  const loadMoreFindingPage = useCallback(async () => {
    if (!findingItemsQuery.hasNextPage) return
    await fetchNextFindingPage()
  }, [fetchNextFindingPage, findingItemsQuery.hasNextPage])

  const latestRunStatus = selectedRun?.status
  const latestRunProgress = selectedRun?.progress ?? 0
  const hasPrecheckRuns = runs.length > 0
  const showPrecheckEmptyState = !loading && !hasPrecheckRuns
  const runRootPath =
    readStringField(selectedRun?.config, 'root_path') ||
    readStringField(selectedRun?.artifacts, 'root_path') ||
    scanConfig.root_path ||
    '/uploads'
  const runTotalFiles =
    summary?.total_files ??
    readNumberField(selectedRun?.summary, 'total_files') ??
    readNumberField(selectedRun?.summary, 'file_count') ??
    0
  const runProgress = Math.max(0, Math.min(100, Number(latestRunProgress || 0)))
  const runStatusLabel = formatRunStatus(latestRunStatus)
  const runBatchLabel = selectedRun?.id ? selectedRun.id.slice(0, 8) : 'none'
  const hasRunOutput = Boolean(selectedRun?.id && summary)

  return (
    <AppFrame>
      <DatasetDetailShell
        activeSection="precheck"
        datasetId={datasetId || ''}
        datasetName={dataset?.name}
        title="预检扫描"
        description="在正式入库前检查文件范围、质量、重复项与敏感信息。"
        icon={FileSearch}
        bodyClassName="h-full bg-background pb-3"
        bodyContainerClassName="h-full min-h-full"
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="sm" variant="outline" className="h-9 rounded-md">
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                  更多操作
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-md">
                <DropdownMenuItem onSelect={() => setAdvancedOpen(true)}>
                  <Settings2 className="size-4" aria-hidden="true" />
                  高级配置
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!selectedRun?.id}
                  onSelect={() => detachPromise(openPolicy())}
                >
                  <Wand2 className="size-4" aria-hidden="true" />
                  生成策略
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={isExporting || !selectedRun?.id || !summary}
                  onSelect={() => detachPromise(exportJson())}
                >
                  <Download className="size-4" aria-hidden="true" />
                  导出 JSON
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={isExporting || !selectedRun?.id || !summary}
                  onSelect={() => detachPromise(exportHtml())}
                >
                  <Download className="size-4" aria-hidden="true" />
                  导出 HTML
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {scanRunning && selectedRun?.id ? (
              <Button
                size="sm"
                variant="outline"
                className="h-9 rounded-md"
                onClick={() => detachPromise(cancelScan())}
              >
                <StopCircle className="size-4" aria-hidden="true" />
                取消扫描
              </Button>
            ) : null}
            <Button
              size="sm"
              className="h-9 rounded-md"
              onClick={() => detachPromise(startScan())}
              disabled={scanRunning}
            >
              {scanRunning ? (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Play className="size-4" aria-hidden="true" />
              )}
              {scanRunning ? '正在扫描' : '启动预检'}
            </Button>
          </>
        }
      >
        <div data-precheck-workbench="true" className="flex flex-col gap-3">
          <div className="grid min-h-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
            <Panel
              className="overflow-hidden rounded-md border-border bg-card p-0 shadow-none xl:min-h-[560px]"
            >
              <div className="space-y-3.5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-md bg-muted text-primary">
                      <ListChecks className="size-[18px]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-semibold leading-none text-foreground">扫描配置</h2>
                        <Badge variant="outline" className="h-6 rounded-md text-xs leading-none">
                          {latestRunStatus ? runStatusLabel : '暂无运行'}
                        </Badge>
                      </div>
                      <button
                        type="button"
                        className="mt-1 text-xs font-medium leading-none text-primary hover:underline"
                        aria-expanded={configHelpOpen}
                        aria-controls="precheck-config-help"
                        onClick={() => setConfigHelpOpen((open) => !open)}
                      >
                        如何配置？
                      </button>
                    </div>
                  </div>
                </div>

                {configHelpOpen ? (
                  <div
                    id="precheck-config-help"
                    role="note"
                    className="rounded-md border border-info/25 bg-info/5 px-3 py-2 text-sm leading-5 text-muted-foreground"
                  >
                    扫描目录必须可被 API 或 Worker 访问。首次扫描建议限制文件数量并开启 PDF 质量与文本抽样，确认结果后再启用个人信息、密钥线索和增量复用。
                  </div>
                ) : null}

                <div className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-sm leading-5 text-muted-foreground">
                  <Info className="mt-0.5 size-3.5 shrink-0" />
                  <span>当前使用本地目录扫描，可读取远程根目录或 /uploads；本操作只生成质量画像，不会入库或切片。</span>
                </div>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[245px_minmax(0,1fr)]">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium text-foreground">历史扫描</Label>
                    <Select
                      value={selectedRun?.id || ''}
                      onValueChange={(v) => {
                        const next = (runs || []).find((r) => r.id === v) || null
                        setSelectedRun(next)
                      }}
                    >
                      <SelectTrigger
                        id="precheck-run-history"
                        className="h-9 w-full rounded-md bg-background text-sm shadow-none"
                      >
                        <SelectValue placeholder="选择历史扫描" />
                      </SelectTrigger>
                      <SelectContent>
                        {(runs || []).map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {String(r.created_at || '').slice(0, 19) || r.id} · {formatRunStatus(r.status)} · {r.progress ?? 0}%
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="text-xs leading-4 text-muted-foreground">复用以往配置快速启动</div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-sm font-medium text-foreground">扫描目录</Label>
                    <Input
                      placeholder="例如：/data/docs 或 C:\\\\docs（需容器/进程可访问）"
                      value={scanConfig.root_path || ''}
                      onChange={(e) => setScanConfig((prev) => ({ ...prev, root_path: e.target.value }))}
                      className="h-9 rounded-md bg-background font-mono text-sm shadow-none"
                    />
                    <div className="flex items-center gap-2 text-xs leading-4 text-muted-foreground">
                      <span>当前路径：</span>
                      <span className="font-mono font-semibold text-primary">{runRootPath}</span>
                      <Folder className="size-3 text-primary" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-sm font-medium text-foreground">最大文件数</Label>
                    <Input
                      placeholder="不限"
                      value={scanConfig.max_files ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value.trim()
                        if (!raw) {
                          setScanConfig((prev) => ({ ...prev, max_files: null }))
                          return
                        }
                        const n = Number(raw)
                        setScanConfig((prev) => ({ ...prev, max_files: Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null }))
                      }}
                      className="h-9 rounded-md bg-background font-mono text-sm shadow-none"
                    />
                    <div className="text-xs leading-4 text-muted-foreground">留空或 0 表示不限制</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 lg:grid-cols-3 lg:divide-x lg:divide-border">
                  <section>
                    <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <FileDigit className="size-3.5" />
                      基础画像
                    </div>
                    <div className="divide-y divide-border/55">
                      <div className="flex min-h-9 items-center justify-between gap-3 py-1.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <Label className="text-sm font-medium">PDF 质量</Label>
                          <Badge variant="soft" className="rounded-md text-xs">默认</Badge>
                        </div>
                        <Switch checked={!!scanConfig.enable_pdf_quality} onCheckedChange={(v) => setScanConfig((p) => ({ ...p, enable_pdf_quality: !!v }))} />
                      </div>
                      <div className="flex min-h-9 items-center justify-between gap-3 py-1.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <Label className="text-sm font-medium">文本抽样</Label>
                          <Badge variant="soft" className="rounded-md text-xs">推荐</Badge>
                        </div>
                        <Switch checked={!!scanConfig.enable_text_extract} onCheckedChange={(v) => setScanConfig((p) => ({ ...p, enable_text_extract: !!v }))} />
                      </div>
                    </div>
                  </section>

                  <section className="lg:pl-4">
                    <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <Shield className="size-3.5" />
                      风险扫描
                    </div>
                    <div className="divide-y divide-border/55">
                      <div className="flex min-h-9 items-center justify-between gap-3 py-1.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <Label className="text-sm font-medium">个人信息检测</Label>
                          <Badge variant="soft" className="rounded-md text-xs">推荐</Badge>
                        </div>
                        <Switch checked={!!scanConfig.enable_pii} onCheckedChange={(v) => setScanConfig((p) => ({ ...p, enable_pii: !!v }))} />
                      </div>
                      <div className="flex min-h-9 items-center justify-between gap-3 py-1.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <Label className="text-sm font-medium">密钥线索检测</Label>
                          <Badge variant="soft" className="rounded-md text-xs">推荐</Badge>
                        </div>
                        <Switch checked={!!scanConfig.enable_secrets} onCheckedChange={(v) => setScanConfig((p) => ({ ...p, enable_secrets: !!v }))} />
                      </div>
                      <div className="flex min-h-9 items-center justify-between gap-3 py-1.5">
                        <div className="min-w-0">
                          <Label className="text-sm font-medium">脱敏路径</Label>
                          <div className="truncate text-xs text-muted-foreground">导出报告时隐藏本机路径</div>
                        </div>
                        <Switch checked={!!scanConfig.redact_paths} onCheckedChange={(v) => setScanConfig((p) => ({ ...p, redact_paths: !!v }))} />
                      </div>
                    </div>
                  </section>

                  <section className="lg:pl-4">
                    <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <Database className="size-3.5" />
                      复用策略
                    </div>
                    <div className="divide-y divide-border/55">
                      <div className="flex min-h-9 items-center justify-between gap-3 py-1.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <Label className="text-sm font-medium">文件哈希</Label>
                          <Badge variant="outline" className="rounded-md text-xs">默认</Badge>
                        </div>
                        <Switch checked={!!scanConfig.compute_file_hash} onCheckedChange={(v) => setScanConfig((p) => ({ ...p, compute_file_hash: !!v }))} />
                      </div>
                      <div className="flex min-h-9 items-center justify-between gap-3 py-1.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <Label className="text-sm font-medium">增量复用</Label>
                          <Badge variant="outline" className="rounded-md text-xs">可选</Badge>
                        </div>
                        <Switch checked={!!scanConfig.reuse_unchanged_files} onCheckedChange={(v) => setScanConfig((p) => ({ ...p, reuse_unchanged_files: !!v }))} />
                      </div>
                    </div>
                  </section>
                </div>

                <div className="grid border-t border-border sm:grid-cols-4 sm:divide-x sm:divide-border">
                  <div className="flex min-h-14 gap-2 border-b border-border/50 p-2.5 sm:border-b-0 sm:border-r">
                    <Archive className="mt-0.5 size-3.5 text-muted-foreground/70" />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-muted-foreground">预估样本量</div>
                      <div className="mt-1 font-mono text-xs text-foreground/80">{scanConfig.sample_size || '--'}</div>
                    </div>
                  </div>
                  <div className="flex min-h-14 gap-2 border-b border-border/50 p-2.5 sm:border-b-0 sm:border-r">
                    <FileSearch className="mt-0.5 size-3.5 text-muted-foreground/70" />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-muted-foreground">扫描范围</div>
                      <div className="mt-1 truncate font-mono text-xs text-foreground/80">根目录 / {runRootPath.replace(/^\/+/, '') || 'uploads'}</div>
                    </div>
                  </div>
                  <div className="flex min-h-14 gap-2 border-b border-border/50 p-2.5 sm:border-b-0 sm:border-r">
                    <FileText className="mt-0.5 size-3.5 text-muted-foreground/70" />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-muted-foreground">支持格式</div>
                      <div className="mt-1 text-xs text-foreground/80">PDF / DOCX / TXT / MD / 图片 等</div>
                    </div>
                  </div>
                  <div className="flex min-h-14 gap-2 p-2.5">
                    <Settings2 className="mt-0.5 size-3.5 text-muted-foreground/70" />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-muted-foreground">输出类型</div>
                      <div className="mt-1 text-xs text-foreground/80">质量画像报告（不入库）</div>
                    </div>
                  </div>
                </div>
              </div>
            </Panel>

            <Panel
              className="overflow-hidden rounded-md border-border bg-card p-0 shadow-none xl:min-h-[560px]"
            >
              <div className="flex items-center justify-between border-b border-border/50 px-4 py-3.5">
                <div className="text-sm font-semibold text-foreground">运行状态</div>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  onClick={() => {
                    const trigger = globalThis.document.getElementById('precheck-run-history')
                    trigger?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    trigger?.focus()
                    trigger?.click()
                  }}
                >
                  查看历史记录
                  <History className="size-3" />
                </button>
              </div>

              {!hasRunOutput && !scanRunning ? (
                <div className="p-4">
                  <div className="rounded-md border border-dashed border-border bg-muted/30 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-background text-primary">
                        <Clock3 className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-semibold leading-none text-foreground">等待扫描配置</div>
                          <div className={cn('rounded-md border px-2.5 py-0.5 text-xs font-medium', getRunStatusTone(latestRunStatus))}>
                            {runStatusLabel}
                          </div>
                        </div>
                        <div className="mt-1.5 text-sm leading-5 text-muted-foreground">
                          填写可访问的扫描目录后启动，扫描进度、样本和画像会在这里实时刷新。
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 divide-y divide-border border-y border-border text-xs sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                      <div className="px-2.5 py-2">
                        <div className="text-xs text-muted-foreground">当前批次</div>
                        <div className="mt-1 font-mono text-foreground/80">{runBatchLabel}</div>
                      </div>
                      <div className="px-2.5 py-2">
                        <div className="text-xs text-muted-foreground">预计产物</div>
                        <div className="mt-1 text-foreground/80">质量画像</div>
                      </div>
                      <div className="px-2.5 py-2">
                        <div className="text-xs text-muted-foreground">不执行</div>
                        <div className="mt-1 text-foreground/80">入库 / 切片 / 知识图谱</div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                      <AlertCircle className="size-3.5 shrink-0" />
                      尚未运行扫描，以上信息将在执行后更新。
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-0 px-5 py-2">
                  <div className="grid grid-cols-[76px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 py-3.5 text-xs">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <AlertCircle className="size-3.5" />
                      状态
                    </div>
                    <div />
                    <div className={cn('rounded-md border px-3 py-1 text-xs font-semibold', getRunStatusTone(latestRunStatus))}>
                      {runStatusLabel}
                    </div>
                  </div>

                  <div className="grid grid-cols-[76px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 py-3.5 text-xs">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock3 className="size-3.5" />
                      进度
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${runProgress}%` }} />
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">{runProgress}% · {runTotalFiles || 0} / {runTotalFiles || 0}</div>
                  </div>

                  <div className="grid grid-cols-[76px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 py-3.5 text-xs">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <ListChecks className="size-3.5" />
                      批次
                    </div>
                    <div className="font-mono text-xs text-foreground/80">{runBatchLabel}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      自动命名
                      <Switch checked={false} disabled />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 border-b border-border/60 py-3.5 text-xs">
                    <div className="flex items-center gap-3">
                      <Timer className="size-3.5 text-muted-foreground" />
                      <div>
                        <div className="text-xs text-muted-foreground">预计耗时</div>
                        <div className="font-mono text-xs text-foreground/80">--</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 border-l border-border/60 pl-4">
                      <History className="size-3.5 text-muted-foreground" />
                      <div>
                        <div className="text-xs text-muted-foreground">上次运行</div>
                        <div className="font-mono text-xs text-foreground/80">{selectedRun?.finished_at ? formatPrecheckTimestamp(selectedRun.finished_at) : '--'}</div>
                      </div>
                    </div>
                  </div>

                  <div className="border-b border-border/60 py-3.5">
                    <div className="text-xs font-medium text-muted-foreground">输出内容</div>
                    <div className="mt-1 text-sm leading-5 text-foreground/70">格式分布、长度分布、扫描件占比、个人信息与密钥线索命中、代表样本和近重复候选。</div>
                  </div>

                  <div className="py-3.5">
                    <div className="text-xs font-medium text-muted-foreground">结果条目</div>
                    <div className="mt-1 font-mono text-xs text-foreground/70">{hasRunOutput ? `${runTotalFiles} 个文件` : '--'}</div>
                  </div>

                  {selectedRun?.error_message ? (
                    <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                      {selectedRun.error_message}
                    </div>
                  ) : null}
                </div>
              )}
            </Panel>
          </div>

          <Panel data-precheck-bottom-strip="true" className="overflow-hidden rounded-md border-border bg-muted/30 p-0 shadow-none">
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 px-4 py-2.5 text-xs leading-4 text-muted-foreground">
              <span className="inline-flex items-center gap-2 text-foreground/75">
                <Clock3 className="size-3 text-primary" />
                <span>等待第一次扫描</span>
                <span className="font-mono text-xs text-muted-foreground">扫描次数：{runs.length}</span>
              </span>
              <span className="h-3.5 w-px bg-border/70" />
              <span>
                下一步：<span className="text-foreground/75">填写扫描目录后启动</span>
              </span>
              <span>
                会生成：<span className="text-foreground/75">格式 / PDF / 个人信息 / 样本</span>
              </span>
              <span>
                不会执行：<span className="text-foreground/75">文档入库 / 切片 / 索引 / 知识图谱</span>
              </span>
            </div>
          </Panel>

          <div hidden={showPrecheckEmptyState} className="space-y-6">
          <Panel className="p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="font-semibold">对比扫描结果</div>
                <div className="mt-1 text-sm leading-5 text-muted-foreground">对比格式分布、问题清单和扫描件占比的变化。</div>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <Select value={diffBaseRunId} onValueChange={(v) => setDiffBaseRunId(v)}>
                  <SelectTrigger className="w-full rounded-md sm:w-[320px]">
                    <SelectValue placeholder="选择对比扫描" />
                  </SelectTrigger>
                  <SelectContent>
                    {(runs || [])
                      .filter((r) => r.id !== selectedRun?.id)
                      .map((r) => (
                        <SelectItem key={`base-${r.id}`} value={r.id}>
                          {String(r.created_at || '').slice(0, 19) || r.id} · {formatRunStatus(r.status)} · {r.progress ?? 0}%
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() =>
                    detachPromise(
                      refetchPrecheckQuery(
                        () => diffQuery.refetch(),
                        '对比失败',
                        'Failed to diff precheck runs'
                      )
                    )
                  }
                  disabled={!diffBaseRunId || diffLoading || !selectedRun?.id}
                >
                  {diffLoading ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" /> : null}
                  计算
                </Button>
              </div>
            </div>

            {diffRes ? (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-md border border-border bg-muted/10 p-3 text-sm">
                  <div className="text-xs text-muted-foreground">文件总数</div>
                  <div className="mt-1 font-mono text-lg">{diffRes.total_files.before} → {diffRes.total_files.after} (Δ {diffRes.total_files.delta})</div>
                  <div className="mt-2 text-xs text-muted-foreground">扫描型 PDF</div>
                  <div className="mt-1 font-mono">{diffRes.pdf_scanned.before} → {diffRes.pdf_scanned.after} (Δ {diffRes.pdf_scanned.delta})</div>
                  <div className="mt-2 text-xs text-muted-foreground">未识别 PDF</div>
                  <div className="mt-1 font-mono">{diffRes.pdf_unknown.before} → {diffRes.pdf_unknown.after} (Δ {diffRes.pdf_unknown.delta})</div>
                </div>

                <div className="overflow-hidden rounded-md border border-border">
                  <div className="bg-muted/40 px-3 py-2 text-sm font-medium">主要问题变化</div>
                  <div className="max-h-[220px] overflow-auto">
                    <table aria-label="预检主要问题差异" className="w-full text-left text-sm">
                      <thead className="bg-muted/20 text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">问题</th>
                          <th className="px-3 py-2 font-medium">之前</th>
                          <th className="px-3 py-2 font-medium">现在</th>
                          <th className="px-3 py-2 font-medium">变化</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(diffRes.findings || []).slice(0, 12).map((it) => (
                          <tr key={`diff-${it.key}`} className="border-t border-border/60">
                            <td className="px-3 py-2 font-mono text-xs">{it.key}</td>
                            <td className="px-3 py-2 font-mono text-xs">{it.before}</td>
                            <td className="px-3 py-2 font-mono text-xs">{it.after}</td>
                            <td className={cn('px-3 py-2 font-mono text-xs', (() => {
    if (it.delta > 0) {
        return 'text-warning';
    }
    else if (it.delta < 0) {
            return 'text-success';
        }
        else {
            return '';
        }
})())}>
                              {it.delta}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-muted-foreground">尚未计算对比结果</div>
            )}
          </Panel>

          <Panel className="p-5">
            <StatsGrid>
              <StatCard icon={FileSearch} label="文件总数" value={summary?.total_files ?? (loading ? '…' : 0)} color="cyan" />
              <StatCard icon={FileSearch} label="总大小" value={(() => {
    if (summary) {
        return formatFileSize(summary.total_size_bytes || 0);
    }
    else if (loading) {
            return '…';
        }
        else {
            return '-';
        }
})()} color="teal" />
              <StatCard icon={Sparkles} label="P50 长度" value={summary?.length_percentiles?.p50 ?? (loading ? '…' : 0)} subValue="字符" color="blue" />
              <StatCard icon={Sparkles} label="P90 长度" value={summary?.length_percentiles?.p90 ?? (loading ? '…' : 0)} subValue="字符" color="blue" />
              <StatCard icon={Sparkles} label="扫描 PDF" value={(() => {
    if (summary) {
        return `${summary.pdf_scan.scanned}/${summary.pdf_scan.scanned + summary.pdf_scan.not_scanned + summary.pdf_scan.unknown}`;
    }
    else if (loading) {
            return '…';
        }
        else {
            return '-';
        }
})()} color="orange" />
            </StatsGrid>
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="font-semibold">格式分布</div>
                <div className="font-mono text-xs text-muted-foreground">{summary?.generated_at ? `更新于 ${formatDate(summary.generated_at)}` : ''}</div>
              </div>
              <SafeResponsiveChart>
                  <PieChart>
                    <Tooltip />
                    <Pie data={fileTypeChartData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2} />
                  </PieChart>
                </SafeResponsiveChart>
            </Panel>

            <Panel className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="font-semibold">长度分布（字符）</div>
              </div>
              <SafeResponsiveChart>
                  <BarChart data={lengthHistogramData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={12} />
                    <YAxis allowDecimals={false} fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="value" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </SafeResponsiveChart>
            </Panel>

            <Panel className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="font-semibold">PDF 扫描占比</div>
              </div>
              <SafeResponsiveChart>
                  <PieChart>
                    <Tooltip />
                    <Pie data={pdfScanData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2} />
                  </PieChart>
                </SafeResponsiveChart>
            </Panel>

            <Panel className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="font-semibold">文件大小分布</div>
              </div>
              <SafeResponsiveChart>
                  <BarChart data={fileSizeHistogramData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={12} />
                    <YAxis allowDecimals={false} fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="value" fill="hsl(var(--chart-3))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </SafeResponsiveChart>
            </Panel>

            <Panel className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="font-semibold">个人信息命中（次数）</div>
              </div>
              {piiChartData.length ? (
                <SafeResponsiveChart>
                    <BarChart data={piiChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" fontSize={12} />
                      <YAxis allowDecimals={false} fontSize={12} />
                      <Tooltip />
                      <Bar dataKey="value" fill="hsl(var(--chart-4))" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </SafeResponsiveChart>
              ) : (
                <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">暂无数据</div>
              )}
            </Panel>

            <Panel className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="font-semibold">密钥线索命中（次数）</div>
              </div>
              {secretsChartData.length ? (
                <SafeResponsiveChart>
                    <BarChart data={secretsChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" fontSize={12} />
                      <YAxis allowDecimals={false} fontSize={12} />
                      <Tooltip />
                      <Bar dataKey="value" fill="hsl(var(--chart-6))" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </SafeResponsiveChart>
              ) : (
                <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">暂无数据</div>
              )}
            </Panel>
          </div>

          <Panel className="p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="font-semibold">代表性样本（抽样）</div>
                <div className="mt-1 text-sm leading-5 text-muted-foreground">用于确认数据范围，仅提供代表性与问题分组样本，不会自动删除文件。</div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() =>
                    detachPromise(
                      refetchPrecheckQuery(
                        () => samplesQuery.refetch(),
                        '加载样本失败',
                        'Failed to load precheck samples'
                      )
                    )
                  }
                  disabled={!selectedRun?.id || samplesLoading}
                >
                  {samplesLoading ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" /> : <FileSearch className="w-4 h-4" />}
                  加载
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => downloadJsonObject(samplesRes, `${String(dataset?.name || 'dataset').replaceAll(/[^a-zA-Z0-9_.-]+/g, '_').slice(0, 64)}.precheck.samples.json`)}
                  disabled={!samplesRes}
                >
                  <Download className="w-4 h-4" />
                  下载
                </Button>
              </div>
            </div>

            {samplesRes ? (
              <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="overflow-hidden rounded-md border border-border">
                  <div className="px-3 py-2 text-sm font-medium bg-muted/40">代表性样本（{samplesRes.representative?.length || 0}）</div>
                  <div className="max-h-[260px] overflow-auto">
                    <table aria-label="预检代表性样本" className="w-full text-sm text-left">
                      <thead className="bg-muted/20 text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">文件</th>
                          <th className="px-3 py-2 font-medium">类型</th>
                          <th className="px-3 py-2 font-medium">大小</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(samplesRes.representative || []).map((d) => (
                          <tr key={`rep-${d.name}-${d.file_size}`} className="border-t border-border/60 hover:bg-muted/20 transition-colors">
                            <td className="px-3 py-2 font-mono text-xs">{d.name}</td>
                            <td className="px-3 py-2 font-mono text-xs">{d.file_type}</td>
                            <td className="px-3 py-2 font-mono text-xs">{formatFileSize(d.file_size || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="overflow-hidden rounded-md border border-border">
                  <div className="px-3 py-2 text-sm font-medium bg-muted/40">问题分桶样本</div>
                  <div className="max-h-[260px] overflow-auto">
                    <table aria-label="预检问题分桶样本" className="w-full text-sm text-left">
                      <thead className="bg-muted/20 text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">问题分组</th>
                          <th className="px-3 py-2 font-medium">数量</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(samplesRes.needs_review || {}).map(([k, v]) => (
                          <tr key={`need-${k}`} className="border-t border-border/60">
                            <td className="px-3 py-2 font-mono text-xs">{k}</td>
                            <td className="px-3 py-2 font-mono text-xs">{(v || []).length}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-muted-foreground">尚未加载样本</div>
            )}
          </Panel>

          <Panel className="p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="font-semibold">近重复候选（版本冲突）</div>
                <div className="mt-1 text-sm leading-5 text-muted-foreground">基于抽样文本指纹生成待确认列表，不会自动删除文件。</div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() =>
                    detachPromise(
                      refetchPrecheckQuery(
                        () => nearDupQuery.refetch(),
                        '加载近重复失败（可能未开启）',
                        'Failed to load precheck near-dups'
                      )
                    )
                  }
                  disabled={!selectedRun?.id || nearDupLoading}
                >
                  {nearDupLoading ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" /> : <FileSearch className="w-4 h-4" />}
                  加载
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => downloadJsonObject(nearDupRes, `${String(dataset?.name || 'dataset').replaceAll(/[^a-zA-Z0-9_.-]+/g, '_').slice(0, 64)}.precheck.near_dups.json`)}
                  disabled={!nearDupRes}
                >
                  <Download className="w-4 h-4" />
                  下载
                </Button>
              </div>
            </div>

            {nearDupRes ? (
              <div className="mt-4 text-sm text-muted-foreground">
                重复组 {nearDupRes.clusters_returned} · 文件对 {nearDupRes.pairs_returned} · 阈值 {nearDupRes.threshold}
              </div>
            ) : (
              <div className="mt-4 text-sm text-muted-foreground">尚未加载，请先在扫描配置中开启“近重复候选”。</div>
            )}
          </Panel>

          <Panel className="p-5">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="font-semibold">问题清单（可操作）</div>
              <div className="text-sm text-muted-foreground">选择问题后查看文件列表</div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(summary?.findings || []).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={cn(
                    'rounded-md border border-border bg-background px-4 py-3 text-left transition-colors hover:bg-muted',
                    'focus:outline-none focus:ring-2 focus:ring-primary/30'
                  )}
                  onClick={() => detachPromise(openFinding(f))}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium truncate">{f.label}</div>
                    <Badge variant={findingBadgeVariant(f.severity)} className="font-mono text-xs">
                      {f.count}
                    </Badge>
                  </div>
                  {f.description ? <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{f.description}</div> : null}
                </button>
              ))}
            </div>
          </Panel>
          </div>
        </div>

        <Dialog
          open={findingOpen}
          onOpenChange={(open) => {
            setFindingOpen(open)
            if (!open) {
              setSelectedFinding(null)
            }
          }}
        >
          <DialogContent className="max-w-4xl rounded-md border-border bg-background shadow-lg">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
                {selectedFinding?.label || '清单'}
                {selectedFinding ? (
                  <Badge variant={findingBadgeVariant(selectedFinding.severity)} className="font-mono text-xs">
                    {selectedFinding.count}
                  </Badge>
                ) : null}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {selectedFinding?.description || '预检扫描的文件列表（不入库，不产生切片）'}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-2">
              {(() => {
    if (findingLoading && !findingRes) {
        return (<div className="py-10 flex items-center justify-center text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin motion-reduce:animate-none mr-2"/>
                  加载中…
                </div>);
    }
    else if (findingRes) {
            return (<div className="space-y-3">
                  <div className="font-mono text-xs text-muted-foreground">
                    已显示 {findingRes.items.length}/{findingRes.total}
                  </div>
                  <div className="overflow-hidden rounded-md border border-border">
                    <table aria-label="预检入库建议列表" className="w-full text-sm text-left">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">文件</th>
                          <th className="px-3 py-2 font-medium">类型</th>
                          <th className="px-3 py-2 font-medium">大小</th>
                          <th className="px-3 py-2 font-medium">长度</th>
                          <th className="px-3 py-2 font-medium">PDF</th>
                          <th className="px-3 py-2 font-medium">表格</th>
                          <th className="px-3 py-2 font-medium">估算</th>
                        </tr>
                      </thead>
                      <tbody>
                        {findingRes.items.map((d) => (<tr key={`${d.name}-${d.file_type}-${d.file_size}`} className="border-t border-border/60 hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => {
                        setFileDetail(d);
                        setFileDetailOpen(true);
                    }}>
                            <td className="px-3 py-2 font-mono text-xs">{d.name}</td>
                            <td className="px-3 py-2 font-mono text-xs">{d.file_type}</td>
                            <td className="px-3 py-2 font-mono text-xs">{formatFileSize(d.file_size || 0)}</td>
                            <td className="px-3 py-2 font-mono text-xs">{d.text_characters}</td>
                            <td className="px-3 py-2 font-mono text-xs">
                              {d.file_type === 'pdf' ? ((() => {
                    if (d.pdf_scanned === true) {
                        return '扫描型';
                    }
                    else if (d.pdf_scanned === false) {
                            return '文本型';
                        }
                        else {
                            return '未知';
                        }
                })()) : ''}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs">
                              {d.spreadsheet ? `${d.spreadsheet.row_count || 0}x${d.spreadsheet.col_count || 0}` : ''}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs">{d.estimated_text ? 'yes' : ''}</td>
                          </tr>))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                      {findingRes.items.length >= findingRes.total ? '已加载全部' : ''}
                    </div>
                    <Button variant="outline" className="gap-2" onClick={() => detachPromise(loadMoreFindingPage())} disabled={findingLoading || !findingItemsQuery.hasNextPage}>
                      {findingLoading ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none"/> : null}
                      加载更多
                    </Button>
                  </div>
                </div>);
        }
        else {
            return (<div className="py-10 text-center text-muted-foreground">暂无数据</div>);
        }
})()}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={fileDetailOpen}
          onOpenChange={(open) => {
            setFileDetailOpen(open)
            if (!open) setFileDetail(null)
          }}
        >
          <DialogContent className="max-w-4xl rounded-md border-border bg-background shadow-lg">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-foreground">文件详情</DialogTitle>
              <DialogDescription className="text-muted-foreground">{fileDetail?.name || ''}</DialogDescription>
            </DialogHeader>

            {fileDetail ? (
              <div className="space-y-3">
                <div className="rounded-md border border-border bg-muted/10 p-3 text-sm">
                  <div className="text-xs text-muted-foreground">文件信息</div>
                  <div className="mt-1 font-mono text-xs">
                    类型 {fileDetail.file_type} · 大小 {formatFileSize(fileDetail.file_size)} · 字符 {fileDetail.text_characters}{' '}
                    {fileDetail.estimated_text ? '（估算）' : ''}
                  </div>
                  {fileDetail.error_message ? <div className="mt-2 text-xs text-destructive">{fileDetail.error_message}</div> : null}
                </div>

                {fileDetail.pdf_pages ? (
                  <div className="rounded-md border border-border bg-muted/10 p-3 text-sm">
                    <div className="text-xs text-muted-foreground">PDF 页面</div>
                    <div className="mt-1 font-mono text-xs">
                      总页数 {fileDetail.pdf_pages.page_count} · 已抽样 {fileDetail.pdf_pages.sampled_pages} · 扫描型 {fileDetail.pdf_pages.scanned_pages} · 文本型 {fileDetail.pdf_pages.text_pages} · 低密度 {fileDetail.pdf_pages.low_density_pages} · 未知 {fileDetail.pdf_pages.unknown_pages}
                    </div>
                  </div>
                ) : null}

                {fileDetail.spreadsheet ? (
                  <div className="rounded-md border border-border bg-muted/10 p-3 text-sm">
                    <div className="text-xs text-muted-foreground">表格信息</div>
                    <div className="mt-1 font-mono text-xs">
                      行 {fileDetail.spreadsheet.row_count} · 列 {fileDetail.spreadsheet.col_count || 0} · 工作表 {fileDetail.spreadsheet.sheet_count} · 合并单元格比例 {fileDetail.spreadsheet.merged_cell_ratio}
                      {(fileDetail.spreadsheet.estimated_rows || fileDetail.spreadsheet.estimated_cols) ? '（估算）' : ''}
                    </div>
                  </div>
                ) : null}

                <div className="overflow-hidden rounded-md border border-border">
                  <div className="bg-muted/40 px-3 py-2 text-sm font-medium">发现的问题</div>
                  <div className="p-3 font-mono text-xs">{(fileDetail.findings || []).join(', ') || '-'}</div>
                </div>

                {(fileDetail.pii_samples || []).length ? (
                  <div className="overflow-hidden rounded-md border border-border">
                    <div className="bg-muted/40 px-3 py-2 text-sm font-medium">个人信息样本</div>
                    <pre className="p-3 text-xs overflow-auto max-h-[220px] bg-background font-mono">{JSON.stringify(fileDetail.pii_samples, null, 2)}</pre>
                  </div>
                ) : null}

                {(fileDetail.secrets_samples || []).length ? (
                  <div className="overflow-hidden rounded-md border border-border">
                    <div className="bg-muted/40 px-3 py-2 text-sm font-medium">密钥线索样本</div>
                    <pre className="p-3 text-xs overflow-auto max-h-[220px] bg-background font-mono">{JSON.stringify(fileDetail.secrets_samples, null, 2)}</pre>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="py-10 text-center text-muted-foreground">暂无数据</div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <DialogContent className="max-w-3xl rounded-md border-border bg-background p-4 shadow-lg">
            <DialogHeader className="space-y-1.5">
              <DialogTitle className="text-base font-semibold text-foreground">预检扫描 · 高级配置</DialogTitle>
              <DialogDescription className="rounded-md bg-muted px-3 py-2 text-sm leading-5 text-muted-foreground">
                开启路径脱敏后不保存个人信息和密钥线索的上下文样本；增量复用仅在路径未脱敏且扫描目录相同时生效。
              </DialogDescription>
            </DialogHeader>

            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-foreground">PDF 抽样页数</Label>
                <Input
                  placeholder="默认 3"
                  value={scanConfig.pdf_sample_pages ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value.trim()
                    setScanConfig((p) => ({ ...p, pdf_sample_pages: raw ? Number(raw) : null }))
                  }}
                  className="h-8 font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-foreground">文本抽样最大字节</Label>
                <Input
                  placeholder="默认 2000000"
                  value={scanConfig.text_extract_max_bytes ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value.trim()
                    setScanConfig((p) => ({ ...p, text_extract_max_bytes: raw ? Number(raw) : null }))
                  }}
                  className="h-8 font-mono text-xs"
                />
              </div>
            </div>

            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-card/45 px-2.5 py-2 dark:bg-card/40">
                <Label className="text-sm font-medium text-foreground">近重复候选</Label>
                <Switch checked={!!scanConfig.enable_near_dup} onCheckedChange={(v) => setScanConfig((p) => ({ ...p, enable_near_dup: !!v }))} />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-card/45 px-2.5 py-2 dark:bg-card/40">
                <Label className="text-sm font-medium text-foreground">抽样清单</Label>
                <Switch checked={!!scanConfig.enable_sampling} onCheckedChange={(v) => setScanConfig((p) => ({ ...p, enable_sampling: !!v }))} />
              </div>
            </div>

            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-foreground">抽样数量</Label>
                <Input
                  placeholder="默认 60"
                  value={scanConfig.sample_size ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value.trim()
                    setScanConfig((p) => ({ ...p, sample_size: raw ? Number(raw) : null }))
                  }}
                  className="h-8 font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-foreground">近重复阈值</Label>
                <Input
                  placeholder="默认 5"
                  value={scanConfig.near_dup_hamming_threshold ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value.trim()
                    setScanConfig((p) => ({ ...p, near_dup_hamming_threshold: raw ? Number(raw) : null }))
                  }}
                  className="h-8 font-mono text-xs"
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={policyOpen}
           onOpenChange={(open) => {
             setPolicyOpen(open)
             if (!open) {
               setPolicyApplyReplace(false)
             }
           }}
        >
          <DialogContent className="max-w-4xl rounded-md border-border bg-background shadow-lg">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
                预检 → 入库策略（建议）
                {policyLoading ? (
                  <Badge variant="outline" className="font-mono text-xs">
                    生成中…
                  </Badge>
                ) : null}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                将预检统计转换为可导入的入库策略，并保留待人工复核清单。表格默认自动分流：大表进入 SQL，小表进入知识检索。
              </DialogDescription>
            </DialogHeader>

            {(() => {
    if (policyLoading) {
        return (<div className="py-10 flex items-center justify-center text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin motion-reduce:animate-none mr-2"/>
                生成中…
              </div>);
    }
    else if (policyRes) {
            return (<div className="space-y-4">
                {policyRes.notes?.length ? (<div className="space-y-1 rounded-md border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                    {policyRes.notes.map((n) => (<div key={n}>- {n}</div>))}
                  </div>) : null}

                <div className="overflow-hidden rounded-md border border-border">
                  <div className="px-3 py-2 text-sm font-medium bg-muted/40">待人工复核</div>
                  <table aria-label="预检人工复核列表" className="w-full text-sm text-left">
                    <thead className="bg-muted/20 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">问题分组</th>
                        <th className="px-3 py-2 font-medium">数量</th>
                        <th className="px-3 py-2 font-medium">样本文件</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(policyRes.manual_review || []).map((b) => (<tr key={b.key} className="border-t border-border/60">
                          <td className="px-3 py-2 font-mono text-xs">{b.key}</td>
                          <td className="px-3 py-2 font-mono text-xs">{b.total}</td>
                          <td className="px-3 py-2 font-mono text-xs truncate">{(b.sample_names || []).slice(0, 5).join(', ')}</td>
                        </tr>))}
                    </tbody>
                  </table>
                </div>

                <div className="overflow-hidden rounded-md border border-border">
                  <div className="bg-muted/40 px-3 py-2 text-sm font-medium">策略 JSON</div>
                  <pre className="p-3 text-xs overflow-auto max-h-[280px] bg-background font-mono">{JSON.stringify(policyRes.policy, null, 2)}</pre>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox checked={policyApplyReplace} onCheckedChange={(v) => setPolicyApplyReplace(!!v)}/>
                    <div className="text-sm text-muted-foreground">覆盖已有入库策略</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" className="gap-2" onClick={() => downloadJsonObject(policyRes.policy, `${String(dataset?.name || 'dataset').replaceAll(/[^a-zA-Z0-9_.-]+/g, '_').slice(0, 64)}.ingestion_policy.suggested.json`)}>
                      <Download className="w-4 h-4"/>
                      下载
                    </Button>
                    <Button className="gap-2" onClick={() => detachPromise(applyPolicy())} disabled={policyApplying}>
                      {policyApplying ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none"/> : null}
                      应用到数据集
                    </Button>
                  </div>
                </div>
              </div>);
        }
        else {
            return (<div className="py-10 text-center text-muted-foreground">暂无数据</div>);
        }
})()}
          </DialogContent>
        </Dialog>
      </DatasetDetailShell>
    </AppFrame>
  )
}
