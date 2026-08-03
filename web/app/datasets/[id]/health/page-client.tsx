'use client'

import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import { Activity, BarChart3, Download, FileSearch, RefreshCw, ShieldAlert } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Pie, PieChart, Tooltip, XAxis, YAxis } from 'recharts'

import { AppFrame } from '@/components/app-frame'
import { DatasetDetailShell } from '@/components/datasets/dataset-detail-shell'
import { Panel } from '@/components/ui/panel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard, StatsGrid } from '@/components/ui/stats-card'
import { SafeResponsiveChart } from '@/components/ui/safe-responsive-chart'

import { datasetApi } from '@/lib/api/datasets'
import { formatApiError } from '@/lib/api-errors'
import { reportClientError } from '@/lib/client-logging'
import { datasetHealthToMarkdown } from '@/lib/dataset-health-export'
import { queryKeys } from '@/lib/query-keys'
import { sanitizeFilename } from '@/lib/sanitize'
import { cn, formatDate, formatFileSize, detachPromise } from '@/lib/utils'

import type { Dataset, DatasetHealthResponse, DatasetProfileFindingSummary } from '@/types'

const PIE_COLORS = ['hsl(var(--chart-5))', 'hsl(var(--chart-2))', 'hsl(var(--chart-4))', 'hsl(var(--chart-6))', 'hsl(var(--chart-3))', 'hsl(var(--chart-1))', 'hsl(var(--chart-8))']
const healthPanelClass = 'overflow-hidden rounded-md border border-border bg-card p-4'

function asDatasetId(raw: unknown): string {
  if (typeof raw === 'string' && raw.trim()) return raw
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0]
  return ''
}

function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  globalThis.window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function sumRecordValues(m: Record<string, unknown> | undefined | null): number {
  return Object.values(m || {}).reduce<number>((acc, v) => acc + Number(v || 0), 0)
}

function suggestionBadgeVariant(sev: 'info' | 'warning' | 'error'): 'outline' | 'soft' | 'destructive' {
  if (sev === 'error') return 'destructive'
  if (sev === 'warning') return 'soft'
  return 'outline'
}

function suggestionSeverityLabel(severity: 'info' | 'warning' | 'error') {
  if (severity === 'error') return '错误'
  if (severity === 'warning') return '注意'
  return '提示'
}

export default function DatasetHealthPage() {
  const params = useParams()
  const datasetId = asDatasetId((params as Record<string, unknown>)?.id)

  const datasetQuery = useQuery({
    queryKey: queryKeys.datasets.detail(datasetId),
    queryFn: () => datasetApi.get(datasetId),
    enabled: Boolean(datasetId),
  })

  const healthQuery = useQuery({
    queryKey: queryKeys.datasets.health(datasetId),
    queryFn: () => datasetApi.getHealth(datasetId),
    enabled: Boolean(datasetId),
  })

  const dataset = (datasetQuery.data ?? null) as Dataset | null
  const health = (healthQuery.data ?? null) as DatasetHealthResponse | null
  const isLoading = datasetQuery.isFetching || healthQuery.isFetching

  const loadError = datasetQuery.error ?? healthQuery.error

  useEffect(() => {
    if (!loadError) return
    reportClientError('Failed to load dataset health', loadError)
    toast.error(formatApiError(loadError, '加载健康概览失败'))
  }, [loadError])

  const profile = health?.profile
  const ingestion = health?.ingestion

  const statusChartData = useMemo(() => {
    const m = ingestion?.by_status || profile?.by_status || {}
    const entries = Object.entries(m)
      .map(([name, value]) => ({ name, value: Number(value || 0) }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value)
    return entries.map((entry, idx) => ({ ...entry, fill: PIE_COLORS[idx % PIE_COLORS.length] }))
  }, [ingestion?.by_status, profile?.by_status])

  const fileTypeChartData = useMemo(() => {
    const m = profile?.by_file_type || {}
    const entries = Object.entries(m)
      .map(([name, value]) => ({ name, value: Number(value || 0) }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value)

    const top = entries.slice(0, 10)
    const rest = entries.slice(10)
    const other = rest.reduce((acc, x) => acc + x.value, 0)
    if (other > 0) top.push({ name: '其他', value: other })
    return top.map((entry, idx) => ({ ...entry, fill: PIE_COLORS[idx % PIE_COLORS.length] }))
  }, [profile?.by_file_type])

  const piiTotal = useMemo(() => sumRecordValues(profile?.pii_hits_total), [profile?.pii_hits_total])
  const secretsTotal = useMemo(() => sumRecordValues(profile?.secrets_hits_total), [profile?.secrets_hits_total])

  const pdfScanTotal = useMemo(() => {
    const s = profile?.pdf_scan
    if (!s) return 0
    return Number(s.scanned || 0) + Number(s.not_scanned || 0) + Number(s.unknown || 0)
  }, [profile?.pdf_scan])

  const suggestions = useMemo(() => {
    const out: Array<{ severity: 'info' | 'warning' | 'error'; title: string; detail: string }> = []
    if (!health) return out

    const failed = Number(ingestion?.failed || 0)
    const quarantined = Number(ingestion?.quarantined || 0)
    const notScanned = Number(profile?.pdf_scan?.not_scanned || 0)
    const hasFindings = (profile?.findings || []).some((f) => Number(f.count || 0) > 0)

    if (failed > 0) {
      out.push({
        severity: 'error',
        title: '失败文档偏多',
        detail: `发现 ${failed} 个失败文档，建议先查看错误原因，再重试或调整解析与切块策略。`,
      })
    }
    if (quarantined > 0) {
      out.push({
        severity: 'warning',
        title: '存在隔离文档',
        detail: `发现 ${quarantined} 个隔离文档，建议检查敏感信息、密钥线索和清洗规则。`,
      })
    }
    if (notScanned > 0) {
      out.push({
        severity: 'warning',
        title: '扫描 PDF 占比偏高',
        detail: `发现 ${notScanned} 份扫描型 PDF，建议启用文字识别或更换解析方式。`,
      })
    }
    if (piiTotal > 0) {
      out.push({
        severity: 'warning',
        title: '检测到 PII 命中',
        detail: `发现 ${piiTotal} 条个人敏感信息线索，建议启用脱敏或隔离并复核命中类型。`,
      })
    }
    if (secretsTotal > 0) {
      out.push({
        severity: 'warning',
        title: '检测到密钥线索',
        detail: `发现 ${secretsTotal} 条密钥线索，建议隔离或清洗后复查来源。`,
      })
    }
    if (!failed && !quarantined && !notScanned && !hasFindings) {
      out.push({
        severity: 'info',
        title: '健康状态良好',
        detail: '暂无明显风险信号；可继续通过画像/预检页做抽样复核。',
      })
    }

    return out
  }, [health, ingestion?.failed, ingestion?.quarantined, profile?.pdf_scan?.not_scanned, profile?.findings, piiTotal, secretsTotal])

  const exportPayload = useMemo(() => {
    if (!datasetId || !health) return null
    return {
      schema: 'mimirq.dataset_health.v1',
      exported_at: new Date().toISOString(),
      dataset: dataset
        ? {
            id: dataset.id ?? datasetId,
            name: dataset.name ?? null,
          }
        : { id: datasetId, name: null },
      health,
      suggestions,
    }
  }, [dataset, datasetId, health, suggestions])

  const topFindings: DatasetProfileFindingSummary[] = useMemo(() => {
    return (profile?.findings || [])
      .filter((f) => Number(f.count || 0) > 0)
      .sort((a, b) => Number(b.count || 0) - Number(a.count || 0))
      .slice(0, 8)
  }, [profile?.findings])
  const totalSizeLabel = profile ? formatFileSize(profile.total_size_bytes || 0) : (isLoading ? '…' : '-')
  const scannedPdfLabel = profile ? `${profile.pdf_scan?.scanned ?? 0}/${pdfScanTotal || 0}` : (isLoading ? '…' : '-')
  const piiLabel = profile ? piiTotal : (isLoading ? '…' : 0)
  const secretsLabel = profile ? secretsTotal : (isLoading ? '…' : 0)
  const riskCount = suggestions.filter((s) => s.severity !== 'info').length
  const healthStatusLabel = loadError
    ? '加载失败'
    : riskCount > 0
      ? `需处理 ${riskCount} 项`
      : health
        ? '健康良好'
        : '待加载'

  return (
    <AppFrame>
      <DatasetDetailShell
        activeSection="health"
        datasetId={datasetId}
        datasetName={dataset?.name}
        title="健康概览"
        description="汇总数据画像、入库状态和下一步处理建议。"
        icon={Activity}
        bodyClassName="bg-background"
        bodyContainerClassName="h-full min-h-full"
        actions={
          <>
            <span
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-medium',
                loadError
                  ? 'border-destructive/30 bg-destructive/10 text-destructive'
                  : riskCount > 0
                    ? 'border-warning/30 bg-warning/10 text-warning'
                    : 'border-success/30 bg-success/10 text-success'
              )}
            >
              <span
                className={cn(
                  'size-2 rounded-full',
                  loadError
                    ? 'bg-destructive'
                    : riskCount > 0
                      ? 'bg-warning'
                      : 'bg-success'
                )}
              />
              {healthStatusLabel}
            </span>
            <Button
              variant="outline"
              className="h-9 rounded-md px-3"
              onClick={() =>
                detachPromise(
                  Promise.all([
                    datasetQuery.refetch(),
                    healthQuery.refetch(),
                  ]).then(() => undefined)
                )
              }
              disabled={isLoading || !datasetId}
            >
              <RefreshCw
                className={cn(
                  'size-4',
                  isLoading && 'animate-spin motion-reduce:animate-none'
                )}
              />
              刷新
            </Button>
            <Button
              variant="outline"
              className="h-9 rounded-md px-3"
              disabled={!exportPayload}
              onClick={() => {
                if (!exportPayload) return
                const filenameBase = sanitizeFilename(
                  dataset?.name || datasetId || 'dataset'
                )
                downloadTextFile(
                  `${filenameBase}.health.json`,
                  JSON.stringify(exportPayload, null, 2),
                  'application/json;charset=utf-8'
                )
                toast.success('已导出 health.json')
              }}
            >
              <Download className="size-4" />
              导出 JSON
            </Button>
            <Button
              className="h-9 rounded-md px-3"
              disabled={!exportPayload}
              onClick={() => {
                if (!exportPayload) return
                const exportedHealth = exportPayload.health
                const filenameBase = sanitizeFilename(
                  dataset?.name || datasetId || 'dataset'
                )
                const md = datasetHealthToMarkdown({
                  datasetId: datasetId || '',
                  datasetName: dataset?.name || null,
                  exportedAt: exportPayload.exported_at,
                  generatedAt: exportedHealth.generated_at ?? null,
                  profile: exportedHealth.profile ?? null,
                  ingestion: exportedHealth.ingestion ?? null,
                  suggestions,
                })
                downloadTextFile(
                  `${filenameBase}.health.md`,
                  md,
                  'text/markdown;charset=utf-8'
                )
                toast.success('已导出 health.md')
              }}
            >
              <Download className="size-4" />
              导出 MD
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <section className="border-y border-border py-3">
            <StatsGrid dense className="grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 xl:grid-cols-7">
              <StatCard
                dense
                variant="minimal"
                className="w-full justify-start"
                icon={FileSearch}
                label="文档总数"
                value={profile?.total_documents ?? (isLoading ? '…' : 0)}
                color="cyan"
              />
              <StatCard
                dense
                variant="minimal"
                className="w-full justify-start"
                icon={BarChart3}
                label="总大小"
                value={totalSizeLabel}
                color="teal"
              />
              <StatCard
                dense
                variant="minimal"
                className="w-full justify-start"
                icon={ShieldAlert}
                label="失败"
                value={ingestion?.failed ?? (isLoading ? '…' : 0)}
                color="rose"
              />
              <StatCard
                dense
                variant="minimal"
                className="w-full justify-start"
                icon={ShieldAlert}
                label="隔离"
                value={ingestion?.quarantined ?? (isLoading ? '…' : 0)}
                color="amber"
              />
              <StatCard
                dense
                variant="minimal"
                className="w-full justify-start"
                icon={Activity}
                label="扫描 PDF"
                value={scannedPdfLabel}
                color="orange"
              />
              <StatCard
                dense
                variant="minimal"
                className="w-full justify-start"
                icon={ShieldAlert}
                label="PII"
                value={piiLabel}
                color="sky"
              />
              <StatCard
                dense
                variant="minimal"
                className="w-full justify-start"
                icon={ShieldAlert}
                label="密钥线索"
                value={secretsLabel}
                color="sky"
              />
            </StatsGrid>
          </section>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Panel className={healthPanelClass}>
              <div className="flex items-center justify-between mb-4">
                <div className="font-semibold">入库状态分布</div>
                <div className="text-xs text-muted-foreground font-mono">
                  {health?.generated_at ? `更新于 ${formatDate(health.generated_at)}` : ''}
                </div>
              </div>
              {statusChartData.length ? (
                <>
                  <SafeResponsiveChart className="h-[160px]" minHeight={160}>
                    <BarChart data={statusChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="value" fill="hsl(var(--chart-1))" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </SafeResponsiveChart>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {statusChartData.map((item) => (
                      <span key={item.name} className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1 text-xs">
                        <span className="size-2 rounded-full bg-info" />
                        <span className="font-medium">{item.name}</span>
                        <span className="font-mono text-muted-foreground">{item.value}</span>
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyState icon={Activity} title="暂无状态数据" description="后端未返回可用的状态分布。" className="min-h-[160px]" />
              )}
            </Panel>

            <Panel className={healthPanelClass}>
              <div className="flex items-center justify-between mb-4">
                <div className="font-semibold">格式分布</div>
                <div className="text-xs text-muted-foreground font-mono">
                  {profile?.generated_at ? `更新于 ${formatDate(profile.generated_at)}` : ''}
                </div>
              </div>
              {fileTypeChartData.length ? (
                <>
                  <SafeResponsiveChart className="h-[160px]" minHeight={160}>
                    <PieChart>
                      <Pie data={fileTypeChartData} dataKey="value" nameKey="name" outerRadius={70} label />
                      <Tooltip />
                    </PieChart>
                  </SafeResponsiveChart>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {fileTypeChartData.map((item) => (
                      <span key={item.name} className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1 text-xs">
                        <span className="size-2 rounded-full bg-info" />
                        <span className="font-medium">{item.name}</span>
                        <span className="font-mono text-muted-foreground">{item.value}</span>
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyState icon={BarChart3} title="暂无格式数据" description="后端未返回可用的格式统计。" className="min-h-[160px]" />
              )}
            </Panel>
          </div>

          <section className="space-y-3 py-1">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold">质量洞察</div>
                <div className="mt-1 text-xs leading-4 text-muted-foreground">
                  汇总规则建议和画像发现，用于快速判断是否需要补扫或人工复核。
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded-md border border-border bg-background p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-foreground">建议</div>
                  <Badge variant={suggestions.length ? 'soft' : 'outline'} className="h-6 px-2 text-xs">
                    {suggestions.length}
                  </Badge>
                </div>
                {suggestions.length ? (
                  <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
                    {suggestions.map((s) => (
                      <div key={`${s.severity}-${s.title}-${s.detail}`} className="grid gap-2 px-2.5 py-2 md:grid-cols-[auto_minmax(0,1fr)]">
                        <Badge variant={suggestionBadgeVariant(s.severity)} className="h-6 px-2 text-xs uppercase">
                          {suggestionSeverityLabel(s.severity)}
                        </Badge>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-foreground">{s.title}</div>
                          <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{s.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-success/20 bg-success/10 px-3 py-2 text-sm leading-5 text-success">
                    当前没有规则建议。可继续查看画像与预检详情，确认是否需要补扫。
                  </div>
                )}
              </div>

              <div className="rounded-md border border-border bg-background p-3">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-foreground">画像发现</div>
                    <div className="mt-1 text-xs text-muted-foreground">按影响度排序的可处理问题</div>
                  </div>
                  <Badge variant={topFindings.length ? 'soft' : 'outline'} className="h-6 px-2 text-xs">
                    {topFindings.length}
                  </Badge>
                </div>
                {topFindings.length ? (
                  <div className="space-y-1.5">
                    {topFindings.map((f) => (
                      <div
                        key={f.key}
                        className={cn(
                          'group relative overflow-hidden rounded-md border bg-card px-3 py-2 transition-colors hover:bg-muted/20',
                          f.severity === 'error'
                            ? 'border-destructive/30'
                            : f.severity === 'warning'
                              ? 'border-warning/30'
                              : 'border-border/60 dark:border-border/60',
                        )}
                        title={f.description || ''}
                      >
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <div className="truncate text-sm font-semibold text-foreground">{f.label}</div>
                              <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs leading-none text-muted-foreground">
                                ×{Number(f.count || 0)}
                              </span>
                            </div>
                            {f.description ? (
                              <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{f.description}</div>
                            ) : null}
                          </div>
                          <Badge variant={suggestionBadgeVariant(f.severity)} className="h-6 shrink-0 px-2 text-xs uppercase">
                            {suggestionSeverityLabel(f.severity)}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-sm leading-5 text-muted-foreground">
                    当前没有画像发现。
                  </div>
                )}
              </div>
            </div>
          </section>

          {datasetId ? null : (
            <Panel className={healthPanelClass}>
              <EmptyState icon={Activity} title="缺少 datasetId" description="无法识别当前路由参数 id。" />
            </Panel>
          )}
        </div>
      </DatasetDetailShell>
    </AppFrame>
  )
}
