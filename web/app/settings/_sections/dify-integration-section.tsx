'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Copy, Link2, RefreshCw, Trash2 } from 'lucide-react'

import { SettingsSwitch } from '@/components/settings/settings-switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { settingsTextTokens } from '@/components/ui/system-page-tokens'
import { datasetApi, type SystemSettings } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Dataset } from '@/types'

type DifyExternalKnowledgeSettings = NonNullable<SystemSettings['dify_external_knowledge']>

type DifyIntegrationSectionProps = {
  difyExternalKnowledge: DifyExternalKnowledgeSettings
  updateDifyExternalKnowledge: (patch: Partial<DifyExternalKnowledgeSettings>) => void
}

function parseKnowledgeMap(raw: string): Record<string, string[]> {
  if (!raw.trim()) return {}
  const parsed = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

  const map: Record<string, string[]> = {}
  for (const [knowledgeId, value] of Object.entries(parsed)) {
    if (typeof value === 'string') {
      map[knowledgeId] = [value]
      continue
    }
    if (Array.isArray(value)) {
      map[knowledgeId] = value
        .map((item) => (typeof item === 'string' ? item : ''))
        .filter(Boolean)
      continue
    }
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>
      const ids = obj.dataset_ids ?? obj.datasets ?? obj.dataset_id
      if (typeof ids === 'string') {
        map[knowledgeId] = [ids]
      } else if (Array.isArray(ids)) {
        map[knowledgeId] = ids
          .map((item) => (typeof item === 'string' ? item : ''))
          .filter(Boolean)
      }
    }
  }
  return map
}

function formatKnowledgeMap(map: Record<string, string[]>): string {
  const cleaned: Record<string, string[]> = {}
  for (const [knowledgeId, datasetIds] of Object.entries(map)) {
    const key = knowledgeId.trim()
    const ids = Array.from(new Set(datasetIds.map((id) => id.trim()).filter(Boolean)))
    if (key && ids.length > 0) cleaned[key] = ids
  }
  return Object.keys(cleaned).length ? JSON.stringify(cleaned) : ''
}

function shortId(value: string): string {
  return value.length > 10 ? `${value.slice(0, 8)}…` : value
}

function slugify(value: string): string {
  const chars = Array.from(value.toLowerCase())
  const normalized = chars.map((char) => /[a-z0-9\u4e00-\u9fa5]/u.test(char) ? char : '_').join('')
  return normalized.split('_').filter(Boolean).join('_').slice(0, 36) || 'dataset'
}

function buildKnowledgeId(datasets: Dataset[]): string {
  if (datasets.length === 1) return `kb_${slugify(datasets[0].name)}`
  if (datasets.length > 1) return `kb_${datasets.length}_datasets`
  return 'kb_default'
}

function datasetLabel(dataset: Dataset | undefined, datasetId: string): string {
  if (!dataset) return shortId(datasetId)
  return `${dataset.name} [${shortId(dataset.id)}]`
}

export function DifyIntegrationSection({
  difyExternalKnowledge,
  updateDifyExternalKnowledge,
}: Readonly<DifyIntegrationSectionProps>) {
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [selectedDatasetIds, setSelectedDatasetIds] = useState<string[]>([])
  const [knowledgeId, setKnowledgeId] = useState('kb_default')
  const [datasetsError, setDatasetsError] = useState('')
  const [datasetsLoading, setDatasetsLoading] = useState(false)
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState(false)
  const datasetsRequestRef = useRef(0)
  const datasetsLoadingRef = useRef(false)

  const endpointPath = difyExternalKnowledge.endpoint_path || '/api/v1/integrations/dify/retrieval'
  const endpointUrl = `${origin}${endpointPath}`

  let knowledgeMap: Record<string, string[]> = {}
  let knowledgeMapError = ''
  try {
    knowledgeMap = parseKnowledgeMap(difyExternalKnowledge.knowledge_map_json || '')
  } catch {
    knowledgeMapError = '当前绑定配置不是有效 JSON，可重新生成绑定覆盖'
  }

  const selectedDatasets = useMemo(
    () => datasets.filter((dataset) => selectedDatasetIds.includes(dataset.id)),
    [datasets, selectedDatasetIds]
  )

  useEffect(() => {
    setOrigin(globalThis.window.location.origin)
  }, [])

  const loadDatasets = useCallback(async () => {
    if (datasetsLoadingRef.current) return
    datasetsLoadingRef.current = true
    const requestId = datasetsRequestRef.current + 1
    datasetsRequestRef.current = requestId
    setDatasetsLoading(true)
    setDatasetsError('')

    try {
      const items = await datasetApi.listAll()
      if (requestId !== datasetsRequestRef.current) return
      setDatasets(items)
      setSelectedDatasetIds((prev) => prev.filter((id) => items.some((dataset) => dataset.id === id)))
    } catch {
      if (requestId === datasetsRequestRef.current) setDatasetsError('数据集加载失败，请重试')
    } finally {
      datasetsLoadingRef.current = false
      if (requestId === datasetsRequestRef.current) setDatasetsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDatasets()
    return () => {
      datasetsRequestRef.current += 1
    }
  }, [loadDatasets])

  useEffect(() => {
    if (selectedDatasets.length > 0) setKnowledgeId(buildKnowledgeId(selectedDatasets))
  }, [selectedDatasets])

  const toggleDataset = (datasetId: string) => {
    setSelectedDatasetIds((prev) =>
      prev.includes(datasetId) ? prev.filter((id) => id !== datasetId) : [...prev, datasetId]
    )
  }

  const writeBinding = () => {
    const ids = selectedDatasets.map((dataset) => dataset.id)
    if (ids.length === 0) return
    updateDifyExternalKnowledge({
      knowledge_map_json: formatKnowledgeMap({
        ...knowledgeMap,
        [knowledgeId.trim() || buildKnowledgeId(selectedDatasets)]: ids,
      }),
    })
  }

  const removeBinding = (bindingId: string) => {
    const next = { ...knowledgeMap }
    delete next[bindingId]
    updateDifyExternalKnowledge({ knowledge_map_json: formatKnowledgeMap(next) })
  }

  const copyEndpoint = async () => {
    if (!endpointUrl) return
    await navigator.clipboard?.writeText(endpointUrl)
    setCopied(true)
    globalThis.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground">Dify 外部知识库</h3>
          <p className={cn(settingsTextTokens.helpText, 'mt-1 max-w-3xl')}>
            见外传媒知识库完成检索，Dify 只需传入 knowledge_id。启用前请填写 API Key，并至少生成一条数据集绑定。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {difyExternalKnowledge.enabled ? '已启用' : '未启用'}
          </span>
          <SettingsSwitch
            checked={Boolean(difyExternalKnowledge.enabled)}
            onClick={() =>
              updateDifyExternalKnowledge({ enabled: !difyExternalKnowledge.enabled })
            }
            aria-label="切换 Dify 外部知识库接入"
          />
        </div>
      </div>

      <div className="grid gap-4 border-t border-border p-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          <div className={settingsTextTokens.fieldLabel}>检索接口地址</div>
          <div className="flex min-h-9 items-center gap-2 rounded-md border border-border bg-muted/20 px-2.5">
            <code className="min-w-0 flex-1 truncate text-xs text-foreground">
              {endpointUrl || endpointPath}
            </code>
            <Button
              type="button"
              variant="ghost"
              className="h-8 shrink-0 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={copyEndpoint}
            >
              {copied ? <CheckCircle2 className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? '已复制' : '复制'}
            </Button>
          </div>
        </div>

        <label className="space-y-1.5" htmlFor="dify-api-key">
          <span className={settingsTextTokens.fieldLabel}>API Key</span>
          <Input
            id="dify-api-key"
            type="password"
            value={difyExternalKnowledge.api_keys || ''}
            placeholder="填写 Dify API Key"
            className="h-9 rounded-md border-border bg-background text-sm"
            onChange={(event) => updateDifyExternalKnowledge({ api_keys: event.target.value })}
          />
        </label>
      </div>

      <div className="grid border-t border-border xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
        <div className="p-4 xl:border-r xl:border-border">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className={settingsTextTokens.panelTitle}>数据集绑定</div>
              <div className={cn(settingsTextTokens.helpText, 'mt-1')}>
                选择数据集后生成供 Dify 请求使用的 knowledge_id。
              </div>
            </div>
            <span className="text-xs text-muted-foreground">
              已选择 {selectedDatasetIds.length} 个
            </span>
          </div>

          <div className="mt-3 max-h-64 overflow-y-auto rounded-md border border-border">
            {datasetsLoading ? (
              <div className="flex min-h-10 items-center gap-2 px-3 text-xs text-muted-foreground">
                <RefreshCw className="size-3.5 animate-spin" />
                正在加载数据集
              </div>
            ) : null}
            {datasetsError ? (
              <div className="flex flex-wrap items-center justify-between gap-2 bg-warning/10 px-3 py-2 text-xs text-warning">
                <span>{datasetsError}</span>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 rounded-md border-warning/30 bg-background px-2.5 text-xs text-foreground hover:bg-warning/10"
                  disabled={datasetsLoading}
                  onClick={() => void loadDatasets()}
                >
                  <RefreshCw className={cn('size-3.5', datasetsLoading && 'animate-spin')} />
                  重新加载
                </Button>
              </div>
            ) : null}
            {!datasetsLoading && datasets.length === 0 && !datasetsError ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                当前没有可绑定的数据集
              </div>
            ) : null}
            {datasets.map((dataset) => {
              const checked = selectedDatasetIds.includes(dataset.id)
              return (
                <button
                  key={dataset.id}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => toggleDataset(dataset.id)}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-3 border-t border-border px-3 py-2 text-left transition-colors first:border-t-0',
                    checked
                      ? 'bg-primary/10 text-primary'
                      : 'bg-background text-foreground hover:bg-muted/60'
                  )}
                >
                  <span
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-md border',
                      checked
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-transparent'
                    )}
                    aria-hidden="true"
                  >
                    <CheckCircle2 className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{dataset.name}</span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">
                      {shortId(dataset.id)}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="mt-4 border-t border-border pt-4">
            <label className={settingsTextTokens.fieldLabel} htmlFor="dify-knowledge-id">
              knowledge_id
            </label>
            <div className="mt-1.5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Input
                id="dify-knowledge-id"
                value={knowledgeId}
                className="h-9 rounded-md border-border bg-background text-sm"
                placeholder="例如 kb_product_docs"
                onChange={(event) => setKnowledgeId(event.target.value)}
              />
              <Button
                type="button"
                className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                disabled={selectedDatasetIds.length === 0}
                onClick={writeBinding}
              >
                <Link2 className="size-4" />
                生成绑定
              </Button>
            </div>
          </div>
        </div>

        <div className="border-t border-border p-4 xl:border-t-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className={settingsTextTokens.panelTitle}>当前绑定</div>
              <div className={cn(settingsTextTokens.helpText, 'mt-1')}>
                每个 knowledge_id 可以关联一个或多个数据集。
              </div>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {Object.keys(knowledgeMap).length} 条
            </span>
          </div>

          {knowledgeMapError ? (
            <div className="mt-3 rounded-md border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning">
              {knowledgeMapError}
            </div>
          ) : null}

          <div className="mt-3 border-y border-border">
            {Object.entries(knowledgeMap).length === 0 ? (
              <div className="px-3 py-5 text-center text-xs text-muted-foreground">
                还没有绑定。先选择数据集，再生成 knowledge_id。
              </div>
            ) : null}
            {Object.entries(knowledgeMap).map(([bindingId, datasetIds]) => (
              <div
                key={bindingId}
                className="flex items-start justify-between gap-3 border-t border-border py-3 first:border-t-0"
              >
                <div className="min-w-0">
                  <div className="break-all font-mono text-xs font-semibold text-foreground">
                    {bindingId}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                    {datasetIds
                      .map((datasetId) =>
                        datasetLabel(datasets.find((dataset) => dataset.id === datasetId), datasetId)
                      )
                      .join('、')}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 shrink-0 rounded-md px-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => removeBinding(bindingId)}
                  aria-label={`删除 ${bindingId} 绑定`}
                >
                  <Trash2 className="size-3.5" />
                  删除
                </Button>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <label className="space-y-1.5" htmlFor="dify-account-id">
              <span className={settingsTextTokens.fieldLabel}>服务账号</span>
              <Input
                id="dify-account-id"
                value={difyExternalKnowledge.account_id || 'system:dify'}
                className="h-9 rounded-md border-border bg-background text-sm"
                onChange={(event) => updateDifyExternalKnowledge({ account_id: event.target.value })}
              />
            </label>
            <label className="space-y-1.5" htmlFor="dify-top-k-max">
              <span className={settingsTextTokens.fieldLabel}>最大返回条数</span>
              <Input
                id="dify-top-k-max"
                type="number"
                min={1}
                max={200}
                value={difyExternalKnowledge.top_k_max}
                className="h-9 rounded-md border-border bg-background text-sm"
                onChange={(event) =>
                  updateDifyExternalKnowledge({
                    top_k_max: Math.max(1, Math.min(200, Number.parseInt(event.target.value || '50', 10))),
                  })
                }
              />
            </label>
          </div>
        </div>
      </div>
    </section>
  )
}
