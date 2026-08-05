'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Database, MoreHorizontal, Play, Search } from 'lucide-react'

import { AppFrame } from '@/components/app-frame'
import { DatasetDetailShell } from '@/components/datasets/dataset-detail-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Panel } from '@/components/ui/panel'
import { QueryErrorState } from '@/components/ui/query-error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useRouter } from '@/i18n/navigation'
import { connectorApi, datasetApi } from '@/lib/api'
import { reportClientError } from '@/lib/client-logging'
import { toTrimmedPrimitiveString } from '@/lib/primitive-text'
import { queryKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'

import type {
  ConnectorRunListResponse,
  ConnectorRunOut,
  Dataset,
  DbCatalogTableDetail,
  DbCatalogTableSummary,
  DbProfileSnapshot,
} from '@/types'

const ENGINE_OPTIONS: ReadonlyArray<'all' | 'mysql' | 'sqlserver'> = ['all', 'mysql', 'sqlserver']
const DB_CATALOG_LIST_LIMIT = 200
const ENGINE_LABELS = {
  all: '全部',
  mysql: 'MySQL',
  sqlserver: 'SQL Server',
} as const

type DbCatalogSyncConfig = {
  host: string
  port: number
  database: string
  username: string
  password: string
  max_tables: number
  profile_enabled: boolean
  include_tables: string[]
  include_schemas?: string[]
}

type SchemaColumnChange = {
  table?: unknown
  column?: unknown
  old?: Record<string, unknown>
  new?: Record<string, unknown>
}

function asDatasetId(raw: unknown): string | null {
  if (typeof raw === 'string' && raw.trim()) return raw
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0]
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function stringItems(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function columnChangeItems(value: unknown): SchemaColumnChange[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).map((item) => ({
    table: item.table,
    column: item.column,
    old: isRecord(item.old) ? item.old : {},
    new: isRecord(item.new) ? item.new : {},
  }))
}

function formatQualifiedName(t: DbCatalogTableSummary | DbCatalogTableDetail): string {
  const parts: string[] = []
  if (t.db_name) parts.push(t.db_name)
  if (t.schema_name) parts.push(t.schema_name)
  parts.push(t.table_name)
  return parts.filter(Boolean).join('.')
}

function parseNameList(raw: string, limit = 200): string[] {
  const parts = String(raw || '')
    .split(/[\n,]/g)
    .map((s) => s.trim())
    .filter(Boolean)
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    if (seen.has(p)) continue
    seen.add(p)
    out.push(p)
    if (out.length >= limit) break
  }
  return out
}

function formatCatalogRunStatus(status: unknown): string {
  const normalized = String(status || '').toLowerCase()
  if (['success', 'succeeded', 'completed'].includes(normalized)) return '同步完成'
  if (['running', 'processing'].includes(normalized)) return '正在同步'
  if (['queued', 'pending'].includes(normalized)) return '等待同步'
  if (['failed', 'error'].includes(normalized)) return '同步失败'
  if (['cancelled', 'canceled'].includes(normalized)) return '已取消'
  return '状态未知'
}

export default function DatasetDbCatalogPage() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const params = useParams()
  const datasetId = asDatasetId((params as Record<string, unknown>)?.id)

  const [engine, setEngine] = useState<'all' | 'mysql' | 'sqlserver'>('all')
  const [query, setQuery] = useState('')

  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [syncOpen, setSyncOpen] = useState(false)
  const [syncConnectorId, setSyncConnectorId] = useState<'sqlserver_catalog' | 'mysql_catalog'>(
    'sqlserver_catalog'
  )
  const [syncHost, setSyncHost] = useState('')
  const [syncPort, setSyncPort] = useState<number>(1433)
  const [syncDatabase, setSyncDatabase] = useState('')
  const [syncUsername, setSyncUsername] = useState('')
  const [syncPassword, setSyncPassword] = useState('')
  const [syncIncludeSchemas, setSyncIncludeSchemas] = useState('')
  const [syncIncludeTables, setSyncIncludeTables] = useState('')
  const [syncMaxTables, setSyncMaxTables] = useState<number>(200)
  const [syncProfileEnabled, setSyncProfileEnabled] = useState(true)
  const [syncSubmitting, setSyncSubmitting] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  const catalogListParams = useMemo(
    () => ({
      skip: 0,
      limit: DB_CATALOG_LIST_LIMIT,
      engine: engine === 'all' ? undefined : engine,
      q: query.trim() ? query.trim() : undefined,
    }),
    [engine, query]
  )
  const datasetQuery = useQuery({
    queryKey: queryKeys.datasets.detail(datasetId || ''),
    queryFn: () => {
      if (!datasetId) throw new Error('缺少数据集 ID')
      return datasetApi.get(datasetId)
    },
    enabled: Boolean(datasetId),
  })
  const catalogTablesQuery = useQuery({
    queryKey: queryKeys.datasets.dbCatalogTables(datasetId || '', catalogListParams),
    queryFn: () => {
      if (!datasetId) throw new Error('缺少数据集 ID')
      return datasetApi.listDbCatalogTables(datasetId, catalogListParams)
    },
    enabled: Boolean(datasetId),
  })
  const latestRunQueryKey = queryKeys.connectors.runs({
    dataset_id: datasetId || '',
    limit: 10,
  })
  const latestRunQuery = useQuery({
    queryKey: latestRunQueryKey,
    queryFn: () => {
      if (!datasetId) throw new Error('缺少数据集 ID')
      return connectorApi.listRuns({ dataset_id: datasetId, limit: 10 })
    },
    enabled: Boolean(datasetId),
  })
  const dataset = (datasetQuery.data ?? null) as Dataset | null
  const items: DbCatalogTableSummary[] = useMemo(
    () => catalogTablesQuery.data?.items || [],
    [catalogTablesQuery.data?.items]
  )
  const effectiveSelectedId = useMemo(() => {
    if (selectedId && items.some((table) => table.id === selectedId)) return selectedId
    return items[0]?.id ?? null
  }, [items, selectedId])
  const selectedTableSummary = useMemo(
    () => items.find((table) => table.id === effectiveSelectedId) ?? null,
    [effectiveSelectedId, items]
  )
  const latestRun = useMemo<ConnectorRunOut | null>(() => {
    const runs = latestRunQuery.data?.items || []
    const catalogRun = runs.find((run) =>
      ['mysql_catalog', 'sqlserver_catalog'].includes(String(run.connector_id || '').toLowerCase())
    )
    return catalogRun || null
  }, [latestRunQuery.data?.items])
  const datasetUnavailable = datasetQuery.isError && datasetQuery.data === undefined
  const datasetRefreshFailed = datasetQuery.isError && datasetQuery.data !== undefined
  const catalogUnavailable = catalogTablesQuery.isError && catalogTablesQuery.data === undefined
  const catalogRefreshFailed = catalogTablesQuery.isError && catalogTablesQuery.data !== undefined
  const latestRunUnavailable = latestRunQuery.isError && latestRunQuery.data === undefined
  const latestRunRefreshFailed = latestRunQuery.isError && latestRunQuery.data !== undefined
  const { refetch: refetchDataset } = datasetQuery
  const { refetch: refetchCatalogTables } = catalogTablesQuery
  const { refetch: refetchLatestRun } = latestRunQuery
  const refreshCatalogList = useCallback(() => {
    refetchDataset()
    refetchCatalogTables()
  }, [refetchCatalogTables, refetchDataset])
  const entitlementHash = useMemo(() => {
    const maybeHash = (
      latestRun?.stats as { result?: { entitlement_hash?: unknown } } | null | undefined
    )?.result?.entitlement_hash
    return typeof maybeHash === 'string' ? maybeHash : undefined
  }, [latestRun])
  const detailQuery = useQuery({
    queryKey: queryKeys.datasets.dbCatalogTableDetail(datasetId || '', effectiveSelectedId || ''),
    queryFn: () => {
      if (!datasetId || !effectiveSelectedId) throw new Error('缺少表 ID')
      return datasetApi.getDbCatalogTable(datasetId, effectiveSelectedId)
    },
    enabled: Boolean(datasetId && effectiveSelectedId),
  })
  const latestProfileQuery = useQuery({
    queryKey: queryKeys.datasets.dbCatalogProfiles(datasetId || '', {
      table_id: effectiveSelectedId || '',
      entitlement_hash: entitlementHash,
      skip: 0,
      limit: 1,
    }),
    queryFn: () => {
      if (!datasetId || !effectiveSelectedId) throw new Error('缺少表 ID')
      return datasetApi.listDbCatalogProfiles(datasetId, {
        table_id: effectiveSelectedId,
        entitlement_hash: entitlementHash,
        skip: 0,
        limit: 1,
      })
    },
    enabled: Boolean(datasetId && effectiveSelectedId),
  })
  const selected = effectiveSelectedId ? (detailQuery.data ?? null) : null
  const selectedForHeader = selected ?? selectedTableSummary
  const latestProfile: DbProfileSnapshot | null = effectiveSelectedId
    ? latestProfileQuery.data?.items?.[0] || null
    : null
  const detailUnavailable = detailQuery.isError && detailQuery.data === undefined
  const detailRefreshFailed = detailQuery.isError && detailQuery.data !== undefined
  const profileUnavailable = latestProfileQuery.isError && latestProfileQuery.data === undefined
  const profileRefreshFailed = latestProfileQuery.isError && latestProfileQuery.data !== undefined

  useEffect(() => {
    setSyncPort(syncConnectorId === 'sqlserver_catalog' ? 1433 : 3306)
  }, [syncConnectorId])

  const submitSync = useCallback(async () => {
    if (!datasetId) return
    const host = syncHost.trim()
    const database = syncDatabase.trim()
    const username = syncUsername.trim()
    const password = syncPassword
    if (!host || !database || !username || !password) {
      setSyncError('主机地址、数据库名、用户名和密码均为必填项')
      return
    }

    const defaultPort = syncConnectorId === 'sqlserver_catalog' ? 1433 : 3306
    const normalizedPort = Number.isFinite(syncPort) ? Math.trunc(syncPort) : defaultPort
    if (normalizedPort < 1 || normalizedPort > 65535) {
      setSyncError('端口必须在 1 到 65535 之间')
      return
    }
    const normalizedMaxTables = Number.isFinite(syncMaxTables) ? Math.trunc(syncMaxTables) : 200
    if (normalizedMaxTables < 1 || normalizedMaxTables > 2000) {
      setSyncError('最多同步表数必须在 1 到 2000 之间')
      return
    }

    const cfg: DbCatalogSyncConfig = {
      host,
      port: normalizedPort,
      database,
      username,
      password,
      max_tables: normalizedMaxTables,
      profile_enabled: Boolean(syncProfileEnabled),
      include_tables: parseNameList(syncIncludeTables, 500),
    }
    if (syncConnectorId === 'sqlserver_catalog') {
      cfg.include_schemas = parseNameList(syncIncludeSchemas, 200)
    }

    setSyncSubmitting(true)
    setSyncError(null)
    try {
      const run = await connectorApi.createRun({
        connector_id: syncConnectorId,
        dataset_id: datasetId,
        config: cfg,
      })
      queryClient.setQueryData<ConnectorRunListResponse | undefined>(
        latestRunQueryKey,
        (current) => {
          const items = current?.items || []
          const nextItems = [run, ...items.filter((item) => item.id !== run.id)].slice(0, 10)
          return {
            total: Math.max(current?.total || 0, nextItems.length),
            items: nextItems,
          }
        }
      )
      toast.success(`已创建同步任务：${run.id.slice(0, 8)}`)
      setSyncOpen(false)
      setSyncPassword('')
      // 同步任务异步执行，短暂延迟后刷新首轮状态。
      globalThis.window.setTimeout(() => {
        refreshCatalogList()
        refetchLatestRun()
      }, 1500)
    } catch (e: unknown) {
      reportClientError('Failed to create DB catalog run', e)
      setSyncError('创建同步任务失败，请检查连接信息和服务状态后重试')
    } finally {
      setSyncSubmitting(false)
    }
  }, [
    datasetId,
    refreshCatalogList,
    syncConnectorId,
    syncDatabase,
    syncHost,
    syncIncludeSchemas,
    syncIncludeTables,
    syncMaxTables,
    syncPassword,
    syncPort,
    syncProfileEnabled,
    syncUsername,
    latestRunQueryKey,
    queryClient,
    refetchLatestRun,
  ])

  useEffect(() => {
    if (datasetQuery.error) {
      reportClientError('Failed to load dataset for DB catalog', datasetQuery.error)
    }
  }, [datasetQuery.error])

  useEffect(() => {
    if (catalogTablesQuery.error) {
      reportClientError('Failed to load DB catalog tables', catalogTablesQuery.error)
    }
  }, [catalogTablesQuery.error])

  useEffect(() => {
    if (latestRunQuery.error) {
      reportClientError('Failed to load DB catalog runs', latestRunQuery.error)
    }
  }, [latestRunQuery.error])

  useEffect(() => {
    if (detailQuery.error) {
      reportClientError('Failed to load DB catalog table detail', detailQuery.error)
    }
  }, [detailQuery.error])

  useEffect(() => {
    if (latestProfileQuery.error) {
      reportClientError('Failed to load DB catalog profile', latestProfileQuery.error)
    }
  }, [latestProfileQuery.error])

  const selectedHeaderSummary = useMemo(() => {
    if (!selectedForHeader) return null
    const name = formatQualifiedName(selectedForHeader)
    const rowCount = (() => {
      const v = latestProfile?.profile?.row_count_estimate
      if (v === null || v === undefined) return null
      if (typeof v === 'number' && Number.isFinite(v)) return v
      const n = typeof v === 'string' ? Number.parseInt(v, 10) : Number.NaN
      return Number.isFinite(n) ? n : null
    })()
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline" className="rounded-md font-mono">
          {name}
        </Badge>
        <Badge variant="soft" className="rounded-md font-mono">
          {ENGINE_LABELS[selectedForHeader.engine as keyof typeof ENGINE_LABELS] ||
            selectedForHeader.engine}
        </Badge>
        <Badge variant="soft" className="rounded-md font-mono">
          {selectedForHeader.table_type}
        </Badge>
        {rowCount === null ? null : (
          <Badge variant="soft" className="rounded-md tabular-nums">
            约 {rowCount.toLocaleString()} 行
          </Badge>
        )}
        {selected?.columns?.length ? (
          <Badge variant="soft" className="rounded-md tabular-nums">
            {selected.columns.length} 列
          </Badge>
        ) : null}
      </div>
    )
  }, [latestProfile, selected, selectedForHeader])
  const catalogTotal = catalogTablesQuery.data?.total ?? items.length
  const latestRunSummary = useMemo(() => {
    if (!latestRun) {
      return {
        status: '暂无同步',
        connector: '—',
        runId: '—',
        tables: 0,
        columns: 0,
        profiles: 0,
        freshness: null as string | null,
        diffTotal: 0,
        ta: 0,
        tr: 0,
        ca: 0,
        cr: 0,
        cc: 0,
        taItems: [] as string[],
        trItems: [] as string[],
        caItems: [] as string[],
        crItems: [] as string[],
        ccItems: [] as SchemaColumnChange[],
      }
    }

    const stats = isRecord(latestRun.stats) ? latestRun.stats : {}
    const result = isRecord(stats.result) ? stats.result : {}
    const schemaDoc = isRecord(stats.schema_doc) ? stats.schema_doc : {}
    const diff = isRecord(schemaDoc.schema_diff) ? schemaDoc.schema_diff : {}
    const ageSecRaw = schemaDoc.catalog_age_sec
    const ageSec = typeof ageSecRaw === 'number' && Number.isFinite(ageSecRaw) ? ageSecRaw : null
    const freshness = (() => {
      if (ageSec === null) return null
      if (ageSec < 90) return `${Math.round(ageSec)} 秒前`
      if (ageSec < 3600) return `${Math.round(ageSec / 60)} 分钟前`
      return `${Math.round(ageSec / 3600)} 小时前`
    })()
    const tables = Number(result.tables ?? schemaDoc.tables ?? 0)
    const columns = Number(result.columns_upserted ?? schemaDoc.columns ?? 0)
    const profiles = Number(result.profiles_written ?? schemaDoc.tables_with_profiles ?? 0)
    const tablesAdded = isRecord(diff.tables_added) ? diff.tables_added : {}
    const tablesRemoved = isRecord(diff.tables_removed) ? diff.tables_removed : {}
    const columnsAdded = isRecord(diff.columns_added) ? diff.columns_added : {}
    const columnsRemoved = isRecord(diff.columns_removed) ? diff.columns_removed : {}
    const columnsChanged = isRecord(diff.columns_changed) ? diff.columns_changed : {}
    const ta = Number(tablesAdded.count ?? 0)
    const tr = Number(tablesRemoved.count ?? 0)
    const ca = Number(columnsAdded.count ?? 0)
    const cr = Number(columnsRemoved.count ?? 0)
    const cc = Number(columnsChanged.count ?? 0)

    return {
      status: formatCatalogRunStatus(latestRun.status),
      connector: String(latestRun.connector_id || '未知连接器'),
      runId: latestRun.id.slice(0, 8),
      tables: Number.isFinite(tables) ? tables : 0,
      columns: Number.isFinite(columns) ? columns : 0,
      profiles: Number.isFinite(profiles) ? profiles : 0,
      freshness,
      diffTotal: ta + tr + ca + cr + cc,
      ta,
      tr,
      ca,
      cr,
      cc,
      taItems: stringItems(tablesAdded.items),
      trItems: stringItems(tablesRemoved.items),
      caItems: stringItems(columnsAdded.items),
      crItems: stringItems(columnsRemoved.items),
      ccItems: columnChangeItems(columnsChanged.items),
    }
  }, [latestRun])

  return (
    <AppFrame>
      <DatasetDetailShell
        activeSection="db-catalog"
        datasetId={datasetId || ''}
        datasetName={dataset?.name}
        title="数据库目录"
        description="同步数据库结构与安全画像，不读取或外发原始行数据。"
        icon={Database}
        bodyClassName="h-full overflow-hidden bg-background pb-3"
        bodyContainerClassName="h-full min-h-0 overflow-hidden"
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 rounded-md">
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                  更多操作
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-md">
                <DropdownMenuItem
                  disabled={!datasetId}
                  onSelect={() => {
                    if (datasetId) {
                      router.push(
                        `/knowledge?tab=settings&dataset=${encodeURIComponent(datasetId)}`
                      )
                    }
                  }}
                >
                  打开导入任务
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {datasetId ? (
              <Button
                size="sm"
                className="h-9 rounded-md"
                onClick={() => {
                  setSyncError(null)
                  setSyncOpen(true)
                }}
              >
                <Play className="size-4" aria-hidden="true" />
                新建同步
              </Button>
            ) : null}
          </>
        }
      >
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto xl:overflow-hidden">
          {datasetUnavailable || datasetRefreshFailed ? (
            <QueryErrorState
              title={datasetUnavailable ? '无法加载数据集信息' : '刷新数据集信息失败'}
              description={
                datasetUnavailable
                  ? '数据库目录仍可单独加载；数据集名称暂时无法获取。'
                  : '当前仍显示上次成功加载的数据集信息。'
              }
              onRetry={() => datasetQuery.refetch()}
              retrying={datasetQuery.isFetching}
            />
          ) : null}

          <div className="grid min-h-full flex-1 grid-cols-1 gap-3 xl:h-full xl:min-h-0 xl:grid-cols-[360px_minmax(0,1fr)]">
            <Panel className="flex min-h-[460px] flex-col overflow-hidden rounded-md border-border bg-card p-0 shadow-none xl:min-h-0">
              <div className="shrink-0 border-b border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-foreground">数据库表</div>
                    <div className="mt-1 text-sm leading-5 text-muted-foreground">
                      最多展示 {DB_CATALOG_LIST_LIMIT} 张表，可按名称、结构或数据库类型筛选。
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0 rounded-md font-mono text-xs">
                    {items.length}/{catalogTotal}
                  </Badge>
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-background px-3 shadow-none">
                  <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="搜索数据库表"
                    placeholder="搜索数据库、结构或表名"
                    className="focus-ring h-9 border-0 bg-transparent px-0 text-sm shadow-none"
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ENGINE_OPTIONS.map((k) => (
                    <Button
                      key={k}
                      type="button"
                      variant={engine === k ? 'secondary' : 'outline'}
                      size="sm"
                      className={cn(
                        'h-8 rounded-md px-2.5 text-xs',
                        engine === k
                          ? 'border-primary/30 bg-primary/10 text-primary'
                          : 'bg-background'
                      )}
                      onClick={() => setEngine(k)}
                    >
                      {ENGINE_LABELS[k]}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex-1 p-2 xl:min-h-0 xl:overflow-y-auto">
                {(() => {
                  if (catalogUnavailable) {
                    return (
                      <QueryErrorState
                        title="无法加载数据库目录"
                        description="暂时无法获取数据库表，请重新加载。"
                        onRetry={() => catalogTablesQuery.refetch()}
                        retrying={catalogTablesQuery.isFetching}
                      />
                    )
                  }
                  if (catalogTablesQuery.isLoading) {
                    return (
                      <div className="space-y-2">
                        <Skeleton className="h-12 w-full rounded-md" />
                        <Skeleton className="h-12 w-full rounded-md" />
                        <Skeleton className="h-12 w-full rounded-md" />
                        <Skeleton className="h-12 w-full rounded-md" />
                      </div>
                    )
                  }
                  if (items.length) {
                    return (
                      <div className="space-y-2">
                        {catalogRefreshFailed ? (
                          <QueryErrorState
                            title="刷新数据库目录失败"
                            description="当前仍显示上次成功加载的数据库表。"
                            onRetry={() => catalogTablesQuery.refetch()}
                            retrying={catalogTablesQuery.isFetching}
                          />
                        ) : null}
                        <div className="space-y-1.5">
                          {items.map((t) => {
                            const active = t.id === effectiveSelectedId
                            return (
                              <button
                                key={t.id}
                                type="button"
                                className={cn(
                                  'w-full rounded-md px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                                  active
                                    ? 'bg-primary/10 text-foreground'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                )}
                                aria-pressed={active}
                                onClick={() => setSelectedId(t.id)}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="truncate font-mono text-sm tabular-nums text-foreground">
                                      {formatQualifiedName(t)}
                                    </div>
                                    <div className="mt-1 truncate text-xs text-muted-foreground">
                                      {t.comment || '暂无备注'}
                                    </div>
                                  </div>
                                  <Badge
                                    variant="outline"
                                    className="shrink-0 rounded-md font-mono text-xs"
                                  >
                                    {ENGINE_LABELS[t.engine as keyof typeof ENGINE_LABELS] ||
                                      t.engine}
                                  </Badge>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  }
                  if (catalogRefreshFailed) {
                    return (
                      <QueryErrorState
                        title="刷新数据库目录失败"
                        description="当前没有可显示的旧目录，请重新加载。"
                        onRetry={() => catalogTablesQuery.refetch()}
                        retrying={catalogTablesQuery.isFetching}
                      />
                    )
                  }
                  return (
                    <div className="rounded-md border border-dashed border-border bg-muted/30 p-4">
                      <div className="text-sm font-semibold text-foreground">暂无数据库目录</div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">
                        先运行 SQL Server 或 MySQL
                        目录同步。该流程只同步结构与安全统计，不读取原始行。
                      </div>
                    </div>
                  )
                })()}
              </div>

              <div className="shrink-0 border-t border-border p-3">
                {latestRunUnavailable || latestRunRefreshFailed ? (
                  <QueryErrorState
                    title={latestRunUnavailable ? '同步状态加载失败' : '刷新同步状态失败'}
                    description={
                      latestRunUnavailable
                        ? '暂时无法获取最近的目录同步任务。'
                        : '当前仍显示上次成功加载的同步状态。'
                    }
                    onRetry={() => latestRunQuery.refetch()}
                    retrying={latestRunQuery.isFetching}
                    className="mb-3"
                  />
                ) : latestRunQuery.isLoading ? (
                  <div className="mb-3 space-y-2" aria-label="正在加载同步状态">
                    <Skeleton className="h-6 w-full rounded-md" />
                    <Skeleton className="h-6 w-2/3 rounded-md" />
                  </div>
                ) : null}
                {!latestRunUnavailable && !latestRunQuery.isLoading ? (
                  <>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <Badge variant="outline" className="rounded-md text-xs">
                        {latestRunSummary.status}
                      </Badge>
                      <Badge variant="outline" className="rounded-md font-mono text-xs">
                        {latestRunSummary.connector}
                      </Badge>
                      <Badge variant="soft" className="rounded-md font-mono text-xs">
                        任务 {latestRunSummary.runId}
                      </Badge>
                      <Badge variant="soft" className="rounded-md text-xs">
                        {latestRunSummary.tables} 张表
                      </Badge>
                      <Badge variant="soft" className="rounded-md text-xs">
                        {latestRunSummary.columns} 列
                      </Badge>
                      <Badge variant="soft" className="rounded-md text-xs">
                        {latestRunSummary.profiles} 份画像
                      </Badge>
                      {latestRunSummary.freshness ? (
                        <Badge variant="soft" className="rounded-md text-xs">
                          {latestRunSummary.freshness}
                        </Badge>
                      ) : null}
                    </div>
                    {latestRunSummary.diffTotal > 0 ? (
                      <details className="mt-2 rounded-md border border-border px-3 py-2">
                        <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground">
                          结构变化：新增表 {latestRunSummary.ta} / 删除表 {latestRunSummary.tr} /
                          新增列 {latestRunSummary.ca} / 删除列 {latestRunSummary.cr} / 变更列{' '}
                          {latestRunSummary.cc}
                        </summary>
                        <div className="mt-2 max-h-40 space-y-2 overflow-y-auto text-xs">
                          {latestRunSummary.taItems.length ? (
                            <div>
                              <div className="font-semibold text-foreground">新增表</div>
                              <div className="mt-1 break-words font-mono text-muted-foreground">
                                {latestRunSummary.taItems.join(', ')}
                              </div>
                            </div>
                          ) : null}
                          {latestRunSummary.trItems.length ? (
                            <div>
                              <div className="font-semibold text-foreground">删除表</div>
                              <div className="mt-1 break-words font-mono text-muted-foreground">
                                {latestRunSummary.trItems.join(', ')}
                              </div>
                            </div>
                          ) : null}
                          {latestRunSummary.caItems.length ? (
                            <div>
                              <div className="font-semibold text-foreground">新增列</div>
                              <div className="mt-1 break-words font-mono text-muted-foreground">
                                {latestRunSummary.caItems.join(', ')}
                              </div>
                            </div>
                          ) : null}
                          {latestRunSummary.crItems.length ? (
                            <div>
                              <div className="font-semibold text-foreground">删除列</div>
                              <div className="mt-1 break-words font-mono text-muted-foreground">
                                {latestRunSummary.crItems.join(', ')}
                              </div>
                            </div>
                          ) : null}
                          {latestRunSummary.ccItems.length ? (
                            <div>
                              <div className="font-semibold text-foreground">变更列</div>
                              <div className="mt-1 space-y-1 font-mono text-muted-foreground">
                                {latestRunSummary.ccItems.slice(0, 20).map((it) => {
                                  const key = `${toTrimmedPrimitiveString(it?.table)}.${toTrimmedPrimitiveString(it?.column)}`
                                  return (
                                    <div key={key} className="break-words">
                                      {key} ({toTrimmedPrimitiveString(it?.old?.data_type)} →{' '}
                                      {toTrimmedPrimitiveString(it?.new?.data_type)})
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </details>
                    ) : null}
                  </>
                ) : null}
              </div>
            </Panel>

            <Panel className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-md border-border bg-card p-0 shadow-none xl:min-h-0">
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0 space-y-1.5">
                  <div className="text-base font-semibold text-foreground">表结构</div>
                  {selectedHeaderSummary || (
                    <div className="text-xs text-muted-foreground">请选择一张表查看结构。</div>
                  )}
                </div>
              </div>

              <div className="flex-1 p-3 xl:min-h-0 xl:overflow-y-auto">
                {(() => {
                  if (!effectiveSelectedId) {
                    return (
                      <div className="flex h-full min-h-[260px] items-center justify-center rounded-md border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
                        请选择一张表查看结构。
                      </div>
                    )
                  }
                  if (detailUnavailable) {
                    return (
                      <QueryErrorState
                        title="表结构加载失败"
                        description="表格已选中，但字段结构暂时无法获取。"
                        onRetry={() => detailQuery.refetch()}
                        retrying={detailQuery.isFetching}
                      />
                    )
                  }
                  if (detailQuery.isLoading) {
                    return (
                      <div className="space-y-2">
                        <Skeleton className="h-8 w-44 rounded-md" />
                        <Skeleton className="h-11 w-full rounded-md" />
                        <Skeleton className="h-11 w-full rounded-md" />
                        <Skeleton className="h-11 w-full rounded-md" />
                      </div>
                    )
                  }
                  if (selected) {
                    return (
                      <div className="space-y-3">
                        {detailRefreshFailed ? (
                          <QueryErrorState
                            title="刷新表结构失败"
                            description="当前仍显示上次成功加载的字段结构。"
                            onRetry={() => detailQuery.refetch()}
                            retrying={detailQuery.isFetching}
                          />
                        ) : null}
                        {profileUnavailable || profileRefreshFailed ? (
                          <QueryErrorState
                            title={profileUnavailable ? '安全画像加载失败' : '刷新安全画像失败'}
                            description={
                              profileUnavailable
                                ? '字段结构不受影响；当前无法获取这张表的安全画像。'
                                : '当前仍显示上次成功加载的安全画像。'
                            }
                            onRetry={() => latestProfileQuery.refetch()}
                            retrying={latestProfileQuery.isFetching}
                          />
                        ) : null}
                        <div className="overflow-x-auto rounded-md border border-border">
                          <div className="min-w-[560px]">
                            <div className="grid grid-cols-12 gap-0 bg-muted/40 text-xs font-semibold text-muted-foreground">
                              <div className="col-span-5 px-3 py-2">字段名</div>
                              <div className="col-span-4 px-3 py-2">数据类型</div>
                              <div className="col-span-3 px-3 py-2">允许为空</div>
                            </div>
                            {selected.columns?.length ? (
                              <div className="divide-y divide-border/60 dark:divide-border/60">
                                {selected.columns.map((column) => (
                                  <div
                                    key={column.id}
                                    className="grid grid-cols-12 gap-0 text-xs hover:bg-info/5"
                                  >
                                    <div className="col-span-5 truncate px-3 py-2.5 font-mono text-foreground">
                                      {column.name}
                                    </div>
                                    <div className="col-span-4 truncate px-3 py-2.5 font-mono text-muted-foreground">
                                      {column.data_type || '—'}
                                    </div>
                                    <div className="col-span-3 px-3 py-2.5 font-mono text-muted-foreground">
                                      {(() => {
                                        if (
                                          column.nullable === null ||
                                          column.nullable === undefined
                                        )
                                          return '—'
                                        return column.nullable ? '是' : '否'
                                      })()}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="p-5 text-sm text-muted-foreground">
                                暂无列信息，可能尚未完成同步。
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  }
                  return null
                })()}
              </div>
            </Panel>
          </div>
        </div>

        <Dialog
          open={syncOpen}
          onOpenChange={(open) => {
            setSyncOpen(open)
            if (!open) {
              setSyncError(null)
              setSyncPassword('')
            }
          }}
        >
          <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto rounded-md">
            <DialogHeader>
              <DialogTitle>数据库目录同步</DialogTitle>
              <DialogDescription>
                仅同步结构与安全画像（聚合统计）；不读取原始行，不向大模型外发数据库行数据。
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>数据库类型</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={syncConnectorId === 'sqlserver_catalog' ? 'secondary' : 'outline'}
                    size="sm"
                    className="rounded-md"
                    onClick={() => setSyncConnectorId('sqlserver_catalog')}
                  >
                    SQL Server
                  </Button>
                  <Button
                    type="button"
                    variant={syncConnectorId === 'mysql_catalog' ? 'secondary' : 'outline'}
                    size="sm"
                    className="rounded-md"
                    onClick={() => setSyncConnectorId('mysql_catalog')}
                  >
                    MySQL
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="catalog-host">主机地址</Label>
                  <Input
                    id="catalog-host"
                    value={syncHost}
                    onChange={(e) => setSyncHost(e.target.value)}
                    placeholder="db.example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="catalog-port">端口</Label>
                  <Input
                    id="catalog-port"
                    type="number"
                    min={1}
                    max={65535}
                    value={String(syncPort)}
                    onChange={(e) => setSyncPort(Number.parseInt(e.target.value || '0', 10) || 0)}
                    inputMode="numeric"
                    placeholder={syncConnectorId === 'sqlserver_catalog' ? '1433' : '3306'}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="catalog-database">数据库名</Label>
                  <Input
                    id="catalog-database"
                    value={syncDatabase}
                    onChange={(e) => setSyncDatabase(e.target.value)}
                    placeholder="demo"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="catalog-username">用户名</Label>
                  <Input
                    id="catalog-username"
                    value={syncUsername}
                    onChange={(e) => setSyncUsername(e.target.value)}
                    placeholder="svc_reader"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="catalog-password">密码</Label>
                <Input
                  id="catalog-password"
                  type="password"
                  value={syncPassword}
                  onChange={(e) => setSyncPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>

              {syncConnectorId === 'sqlserver_catalog' ? (
                <div className="space-y-2">
                  <Label htmlFor="catalog-schemas">包含的数据库结构（可选）</Label>
                  <Textarea
                    id="catalog-schemas"
                    value={syncIncludeSchemas}
                    onChange={(e) => setSyncIncludeSchemas(e.target.value)}
                    placeholder="dbo\nsales"
                    rows={2}
                  />
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="catalog-tables">包含的表（可选）</Label>
                <Textarea
                  id="catalog-tables"
                  value={syncIncludeTables}
                  onChange={(e) => setSyncIncludeTables(e.target.value)}
                  placeholder={
                    syncConnectorId === 'sqlserver_catalog'
                      ? 'dbo.users\ndbo.orders'
                      : 'users\norders'
                  }
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="catalog-max-tables">最多同步表数</Label>
                  <Input
                    id="catalog-max-tables"
                    type="number"
                    min={1}
                    max={2000}
                    value={String(syncMaxTables)}
                    onChange={(e) =>
                      setSyncMaxTables(Number.parseInt(e.target.value || '0', 10) || 0)
                    }
                    inputMode="numeric"
                    placeholder="200"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">安全画像</div>
                    <div className="text-xs text-muted-foreground text-pretty truncate">
                      记录预估行数等聚合统计
                    </div>
                  </div>
                  <Switch
                    checked={syncProfileEnabled}
                    onCheckedChange={setSyncProfileEnabled}
                    aria-label="启用安全画像"
                  />
                </div>
              </div>

              {syncError ? (
                <div role="alert" className="text-pretty text-sm text-destructive">
                  {syncError}
                </div>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setSyncOpen(false)}
                disabled={syncSubmitting}
              >
                取消
              </Button>
              <Button onClick={submitSync} disabled={syncSubmitting}>
                <Play className="size-4" aria-hidden="true" />
                {syncSubmitting ? '正在创建' : '开始同步'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DatasetDetailShell>
    </AppFrame>
  )
}
