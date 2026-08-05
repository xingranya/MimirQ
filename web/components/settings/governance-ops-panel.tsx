'use client'

import { useState, type ReactNode } from 'react'
import { AlertCircle, Database, FileClock, Loader2, Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatasetSelectField } from '@/components/ops/dataset-select-field'
import { OperationResultPanel } from '@/components/ops/operation-result-panel'
import { DangerZonePanel } from '@/components/settings/danger-zone-panel'
import { settingsTextTokens } from '@/components/ui/system-page-tokens'
import { chunkPresetApi, governanceApi } from '@/lib/api'
import { formatApiError } from '@/lib/api-errors'
import { cn, detachPromise } from '@/lib/utils'

export function GovernanceOpsPanel({
  canManage,
  accessLoading,
}: Readonly<{
  canManage: boolean
  accessLoading: boolean
}>) {
  const [datasetId, setDatasetId] = useState('')
  const [presetId, setPresetId] = useState('')
  const [mode, setMode] = useState<'overdue' | 'due_soon' | 'all'>('overdue')
  const [dueWithinDays, setDueWithinDays] = useState(14)
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<{ title: string; payload: unknown } | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function runAction(key: string, title: string, action: () => Promise<unknown>) {
    setBusy(key)
    setErrorMessage(null)
    try {
      const payload = await action()
      setResult({ title, payload })
      toast.success(`${title}完成`)
    } catch (error) {
      const message = formatApiError(error, `${title}失败`)
      setResult(null)
      setErrorMessage(message)
      toast.error(message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="space-y-3 border-t border-border pt-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className={cn(settingsTextTokens.sectionTitle, 'flex items-center gap-1.5')}>
            <Database className="h-3.5 w-3.5 text-primary" />
            数据集复核运维
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            按数据集查询需要复核的文档。切块预设维护不受当前数据集筛选影响。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {accessLoading
              ? '正在确认操作权限'
              : canManage
                ? datasetId
                  ? '已选择数据集'
                  : '请选择数据集'
                : '仅可查看'}
          </span>
          {busy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground motion-reduce:animate-none" /> : null}
        </div>
      </div>

      {!accessLoading && !canManage ? (
        <p className="text-xs leading-5 text-muted-foreground">
          当前账号没有数据集维护权限，无法查询待复核文档或删除切块预设。
        </p>
      ) : null}

      {canManage ? (
        <fieldset disabled={accessLoading} className="contents">
          <div className="grid gap-2 md:grid-cols-4">
        <DatasetSelectField
          value={datasetId}
          onChange={setDatasetId}
          label="绑定数据集"
          placeholder="选择要巡检的数据集"
          autoSelectFirst
          className="md:col-span-2"
        />
        <Field label="复核范围" htmlFor="governance-review-scope">
          <Select value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
            <SelectTrigger id="governance-review-scope" className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="overdue">已过期</SelectItem>
              <SelectItem value="due_soon">即将到期</SelectItem>
              <SelectItem value="all">全部</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="到期窗口（天）" htmlFor="governance-due-window">
          <Input
            id="governance-due-window"
            type="number"
            min={0}
            max={365}
            value={String(dueWithinDays)}
            onChange={(event) => {
              const value = Number.parseInt(event.target.value || '0', 10)
              setDueWithinDays(Number.isFinite(value) ? Math.min(365, Math.max(0, value)) : 14)
            }}
            className="h-8 text-xs"
            inputMode="numeric"
          />
        </Field>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
        <ActionButton icon={FileClock} busy={busy === 'stale'} disabled={Boolean(busy) || !datasetId.trim()} label="查询待复核文档" onClick={() => runAction('stale', '待复核文档', () => governanceApi.listStaleDocumentsByDataset(datasetId.trim(), { mode, due_within_days: dueWithinDays, limit: 50 }))} />
        <div className="text-xs leading-5 text-muted-foreground">
          每次最多返回 50 条结果。
        </div>
          </div>

          {errorMessage ? (
            <div role="alert" className="flex items-start gap-2 border-t border-destructive/20 pt-3 text-xs leading-5 text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{errorMessage}。请检查当前选择和账号权限后重试。</span>
            </div>
          ) : null}

          <DangerZonePanel
        className="mt-3"
        title="切块预设删除"
        impact="不按上方数据集筛选；删除前请确认没有数据集或入库策略继续引用该预设"
        badge="高级维护"
        compact
        tone="neutral"
        icon="help"
      >
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <Field label="切块预设标识" htmlFor="governance-preset-id">
            <Input
              id="governance-preset-id"
              value={presetId}
              onChange={(event) => setPresetId(event.target.value)}
              className="h-8 font-mono text-xs"
            />
          </Field>
          <ConfirmDialog
            title="删除切块预设？"
            description={`将删除切块预设“${presetId.trim() || '-'}”。如果数据集仍引用该预设，后续策略需要重新配置。`}
            confirmLabel="确认删除"
            onConfirm={() => runAction('delete-preset', '删除切块预设', async () => {
              await chunkPresetApi.delete(presetId.trim())
              return { preset_id: presetId.trim(), deleted: true }
            })}
          >
            <Button variant="outline" className="h-8 gap-1.5 rounded-md px-3 text-xs font-semibold" disabled={Boolean(busy) || !presetId.trim()}>
              {busy === 'delete-preset' ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : <Trash2 className="h-3.5 w-3.5" />}
              删除切块预设
            </Button>
          </ConfirmDialog>
        </div>
          </DangerZonePanel>
        </fieldset>
      ) : null}

      {canManage ? (
        <OperationResultPanel
          title="治理运维结果"
          result={result}
          emptyMessage="选择数据集后查询待复核文档，处理详情默认收起。"
        />
      ) : null}
    </section>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: Readonly<{ label: string; htmlFor: string; children: ReactNode }>) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor} className={settingsTextTokens.fieldLabel}>
        {label}
      </Label>
      {children}
    </div>
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
    <Button className="h-8 gap-1.5 rounded-md px-3 text-xs font-semibold" disabled={disabled} onClick={() => detachPromise(onClick())}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : <Icon className="h-3.5 w-3.5" />}
      {label}
    </Button>
  )
}
