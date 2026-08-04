'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown, Download, Loader2, PackageCheck, ShieldCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'

import { DatasetSelectField } from '@/components/ops/dataset-select-field'
import { OperationResultPanel } from '@/components/ops/operation-result-panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { evidenceApi } from '@/lib/api'
import { formatApiError } from '@/lib/api-errors'
import { detachPromise } from '@/lib/utils'

function parseJson(raw: string) {
  const value = raw.trim()
  return value ? JSON.parse(value) : {}
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  globalThis.window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function EvidenceOpsPanel() {
  const [datasetId, setDatasetId] = useState('')
  const [suiteId, setSuiteId] = useState('')
  const [itemId, setItemId] = useState('')
  const [capsuleId, setCapsuleId] = useState('')
  const [payloadJson, setPayloadJson] = useState('{\n  "capsule": {\n    "schema": "mimirq.evidence_capsule.v1",\n    "claims": []\n  }\n}')
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<{ title: string; payload: unknown } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const dataset = datasetId.trim()
  const suite = suiteId.trim()
  const item = itemId.trim()
  const capsule = capsuleId.trim()

  async function runAction(key: string, title: string, action: () => Promise<unknown>) {
    setBusy(key)
    setError(null)
    setResult(null)
    try {
      const payload = await action()
      setResult({ title, payload })
      toast.success(`${title}已完成`)
    } catch (actionError) {
      const message = formatApiError(actionError, `${title}失败，请重试。`)
      setError(message)
      toast.error(message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <details className="group mt-4 overflow-hidden rounded-md border border-border bg-card">
      <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-primary">
          <ShieldCheck className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">高级维护</h2>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            检查证据漂移、导出训练数据，或维护证据集和证据包。
          </p>
        </div>
        {busy ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="正在执行" />
        ) : null}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
      </summary>

      <div className="space-y-4 border-t border-border bg-muted/15 p-4">
        <section aria-labelledby="dataset-maintenance-title">
          <h3 id="dataset-maintenance-title" className="text-sm font-semibold text-foreground">知识库维护</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            选择一个知识库后检查证据变化，或导出用于评测和训练的数据。
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
            <DatasetSelectField value={datasetId} onChange={setDatasetId} label="知识库" placeholder="选择知识库" />
            <ActionButton
              icon={ShieldCheck}
              busy={busy === 'dataset-drift'}
              disabled={Boolean(busy) || !dataset}
              label="检查证据变化"
              onClick={() => runAction(
                'dataset-drift',
                '证据变化检查',
                () => evidenceApi.getDatasetDriftAudit(dataset, {
                  include_details: true,
                  details_limit: 20,
                })
              )}
            />
            <Button
              variant="outline"
              className="h-9"
              disabled={Boolean(busy) || !dataset}
              onClick={() => detachPromise(runAction('training-export', '训练数据导出', async () => {
                const blob = await evidenceApi.exportTrainingDataset({
                  dataset_id: dataset,
                  format: 'jsonl',
                  include_feedback: true,
                  include_evidence: true,
                })
                downloadBlob(blob, `evidence-training.${dataset.slice(0, 8)}.jsonl`)
                return { bytes: blob.size, type: blob.type }
              }))}
            >
              <Download className="size-4" aria-hidden="true" />
              导出训练数据
            </Button>
          </div>
        </section>

        <section className="border-t border-border pt-4" aria-labelledby="evidence-maintenance-title">
          <h3 id="evidence-maintenance-title" className="text-sm font-semibold text-foreground">证据数据维护</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            仅在修复引用来源或维护证据数据时填写。编号和请求数据可从运维记录中取得。
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <Field label="证据集编号">
              <Input value={suiteId} onChange={(event) => setSuiteId(event.target.value)} className="h-9 font-mono text-sm" />
            </Field>
            <Field label="证据项编号">
              <Input value={itemId} onChange={(event) => setItemId(event.target.value)} className="h-9 font-mono text-sm" />
            </Field>
            <Field label="证据包编号">
              <Input value={capsuleId} onChange={(event) => setCapsuleId(event.target.value)} className="h-9 font-mono text-sm" />
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton icon={ShieldCheck} busy={busy === 'repair'} disabled={Boolean(busy) || !suite} label="修复引用来源" onClick={() => runAction('repair', '引用来源修复', () => evidenceApi.repairSuiteReferenceSources(suite, parseJson(payloadJson)))} />
            <ActionButton icon={ShieldCheck} busy={busy === 'patch-suite'} disabled={Boolean(busy) || !suite} label="更新证据集" onClick={() => runAction('patch-suite', '证据集更新', () => evidenceApi.patchSuite(suite, parseJson(payloadJson)))} />
            <ActionButton icon={ShieldCheck} busy={busy === 'patch-item'} disabled={Boolean(busy) || !item} label="更新证据项" onClick={() => runAction('patch-item', '证据项更新', () => evidenceApi.patchItem(item, parseJson(payloadJson)))} />
            <ActionButton icon={PackageCheck} busy={busy === 'persist'} disabled={Boolean(busy)} label="保存证据包" onClick={() => runAction('persist', '证据包保存', () => evidenceApi.persistCapsule(parseJson(payloadJson)))} />
            <ActionButton icon={PackageCheck} busy={busy === 'get-capsule'} disabled={Boolean(busy) || !capsule} label="读取证据包" onClick={() => runAction('get-capsule', '证据包读取', () => evidenceApi.getCapsule(capsule))} />
            <ActionButton icon={PackageCheck} busy={busy === 'verify'} disabled={Boolean(busy)} label="校验证据包" onClick={() => runAction('verify', '证据包校验', () => evidenceApi.verifyCapsule(parseJson(payloadJson)))} />
          </div>
          <Field label="请求数据（JSON）" className="mt-3">
            <Textarea value={payloadJson} onChange={(event) => setPayloadJson(event.target.value)} className="min-h-36 font-mono text-sm" />
          </Field>
        </section>

        {error ? (
          <div role="alert" className="rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm leading-6 text-destructive">
            {error}
          </div>
        ) : null}

        <OperationResultPanel
          title="执行结果"
          result={result}
          emptyMessage="选择一项操作后，这里会显示执行结果。原始响应默认收起。"
        />
      </div>
    </details>
  )
}

function Field({
  children,
  className,
  label,
}: Readonly<{
  children: ReactNode
  className?: string
  label: string
}>) {
  return (
    <div className={className}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
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
    <Button
      variant="outline"
      className="h-9"
      disabled={disabled}
      onClick={() => detachPromise(onClick())}
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      ) : (
        <Icon className="size-4" aria-hidden="true" />
      )}
      {label}
    </Button>
  )
}
