'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Play, Sparkles, Table2 } from 'lucide-react'

import { AppFrame } from '@/components/app-frame'
import { DatasetDetailShell } from '@/components/datasets/dataset-detail-shell'
import { Panel } from '@/components/ui/panel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { QueryErrorState } from '@/components/ui/query-error-state'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Link } from '@/i18n/navigation'
import { datasetApi } from '@/lib/api'
import { reportClientError } from '@/lib/client-logging'
import { toTrimmedPrimitiveString } from '@/lib/primitive-text'
import { queryKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'

import type { Dataset, DatasetTableAsset, TableAskResponse, TableQueryResponse } from '@/types'

function asDatasetId(raw: unknown): string | null {
  if (typeof raw === 'string' && raw.trim()) return raw
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0]
  return null
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return toTrimmedPrimitiveString(v)
  }
}

const TABLE_ASSET_LIST_PARAMS = { skip: 0, limit: 200 } as const

function TableResult({
  ariaLabel,
  result,
}: Readonly<{
  ariaLabel: string
  result: TableQueryResponse
}>) {
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <span>{(result.columns || []).length} 列</span>
        <span>{(result.rows || []).length} 行</span>
        {result.truncated ? (
          <Badge variant="soft" className="h-5 rounded-md px-1.5 text-xs">
            结果已截断
          </Badge>
        ) : null}
      </div>
      <div className="max-h-[320px] overflow-auto">
        <table aria-label={ariaLabel} className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              {(result.columns || []).map((column) => (
                <th
                  key={column}
                  className="whitespace-nowrap px-3 py-2 text-left font-mono font-semibold"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(result.rows || []).map((row, rowIndex) => (
              <tr
                key={`result-row-${rowIndex}`}
                className="border-b border-border/60 last:border-b-0"
              >
                {(row || []).map((value, columnIndex) => (
                  <td
                    key={`result-cell-${rowIndex}-${columnIndex}`}
                    className="whitespace-nowrap px-3 py-2 font-mono"
                  >
                    {renderValue(value)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function DatasetTablesPage() {
  const params = useParams()
  const datasetId = asDatasetId((params as Record<string, unknown>)?.id)

  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)

  const [querySql, setQuerySql] = useState('SELECT * FROM "sheet_0" LIMIT 20')
  const [queryRes, setQueryRes] = useState<TableQueryResponse | null>(null)
  const [queryRunning, setQueryRunning] = useState(false)
  const [queryFailed, setQueryFailed] = useState(false)

  const [question, setQuestion] = useState('')
  const [askRes, setAskRes] = useState<TableAskResponse | null>(null)
  const [askRunning, setAskRunning] = useState(false)
  const [askFailed, setAskFailed] = useState(false)

  const [semFilterInstruction, setSemFilterInstruction] = useState('')
  const [semFilterRes, setSemFilterRes] = useState<TableQueryResponse | null>(null)
  const [semFilterRunning, setSemFilterRunning] = useState(false)
  const [semFilterFailed, setSemFilterFailed] = useState(false)

  const datasetQuery = useQuery({
    queryKey: queryKeys.datasets.detail(datasetId || ''),
    queryFn: () => {
      if (!datasetId) throw new Error('缺少数据集 ID')
      return datasetApi.get(datasetId)
    },
    enabled: Boolean(datasetId),
  })
  const tablesQuery = useQuery({
    queryKey: queryKeys.datasets.tables(datasetId || '', TABLE_ASSET_LIST_PARAMS),
    queryFn: () => {
      if (!datasetId) throw new Error('缺少数据集 ID')
      return datasetApi.listTables(datasetId, TABLE_ASSET_LIST_PARAMS)
    },
    enabled: Boolean(datasetId),
  })
  const dataset = (datasetQuery.data ?? null) as Dataset | null
  const items: DatasetTableAsset[] = useMemo(
    () => tablesQuery.data?.items || [],
    [tablesQuery.data?.items]
  )
  const effectiveSelectedTableId = useMemo(() => {
    if (selectedTableId && items.some((table) => table.table_id === selectedTableId)) {
      return selectedTableId
    }
    return items[0]?.table_id ?? null
  }, [items, selectedTableId])
  const selectedSummary = useMemo(
    () => items.find((table) => table.table_id === effectiveSelectedTableId) ?? null,
    [effectiveSelectedTableId, items]
  )
  const detailQuery = useQuery({
    queryKey: queryKeys.datasets.tableDetail(datasetId || '', effectiveSelectedTableId || ''),
    queryFn: () => {
      if (!datasetId || !effectiveSelectedTableId) throw new Error('缺少表格标识')
      return datasetApi.getTable(datasetId, effectiveSelectedTableId, {
        include_columns: true,
        include_sample_rows: true,
      })
    },
    enabled: Boolean(datasetId && effectiveSelectedTableId),
  })
  const selected = detailQuery.data ?? selectedSummary
  const tablesUnavailable = tablesQuery.isError && tablesQuery.data === undefined
  const tablesRefreshFailed = tablesQuery.isError && tablesQuery.data !== undefined
  const datasetUnavailable = datasetQuery.isError && datasetQuery.data === undefined
  const datasetRefreshFailed = datasetQuery.isError && datasetQuery.data !== undefined
  const detailUnavailable = detailQuery.isError && detailQuery.data === undefined
  const detailRefreshFailed = detailQuery.isError && detailQuery.data !== undefined

  useEffect(() => {
    if (!datasetQuery.error) return
    reportClientError('Failed to load dataset for table workspace', datasetQuery.error)
  }, [datasetQuery.error])

  useEffect(() => {
    if (!tablesQuery.error) return
    reportClientError('Failed to load dataset tables', tablesQuery.error)
  }, [tablesQuery.error])

  useEffect(() => {
    if (!detailQuery.error) return
    reportClientError('Failed to load selected table detail', detailQuery.error)
  }, [detailQuery.error])

  useEffect(() => {
    if (!effectiveSelectedTableId) return
    const sheetName = `sheet_${selectedSummary?.sheet_index || 0}`
    setQuerySql(`SELECT * FROM "${sheetName}" LIMIT 20`)
    setQueryRes(null)
    setAskRes(null)
    setSemFilterRes(null)
    setQueryFailed(false)
    setAskFailed(false)
    setSemFilterFailed(false)
  }, [effectiveSelectedTableId, selectedSummary?.sheet_index])

  const selectTable = (table: DatasetTableAsset) => {
    setSelectedTableId(table.table_id)
  }

  const runQuery = async () => {
    if (!datasetId || !selected) return
    setQueryRunning(true)
    setQueryFailed(false)
    setQueryRes(null)
    try {
      const res = await datasetApi.queryTable(datasetId, selected.table_id, { sql: querySql })
      setQueryRes(res)
    } catch (e: unknown) {
      reportClientError('Dataset table SQL query failed', e)
      setQueryFailed(true)
    } finally {
      setQueryRunning(false)
    }
  }

  const ask = async () => {
    if (!datasetId || !selected) return
    if (!question.trim()) return
    setAskRunning(true)
    setAskFailed(false)
    setAskRes(null)
    try {
      const res = await datasetApi.askTable(datasetId, selected.table_id, {
        question: question.trim(),
      })
      setAskRes(res)
    } catch (e: unknown) {
      reportClientError('Dataset table question answering failed', e)
      setAskFailed(true)
    } finally {
      setAskRunning(false)
    }
  }

  const semFilter = async () => {
    if (!datasetId || !selected) return
    if (!semFilterInstruction.trim()) return
    setSemFilterRunning(true)
    setSemFilterFailed(false)
    setSemFilterRes(null)
    try {
      const res = await datasetApi.lotusSemFilter(datasetId, selected.table_id, {
        user_instruction: semFilterInstruction.trim(),
        strategy: 'cot',
      })
      setSemFilterRes(res)
    } catch (e: unknown) {
      reportClientError('Dataset table semantic filter failed', e)
      setSemFilterFailed(true)
    } finally {
      setSemFilterRunning(false)
    }
  }

  const totalRows = items.reduce((sum, item) => sum + (Number(item.row_count) || 0), 0)
  const totalColumns = items.reduce((sum, item) => sum + (Number(item.col_count) || 0), 0)

  return (
    <AppFrame>
      <DatasetDetailShell
        activeSection="tables"
        datasetId={datasetId || ''}
        datasetName={dataset?.name}
        title="表格资产"
        description="查看结构化表格，并按需执行查询、问答和语义过滤。"
        icon={Table2}
        bodyClassName="h-full overflow-hidden bg-background pb-3"
        bodyContainerClassName="h-full min-h-0 overflow-hidden"
      >
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto xl:overflow-hidden">
          {datasetUnavailable || datasetRefreshFailed ? (
            <QueryErrorState
              title={datasetUnavailable ? '无法加载数据集信息' : '刷新数据集信息失败'}
              description={
                datasetUnavailable
                  ? '表格资产仍可单独加载；数据集名称暂时无法获取。'
                  : '当前仍显示上次成功加载的数据集信息。'
              }
              onRetry={() => datasetQuery.refetch()}
              retrying={datasetQuery.isFetching}
            />
          ) : null}

          <div className="grid min-h-full flex-1 grid-cols-1 gap-3 xl:h-full xl:min-h-0 xl:grid-cols-[280px_minmax(0,1fr)]">
            <Panel className="flex min-h-[260px] flex-col overflow-hidden rounded-md border-border bg-card shadow-none xl:min-h-0">
              <div className="border-b border-border px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">表格列表</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {tablesUnavailable
                        ? '暂时无法获取表格列表'
                        : `${items.length} 个表格 · ${totalRows} 行 · ${totalColumns} 列`}
                    </p>
                  </div>
                  {tablesQuery.isFetching ? (
                    <Loader2
                      className="size-4 animate-spin text-muted-foreground motion-reduce:animate-none"
                      aria-label="正在加载"
                    />
                  ) : null}
                </div>
              </div>

              <div className="flex-1 p-2 xl:min-h-0 xl:overflow-y-auto">
                {tablesUnavailable ? (
                  <QueryErrorState
                    title="无法加载表格资产"
                    description="暂时无法获取表格列表，请重新加载。"
                    onRetry={() => tablesQuery.refetch()}
                    retrying={tablesQuery.isFetching}
                  />
                ) : tablesQuery.isLoading ? (
                  <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 size-4 animate-spin motion-reduce:animate-none" />
                    正在加载表格资产
                  </div>
                ) : (
                  <>
                    {tablesRefreshFailed ? (
                      <QueryErrorState
                        title="刷新表格列表失败"
                        description="当前仍显示上次成功加载的表格资产。"
                        onRetry={() => tablesQuery.refetch()}
                        retrying={tablesQuery.isFetching}
                        className="mb-2"
                      />
                    ) : null}

                    {items.length === 0 ? (
                      <div className="p-3">
                        <div className="text-sm font-medium text-foreground">暂无表格资产</div>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          在入库策略中开启表格存储，再重新处理包含表格的文件。
                        </p>
                        <Button variant="outline" size="sm" className="mt-3 rounded-md" asChild>
                          <Link href={datasetId ? `/datasets/${datasetId}/ingestion` : '/datasets'}>
                            检查入库策略
                          </Link>
                        </Button>
                      </div>
                    ) : null}

                    <div className="space-y-1">
                      {items.map((table) => {
                        const active = effectiveSelectedTableId === table.table_id
                        return (
                          <button
                            key={table.table_id}
                            type="button"
                            aria-pressed={active}
                            onClick={() => selectTable(table)}
                            className={cn(
                              'w-full rounded-md px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                              active
                                ? 'bg-primary/10 text-foreground'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            )}
                          >
                            <div className="truncate text-sm font-medium">
                              {table.sheet_name || table.table_id}
                            </div>
                            {table.sheet_name ? (
                              <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                                {table.table_id}
                              </div>
                            ) : null}
                            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span>{table.row_count} 行</span>
                              <span>{table.col_count} 列</span>
                              {table.document_filename ? (
                                <span
                                  className="max-w-full truncate"
                                  title={table.document_filename}
                                >
                                  {table.document_filename}
                                </span>
                              ) : null}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            </Panel>

            <Panel className="min-h-[520px] overflow-hidden rounded-md border-border bg-card shadow-none xl:min-h-0">
              {tablesUnavailable ? (
                <div className="flex min-h-[520px] flex-col items-center justify-center px-6 py-12 text-center">
                  <div className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Table2 className="size-5" aria-hidden="true" />
                  </div>
                  <h2 className="mt-4 text-base font-semibold text-foreground">表格列表暂不可用</h2>
                  <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                    请在左侧重新加载表格资产，已有知识库数据不会受到影响。
                  </p>
                </div>
              ) : !selected ? (
                <div className="flex min-h-[520px] flex-col items-center justify-center px-6 py-12 text-center">
                  <div className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    {tablesQuery.isLoading ? (
                      <Loader2
                        className="size-5 animate-spin motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                    ) : (
                      <Table2 className="size-5" aria-hidden="true" />
                    )}
                  </div>
                  <h2 className="mt-4 text-base font-semibold text-foreground">
                    {tablesQuery.isLoading ? '正在加载表格资产' : '选择表格后开始分析'}
                  </h2>
                  <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                    选择一个表格后，可以查看字段与样例数据，并使用只读查询、自然语言问答或语义过滤。
                  </p>
                </div>
              ) : (
                <Tabs
                  defaultValue="overview"
                  className="flex min-h-[520px] flex-col xl:h-full xl:min-h-0"
                >
                  <div className="border-b border-border px-4 pt-3">
                    <div className="flex flex-col gap-3 pb-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold text-foreground">
                          {selected.sheet_name || selected.table_id}
                        </h2>
                        <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                          {selected.table_id}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {detailQuery.isFetching ? (
                          <Loader2
                            className="size-3.5 animate-spin motion-reduce:animate-none"
                            aria-label="正在加载表格详情"
                          />
                        ) : null}
                        <span>{selected.row_count} 行</span>
                        <span>{selected.col_count} 列</span>
                        {selected.truncated ? (
                          <Badge variant="soft" className="h-5 rounded-md px-1.5 text-xs">
                            数据已截断
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <TabsList className="h-10 min-w-max justify-start rounded-none bg-transparent p-0">
                        <TabsTrigger
                          value="overview"
                          className="h-10 rounded-none px-3 data-[state=active]:border-b data-[state=active]:border-primary data-[state=active]:bg-transparent"
                        >
                          表格信息
                        </TabsTrigger>
                        <TabsTrigger
                          value="sql"
                          className="h-10 rounded-none px-3 data-[state=active]:border-b data-[state=active]:border-primary data-[state=active]:bg-transparent"
                        >
                          SQL 查询
                        </TabsTrigger>
                        <TabsTrigger
                          value="ask"
                          className="h-10 rounded-none px-3 data-[state=active]:border-b data-[state=active]:border-primary data-[state=active]:bg-transparent"
                        >
                          表格问答
                        </TabsTrigger>
                        <TabsTrigger
                          value="semantic"
                          className="h-10 rounded-none px-3 data-[state=active]:border-b data-[state=active]:border-primary data-[state=active]:bg-transparent"
                        >
                          语义过滤
                        </TabsTrigger>
                      </TabsList>
                    </div>
                  </div>

                  {detailUnavailable || detailRefreshFailed ? (
                    <QueryErrorState
                      title={detailUnavailable ? '表格详情加载失败' : '刷新表格详情失败'}
                      description={
                        detailUnavailable
                          ? '表格已选中，但字段和样例数据暂时无法获取。'
                          : '当前仍显示上次成功加载的字段和样例数据。'
                      }
                      onRetry={() => detailQuery.refetch()}
                      retrying={detailQuery.isFetching}
                      className="mx-4 mt-4"
                    />
                  ) : null}

                  <div className="flex-1 xl:min-h-0 xl:overflow-y-auto">
                    <TabsContent value="overview" className="m-0 p-4">
                      <div className="grid gap-6 lg:grid-cols-[minmax(220px,0.4fr)_minmax(0,0.6fr)]">
                        <section>
                          <h3 className="text-sm font-semibold text-foreground">字段</h3>
                          <div className="mt-2 max-h-[360px] overflow-auto border-y border-border">
                            {detailQuery.isLoading ? (
                              <div className="flex items-center py-4 text-sm text-muted-foreground">
                                <Loader2 className="mr-2 size-4 animate-spin motion-reduce:animate-none" />
                                正在加载字段信息
                              </div>
                            ) : (selected.columns || []).length === 0 ? (
                              <div className="py-4 text-sm text-muted-foreground">暂无字段信息</div>
                            ) : (
                              <div className="divide-y divide-border">
                                {(selected.columns || []).map((column) => (
                                  <div
                                    key={column.name}
                                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2 text-sm"
                                  >
                                    <span className="truncate font-mono text-foreground">
                                      {column.name}
                                    </span>
                                    <span className="font-mono text-xs text-muted-foreground">
                                      {column.dtype || '未知类型'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </section>

                        <section>
                          <h3 className="text-sm font-semibold text-foreground">样例数据</h3>
                          <div className="mt-2 max-h-[360px] overflow-auto rounded-md border border-border bg-muted/20 p-3">
                            {(selected.sample_rows || []).length === 0 ? (
                              <div className="text-sm text-muted-foreground">
                                暂无样例数据，或当前未启用样例保存。
                              </div>
                            ) : (
                              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-foreground">
                                {JSON.stringify(selected.sample_rows || [], null, 2)}
                              </pre>
                            )}
                          </div>
                        </section>
                      </div>
                    </TabsContent>

                    <TabsContent value="sql" className="m-0 space-y-4 p-4">
                      <div>
                        <h3 className="text-base font-semibold text-foreground">只读 SQL 查询</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          仅支持 SELECT 或 WITH SELECT，用于核对字段和样例数据。
                        </p>
                      </div>
                      <label htmlFor="table-sql" className="text-sm font-medium text-foreground">
                        查询语句
                      </label>
                      <Textarea
                        id="table-sql"
                        value={querySql}
                        onChange={(event) => {
                          setQuerySql(event.target.value)
                          setQueryFailed(false)
                        }}
                        className="min-h-[140px] rounded-md font-mono text-sm leading-6"
                      />
                      <Button
                        className="h-9 rounded-md"
                        onClick={runQuery}
                        disabled={queryRunning || !querySql.trim()}
                      >
                        {queryRunning ? (
                          <Loader2
                            className="size-4 animate-spin motion-reduce:animate-none"
                            aria-hidden="true"
                          />
                        ) : (
                          <Play className="size-4" aria-hidden="true" />
                        )}
                        {queryRunning ? '正在执行' : '执行查询'}
                      </Button>
                      {queryFailed ? (
                        <QueryErrorState
                          title="查询执行失败"
                          description="请确认语句是只读的 SELECT 或 WITH SELECT 查询，然后重试。"
                          onRetry={runQuery}
                          retrying={queryRunning}
                        />
                      ) : null}
                      {queryRes ? (
                        <TableResult ariaLabel="数据表查询结果" result={queryRes} />
                      ) : null}
                    </TabsContent>

                    <TabsContent value="ask" className="m-0 space-y-4 p-4">
                      <div>
                        <h3 className="text-base font-semibold text-foreground">自然语言问答</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          用自然语言描述需求，系统会生成只读查询并返回答案。
                        </p>
                      </div>
                      <label
                        htmlFor="table-question"
                        className="text-sm font-medium text-foreground"
                      >
                        问题
                      </label>
                      <Input
                        id="table-question"
                        value={question}
                        onChange={(event) => {
                          setQuestion(event.target.value)
                          setAskFailed(false)
                        }}
                        className="h-10 rounded-md text-sm"
                        placeholder="例如：按地区汇总销售额前十名"
                      />
                      <Button
                        className="h-9 rounded-md"
                        onClick={ask}
                        disabled={askRunning || !question.trim()}
                      >
                        {askRunning ? (
                          <Loader2
                            className="size-4 animate-spin motion-reduce:animate-none"
                            aria-hidden="true"
                          />
                        ) : (
                          <Sparkles className="size-4" aria-hidden="true" />
                        )}
                        {askRunning ? '正在分析' : '开始问答'}
                      </Button>
                      {askFailed ? (
                        <QueryErrorState
                          title="表格问答失败"
                          description="当前无法完成表格问答，请检查模型与自然语言表格查询配置后重试。"
                          onRetry={ask}
                          retrying={askRunning}
                        />
                      ) : null}
                      <div className="border-t border-border pt-4">
                        <div className="text-sm font-medium text-foreground">回答</div>
                        <div className="mt-2 min-h-12 text-sm leading-6 text-foreground">
                          {askRes?.answer || '提交问题后，回答会显示在这里。'}
                        </div>
                        {askRes?.sql ? (
                          <pre className="mt-3 max-h-[220px] overflow-auto rounded-md border border-border bg-muted/20 p-3 font-mono text-xs leading-5 text-foreground">
                            {askRes.sql}
                          </pre>
                        ) : null}
                      </div>
                    </TabsContent>

                    <TabsContent value="semantic" className="m-0 space-y-4 p-4">
                      <div>
                        <h3 className="text-base font-semibold text-foreground">语义过滤</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          描述需要保留的记录特征，系统会对当前表格执行语义筛选。
                        </p>
                      </div>
                      <label
                        htmlFor="semantic-filter"
                        className="text-sm font-medium text-foreground"
                      >
                        筛选条件
                      </label>
                      <Input
                        id="semantic-filter"
                        value={semFilterInstruction}
                        onChange={(event) => {
                          setSemFilterInstruction(event.target.value)
                          setSemFilterFailed(false)
                        }}
                        className="h-10 rounded-md text-sm"
                        placeholder="例如：客户名称属于互联网公司"
                      />
                      <Button
                        className="h-9 rounded-md"
                        onClick={semFilter}
                        disabled={semFilterRunning || !semFilterInstruction.trim()}
                      >
                        {semFilterRunning ? (
                          <Loader2
                            className="size-4 animate-spin motion-reduce:animate-none"
                            aria-hidden="true"
                          />
                        ) : (
                          <Play className="size-4" aria-hidden="true" />
                        )}
                        {semFilterRunning ? '正在筛选' : '运行筛选'}
                      </Button>
                      {semFilterFailed ? (
                        <QueryErrorState
                          title="语义过滤失败"
                          description="当前无法完成语义筛选，请检查语义过滤与模型配置后重试。"
                          onRetry={semFilter}
                          retrying={semFilterRunning}
                        />
                      ) : null}
                      {semFilterRes ? (
                        <TableResult ariaLabel="语义过滤结果" result={semFilterRes} />
                      ) : null}
                    </TabsContent>
                  </div>
                </Tabs>
              )}
            </Panel>
          </div>
        </div>
      </DatasetDetailShell>
    </AppFrame>
  )
}
