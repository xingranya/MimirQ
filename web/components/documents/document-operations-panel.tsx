'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { FileJson, FileText, FolderInput, Loader2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Panel } from '@/components/ui/panel'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { documentApi } from '@/lib/api'
import { formatApiError } from '@/lib/api-errors'
import {
  createDocumentBatchOutcome,
  formatDocumentBatchOutcome,
} from '@/lib/document-batch-outcome'
import { cn, detachPromise } from '@/lib/utils'
import type { Dataset } from '@/types'

const NO_TARGET_DATASET = '__none__'

type OperationResult = {
  title: string
  payload: unknown
  status: 'success' | 'warning'
  summary?: string
}

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function formatResultSummary(value: unknown) {
  if (value == null) return '操作已完成。'
  if (value instanceof Blob) return `已返回文件，大小 ${value.size} bytes。`
  if (Array.isArray(value)) return `已返回 ${value.length} 条记录。`
  if (typeof value === 'string') return value || '操作已完成。'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value !== 'object') return '操作已完成。'

  const record = value as Record<string, unknown>
  if (typeof record.message === 'string' && record.message.trim()) return record.message.trim()

  const itemCount = Array.isArray(record.items) ? record.items.length : null
  const documentCount = Array.isArray(record.documents) ? record.documents.length : null
  const duplicateCount = Array.isArray(record.groups) ? record.groups.length : null
  const count = getDocumentOperationCount(record)

  if (itemCount != null) return `已返回 ${itemCount} 条记录。`
  if (documentCount != null) return `已返回 ${documentCount} 个文档。`
  if (duplicateCount != null) return `发现 ${duplicateCount} 组结果。`
  if (count != null) return `本次返回 ${count} 条结果。`

  return `操作已完成，返回 ${Object.keys(record).length} 个字段。`
}

function getDocumentOperationCount(record: Record<string, unknown>): number | null {
  if (typeof record.count === 'number') return record.count
  if (typeof record.total === 'number') return record.total
  return null
}

export function DocumentOperationsPanel({
  selectedDocumentIds,
  datasetId,
  datasets = [],
  onSelectedDocumentIdsChange,
  onDocumentsChanged,
}: Readonly<{
  selectedDocumentIds: string[]
  datasetId?: string | null
  datasets?: Dataset[]
  onSelectedDocumentIdsChange?: (documentIds: string[]) => void
  onDocumentsChanged?: () => void | Promise<void>
}>) {
  const [targetDatasetId, setTargetDatasetId] = useState('')
  const [resultDetailsOpen, setResultDetailsOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<OperationResult | null>(null)

  const ids = selectedDocumentIds
  const firstDocumentId = ids[0] || ''
  const effectiveDatasetId = String(datasetId || '').trim()
  const currentDatasetLabel = useMemo(() => {
    const dataset = datasets.find((item) => item.id === effectiveDatasetId)
    if (dataset?.name) return dataset.name
    return effectiveDatasetId || '全部知识库'
  }, [datasets, effectiveDatasetId])
  const targetDatasetOptions = useMemo(
    () => datasets.filter((dataset) => dataset.id && dataset.id !== effectiveDatasetId),
    [datasets, effectiveDatasetId]
  )
  const targetDatasetValue = targetDatasetId.trim() || NO_TARGET_DATASET
  const selectedScopeLabel = ids.length ? `${ids.length} 个文档` : '未勾选文档'
  const resultSummary = result
    ? result.summary || formatResultSummary(result.payload)
    : null

  async function runAction(key: string, title: string, action: () => Promise<unknown>) {
    setBusy(key)
    try {
      const payload = await action()
      setResult({ title, payload, status: 'success' })
      setResultDetailsOpen(false)
      toast.success(`${title}完成`)
    } catch (error) {
      toast.error(formatApiError(error, `${title}失败`))
    } finally {
      setBusy(null)
    }
  }

  async function runBatchMove() {
    const targetId = targetDatasetId.trim()
    if (!ids.length || !targetId) return

    setBusy('move')
    try {
      const payload = await documentApi.batchMove({
        document_ids: ids,
        target_dataset_id: targetId,
      })
      const outcome = createDocumentBatchOutcome(ids, payload, 'moved')
      const summary = formatDocumentBatchOutcome(outcome, {
        successVerb: '已移动',
        completeFailure: '未能移动所选文档',
      })

      setResultDetailsOpen(false)
      if (outcome.status === 'error') {
        setResult(null)
        toast.error(summary)
        return
      }

      setResult({ title: '批量移动', payload, status: outcome.status, summary })
      onSelectedDocumentIdsChange?.(outcome.remainingIds)
      if (outcome.status === 'warning') toast.warning(summary)
      else toast.success(summary)
      if (outcome.succeeded > 0) await onDocumentsChanged?.()
    } catch (error) {
      toast.error(formatApiError(error, '批量移动失败'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Panel
      padding="none"
      className="overflow-hidden border-border bg-background shadow-none"
    >
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <FileJson className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold leading-5 text-foreground">
                文档运维工具
              </h2>
              <span className="rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                当前选择
              </span>
            </div>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              查看文档状态和解析结果，或把勾选的文档移动到其他知识库。
            </p>
          </div>
        </div>
        <div className="flex h-9 shrink-0 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs text-muted-foreground">
          {busy ? (
            <Loader2 className="size-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <span className="size-2 rounded-full bg-success" aria-hidden="true" />
          )}
          <span>{busy ? '执行中' : '待操作'}</span>
        </div>
      </div>

      <div className="grid gap-5 border-b border-border px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.55fr)]">
        <section aria-labelledby="document-operation-scope">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 id="document-operation-scope" className="text-sm font-medium text-foreground">
              当前范围
            </h3>
            <span className="text-xs text-muted-foreground">自动使用当前选择</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <ContextItem label="知识库" value={currentDatasetLabel} subValue={effectiveDatasetId || '全局范围'} />
            <ContextItem label="文档范围" value={selectedScopeLabel} subValue={firstDocumentId ? `默认文档 ${firstDocumentId.slice(0, 8)}` : '先在列表勾选文档'} />
            <ContextItem label="批量来源" value="当前勾选" subValue="无需填写文档编号" />
          </div>
        </section>

        <section aria-labelledby="document-operation-target">
          <h3 id="document-operation-target" className="mb-3 text-sm font-medium text-foreground">
            移动目标
          </h3>
          <Field label="移动到知识库">
            <Select
              value={targetDatasetValue}
              onValueChange={(value) => setTargetDatasetId(value === NO_TARGET_DATASET ? '' : value)}
            >
              <SelectTrigger className="h-10 rounded-md border-border bg-background text-sm shadow-none">
                <SelectValue placeholder="选择目标知识库" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TARGET_DATASET}>不移动</SelectItem>
                {targetDatasetId && !targetDatasetOptions.some((dataset) => dataset.id === targetDatasetId) ? (
                  <SelectItem value={targetDatasetId}>自定义目标：{targetDatasetId.slice(0, 8)}</SelectItem>
                ) : null}
                {targetDatasetOptions.map((dataset) => (
                  <SelectItem key={dataset.id} value={dataset.id}>
                    {dataset.name || dataset.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              只有批量移动需要选择目标知识库，其他操作使用当前范围。
            </p>
          </Field>
        </section>
      </div>

      <section className="px-4 py-4" aria-labelledby="document-operation-actions">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 id="document-operation-actions" className="text-sm font-medium text-foreground">
              可用操作
            </h3>
            <span className="text-xs text-muted-foreground">参数会从当前范围自动带入</span>
          </div>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,0.5fr)]">
            <ActionGroup icon={FileText} title="读取 / 诊断" description="只读操作，不改变文档。">
              <ActionButton icon={FileJson} busy={busy === 'stats'} disabled={Boolean(busy)} label="文档统计" onClick={() => runAction('stats', '文档统计', () => documentApi.stats({ dataset_id: effectiveDatasetId || undefined }))} />
              <ActionButton icon={FileJson} busy={busy === 'parsed'} disabled={Boolean(busy) || !firstDocumentId} label="查看解析内容" onClick={() => runAction('parsed', '解析内容', () => documentApi.getParsedContent(firstDocumentId, { max_chars: 20_000 }))} />
              <ActionButton icon={FileJson} busy={busy === 'duplicates'} disabled={Boolean(busy) || !effectiveDatasetId} label="重复文档" onClick={() => runAction('duplicates', '重复文档', () => documentApi.listDuplicates({ dataset_id: effectiveDatasetId, min_count: 2, max_groups: 20, max_docs_per_group: 10 }))} />
              <ActionButton icon={FileJson} busy={busy === 'lifecycle'} disabled={Boolean(busy) || !firstDocumentId} label="生命周期元数据" onClick={() => runAction('lifecycle', '生命周期元数据', () => documentApi.getLifecycleMetadata(firstDocumentId))} />
            </ActionGroup>
            <ActionGroup icon={FolderInput} title="批量变更" description="仅使用当前勾选文档。">
              <ActionButton icon={FolderInput} busy={busy === 'move'} disabled={Boolean(busy) || ids.length === 0 || !targetDatasetId.trim()} label="批量移动" onClick={runBatchMove} />
            </ActionGroup>
          </div>
      </section>

      {result ? (
        <div
          role="status"
          className={cn(
            'mx-4 mb-4 overflow-hidden rounded-md border bg-background',
            result.status === 'warning' ? 'border-warning/40' : 'border-success/35'
          )}
        >
          <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <span
                className={cn(
                  'mt-1.5 size-2 shrink-0 rounded-full',
                  result.status === 'warning' ? 'bg-warning' : 'bg-success'
                )}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {result.title}{result.status === 'warning' ? '部分完成' : '已完成'}
                  </p>
                  <span
                    className={cn(
                      'rounded-md border px-2 py-1 text-xs font-medium',
                      result.status === 'warning'
                        ? 'border-warning/35 bg-warning/10 text-warning-foreground'
                        : 'border-success/30 bg-success/10 text-success'
                    )}
                  >
                    {result.status === 'warning' ? '部分完成' : '完成'}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">{resultSummary}</p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0 rounded-md px-3 text-xs"
              aria-expanded={resultDetailsOpen}
              onClick={() => setResultDetailsOpen((open) => !open)}
            >
              原始响应
            </Button>
          </div>
          {resultDetailsOpen ? (
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words border-t border-border bg-muted/30 p-3 text-xs leading-5 text-foreground">
              {prettyJson(result.payload)}
            </pre>
          ) : null}
        </div>
      ) : null}
    </Panel>
  )
}

function Field({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium leading-5 text-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

function ContextItem({
  label,
  value,
  subValue,
}: Readonly<{
  label: string
  value: string
  subValue: string
}>) {
  return (
    <div className="min-w-0 border-l border-border pl-3">
      <p className="text-xs font-medium leading-5 text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium leading-5 text-foreground" title={value}>
        {value}
      </p>
      <p className="truncate text-xs leading-5 text-muted-foreground" title={subValue}>
        {subValue}
      </p>
    </div>
  )
}

function ActionGroup({
  children,
  description,
  icon: Icon,
  title,
}: Readonly<{
  children: ReactNode
  description: string
  icon: LucideIcon
  title: string
}>) {
  return (
    <section>
      <div className="mb-3 flex items-start gap-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-medium leading-5 text-foreground">{title}</h4>
          <p className="text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {children}
      </div>
    </section>
  )
}

function ActionButton({
  busy,
  disabled,
  icon: Icon,
  label,
  onClick,
}: Readonly<{
  busy: boolean
  disabled: boolean
  icon: LucideIcon
  label: string
  onClick: () => Promise<void>
}>) {
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-9 justify-start gap-2 rounded-md px-3 text-xs font-medium"
      disabled={disabled}
      onClick={() => detachPromise(onClick())}
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
      ) : (
        <Icon className="size-4" aria-hidden="true" />
      )}
      {label}
    </Button>
  )
}
