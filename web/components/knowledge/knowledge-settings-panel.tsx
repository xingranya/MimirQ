'use client'

/**
 * 知识库参数和连接器任务面板。
 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Database,
  History,
  Info,
  Link2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Settings,
  Terminal,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Panel } from '@/components/ui/panel'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Switch } from '@/components/ui/switch'

import {
  datasetApi,
  settingsApi,
  type SystemSettings,
} from '@/lib/api'
import { formatApiError } from '@/lib/api-errors'
import { toTrimmedPrimitiveString } from '@/lib/primitive-text'
import { queryKeys } from '@/lib/query-keys'
import { cn, detachPromise, formatDate } from '@/lib/utils'
import type { ConnectorRunOut, Dataset } from '@/types'

// --- 类型定义 ---
type KnowledgeSettingsConfig = Pick<SystemSettings, 'embedding' | 'rag'>
type ConnectorRunStatusFilter =
  | 'all'
  | 'pending'
  | 'running'
  | 'failed'
  | 'completed'
  | 'cancelled'

type KnowledgeSettingsPanelProps = {
  selectedDatasetId?: string
  selectedDataset?: Dataset | null
  datasets?: Dataset[]
  datasetsLoading?: boolean
  datasetAllValue?: string
  onDatasetScopeChange?: (value: string) => void
  onGoToRetrievalTest?: () => void
  settingsSidebarCollapsed?: boolean
}

type KnowledgeConnectorRunsPanelProps = {
  selectedDatasetId?: string
  connectorRuns: ConnectorRunOut[]
  connectorRunsLoading: boolean
  onCancelConnectorRun: (id: string) => void | Promise<void>
  onResumeConnectorRun: (id: string) => void | Promise<void>
  onRetryFailedConnectorRun: (id: string) => void | Promise<void>
  onLoadConnectorRuns: (params: { datasetId?: string }) => void | Promise<void>
}

type TaskCardProps = {
  run: ConnectorRunOut
  onCancel: (id: string) => void | Promise<void>
  onResume?: (id: string) => void | Promise<void>
  onRetry: (id: string) => void | Promise<void>
  isExpanded: boolean
  onToggleExpand: () => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function getConnectorRunProgress(rawStats: unknown) {
  const stats = isRecord(rawStats) ? rawStats : {}
  const total = Number(
    stats?.total_items || stats?.items_total || stats?.total_urls || 0
  )
  const processed = Number(
    stats?.processed_items ||
      stats?.items_processed ||
      stats?.processed_urls ||
      0
  )
  return { total, processed }
}

function getConnectorRunErrors(stats: unknown): Record<string, unknown>[] {
  const record = isRecord(stats) ? stats : {}
  return Array.isArray(record.errors) ? record.errors.filter(isRecord) : []
}

const EMBEDDING_PRESETS = [
  {
    model: 'text-embedding-v4',
    provider: 'dashscope',
    apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    brand: 'Qwen 向量模型',
  },
  {
    model: 'text-embedding-v3',
    provider: 'dashscope',
    apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    brand: 'Qwen 向量模型',
  },
  {
    model: 'text-embedding-3-small',
    provider: 'openai_compatible',
    apiBase: 'https://api.openai.com/v1',
    brand: 'OpenAI 向量模型',
  },
  {
    model: 'bge-large-zh',
    provider: 'local',
    apiBase: '',
    brand: '本地向量模型',
  },
] as const
type EmbeddingPresetModel = (typeof EMBEDDING_PRESETS)[number]['model']
const SETTINGS_GUIDE_PANEL_ID = 'knowledge-settings-guide'
const SETTINGS_PANEL_CLASS = 'overflow-hidden bg-background'
const SETTINGS_SIDE_PANEL_CLASS = 'overflow-hidden bg-background'
const SETTINGS_PANEL_HEADER_CLASS = 'border-b border-border px-4 py-3'
const SETTINGS_SIDE_HEADER_CLASS = 'border-b border-border px-3 py-3'
const SETTINGS_PANEL_ICON_CLASS =
  'flex size-8 items-center justify-center rounded-md bg-muted text-primary'
const SETTINGS_SIDE_ICON_CLASS =
  'mt-0.5 flex size-8 items-center justify-center rounded-md bg-muted text-primary'
const SETTINGS_CONTROL_CLASS = 'border-input bg-background shadow-none hover:border-primary/40'
const SETTINGS_INSET_CLASS = 'border border-border bg-muted/20'
const EMBEDDING_MODEL_META: Record<
  EmbeddingPresetModel,
  { description: string }
> = {
  'text-embedding-v4': {
    description: '阿里云百炼当前推荐文本向量模型，适合作为中文 RAG 的默认选择。',
  },
  'text-embedding-v3': {
    description: '适合兼容已有百炼 v3 索引或低成本平滑迁移场景。',
  },
  'text-embedding-3-small': {
    description: '响应更轻量，适合成本敏感或高频检索场景。',
  },
  'bge-large-zh': {
    description: '中文语义更强，适合中文知识库和条款型文本。',
  },
}

function cloneSettingsConfig(
  config: KnowledgeSettingsConfig
): KnowledgeSettingsConfig {
  return structuredClone(config)
}

function buildScopedSettingsConfig(
  settings: SystemSettings,
  selectedDataset?: Dataset | null
): KnowledgeSettingsConfig {
  const datasetEmbedding = selectedDataset?.embedding_defaults
  return {
    embedding: {
      ...settings.embedding,
      provider: datasetEmbedding?.provider || settings.embedding.provider,
      model: datasetEmbedding?.model || settings.embedding.model,
      api_base: datasetEmbedding?.api_base ?? settings.embedding.api_base,
    },
    rag: settings.rag,
  }
}

function buildDatasetEmbeddingDefaults(config: KnowledgeSettingsConfig) {
  return {
    provider: config.embedding.provider,
    model: config.embedding.model,
    api_base: config.embedding.api_base || null,
  }
}

// --- KnowledgeSettingsPanel 实现 ---
export function KnowledgeSettingsPanel({
  selectedDatasetId,
  selectedDataset,
  datasets = [],
  datasetsLoading = false,
  datasetAllValue = '__all__',
  onDatasetScopeChange,
  onGoToRetrievalTest,
  settingsSidebarCollapsed = false,
}: Readonly<KnowledgeSettingsPanelProps>) {
  const t = useTranslations('KnowledgeSettingsPanel')
  const queryClient = useQueryClient()
  // t("connectorRuns.empty.description")
  // t("connectorRuns.zeroState.description")
  // t("dangerZone.trigger")
  // datasetApi.purge
  // dry_run
  // aria-label={t("connectorRuns.filter.ariaLabel")}
  // label: t(`runStatus.${value}`)
  // setRunStatusFilter('all')
  // bg-primary/10 px-2.5 py-0.5 rounded-lg border border-primary/20
  // border-border/40 bg-background/70
  const [draftConfig, setDraftConfig] =
    useState<KnowledgeSettingsConfig | null>(null)
  const [savedConfig, setSavedConfig] =
    useState<KnowledgeSettingsConfig | null>(null)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [confirmEmbeddingSaveOpen, setConfirmEmbeddingSaveOpen] =
    useState(false)
  const [guideExpanded, setGuideExpanded] = useState(false)

  const settingsQuery = useQuery({
    queryKey: queryKeys.settings.snapshot,
    queryFn: () => settingsApi.get(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
  const settingsLoading = settingsQuery.isLoading

  useEffect(() => {
    if (!settingsQuery.data) return
    const cfg = buildScopedSettingsConfig(settingsQuery.data, selectedDataset)
    setSavedConfig(cfg)
    setDraftConfig(cloneSettingsConfig(cfg))
  }, [
    settingsQuery.data,
    selectedDataset,
    selectedDataset?.embedding_defaults?.api_base,
    selectedDataset?.embedding_defaults?.model,
    selectedDataset?.embedding_defaults?.provider,
    selectedDatasetId,
  ])

  useEffect(() => {
    if (!settingsQuery.error) return
    toast.error(formatApiError(settingsQuery.error, t('toasts.loadFailed')))
  }, [settingsQuery.error, t])

  const isDirty = useMemo(
    () => JSON.stringify(savedConfig) !== JSON.stringify(draftConfig),
    [savedConfig, draftConfig]
  )
  const handleResetDraft = useCallback(() => {
    setDraftConfig(savedConfig ? cloneSettingsConfig(savedConfig) : null)
    setConfirmEmbeddingSaveOpen(false)
  }, [savedConfig])

  const handleSave = async () => {
    if (!draftConfig || isSavingSettings) return
    setIsSavingSettings(true)
    try {
      if (selectedDatasetId) {
        await datasetApi.update(selectedDatasetId, {
          embedding_defaults: buildDatasetEmbeddingDefaults(draftConfig),
        })
        await queryClient.invalidateQueries({
          queryKey: queryKeys.datasets.all,
        })
        setSavedConfig(cloneSettingsConfig(draftConfig))
        toast.success('已保存到当前数据集，既有数据集不会被全局改动影响')
      } else {
        await settingsApi.update(draftConfig)
        setSavedConfig(cloneSettingsConfig(draftConfig))
        toast.success(t('toasts.saveSuccess'))
      }
    } catch (err) {
      toast.error(formatApiError(err, t('toasts.saveFailed')))
    } finally {
      setIsSavingSettings(false)
      setConfirmEmbeddingSaveOpen(false)
    }
  }

  const handleSaveDraft = () => {
    if (savedConfig?.embedding.model !== draftConfig?.embedding.model) {
      setConfirmEmbeddingSaveOpen(true)
      return
    }
    detachPromise(handleSave())
  }

  const handleApplyRecommendedConfig = () => {
    setDraftConfig((prev) =>
      prev
        ? {
            ...prev,
            rag: {
              ...prev.rag,
              retrieval_top_k: Math.max(prev.rag.retrieval_top_k, 12),
              similarity_threshold: Math.min(
                prev.rag.similarity_threshold,
                0.6
              ),
            },
          }
        : null
    )
    toast.success('已应用到配置草稿，请保存后生效')
  }

  if (settingsLoading && !draftConfig)
    return (
      <div className="space-y-4 p-6 animate-pulse">
        <div className="h-20 rounded-md bg-muted/55" />
        <div className="h-40 rounded-md bg-muted/45" />
      </div>
    )

  const isDatasetScoped = Boolean(selectedDatasetId)
  const selectedScopeValue = selectedDatasetId || datasetAllValue
  const scopeDatasetId = selectedDatasetId || '系统默认'
  const selectedDatasetName =
    selectedDataset?.name || selectedDatasetId || '系统默认'
  const scopeLabel = isDatasetScoped ? selectedDatasetName : '系统默认'
  const scopeDetail = isDatasetScoped
    ? `${selectedDatasetName} · ${selectedDatasetId}`
    : '系统默认 · 新数据集或未单独配置的数据集'
  const hasDatasetEmbeddingOverride = Boolean(
    selectedDataset?.embedding_defaults?.model
  )
  const saveScopeDescription = isDatasetScoped
    ? '保存到当前数据集元数据；只影响该数据集后续入库和后续迁移策略。'
    : '写入系统默认配置；用于新数据集或未设置独立向量模型的数据集。'
  const embeddingChangeDescription = isDatasetScoped
    ? '这次只更新当前数据集的向量模型，不会改动其他数据集。已有文档不会自动重新生成向量；隔离中的文档仍保持隔离，只有人工释放或重新入库后才会处理。'
    : '这次只更新系统默认向量模型，不会自动迁移已有数据集。已设置独立向量模型的数据集不会被覆盖，隔离中的文档也不会自动重新处理。'
  const retrievalTopK = draftConfig?.rag.retrieval_top_k ?? 5
  const similarityThreshold = draftConfig?.rag.similarity_threshold ?? 0.7
  const topKTrackPercent = ((retrievalTopK - 1) / (50 - 1)) * 100
  const similarityTrackPercent = similarityThreshold * 100

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent dark:bg-background/35"
      aria-label={t('header.title')}
    >
      <div className="flex-1 min-h-0 overflow-y-auto p-2 no-scrollbar xl:overflow-y-auto">
        <div
          className={cn(
            'grid min-h-0 gap-2 xl:h-full',
            settingsSidebarCollapsed
              ? 'xl:grid-cols-1'
              : 'xl:grid-cols-[206px_minmax(0,1fr)]'
          )}
        >
          {settingsSidebarCollapsed ? null : (
            <div className="space-y-2 xl:sticky xl:top-0 xl:self-start">
              <Panel padding="none" className={SETTINGS_SIDE_PANEL_CLASS}>
                <div className={SETTINGS_SIDE_HEADER_CLASS}>
                  <div className="flex items-start gap-2.5">
                    <div className={SETTINGS_SIDE_ICON_CLASS}>
                      <Database className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground">
                        配置作用域
                      </div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">
                        选择数据集后，向量配置只保存到当前数据集。
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-2.5 p-3">
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-muted-foreground">
                      选择数据集
                    </div>
                    <Select
                      value={selectedScopeValue}
                      onValueChange={onDatasetScopeChange}
                      disabled={!onDatasetScopeChange || datasetsLoading}
                    >
                      <SelectTrigger
                        className={cn('h-9 rounded-md text-sm', SETTINGS_CONTROL_CLASS)}
                        aria-label="选择数据集配置作用域"
                      >
                        <SelectValue
                          placeholder={
                            datasetsLoading ? '加载数据集...' : '选择数据集'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={datasetAllValue}>
                          系统默认 · 新数据集
                        </SelectItem>
                        {datasets.map((dataset) => (
                          <SelectItem key={dataset.id} value={dataset.id}>
                            {dataset.name} · {dataset.id.slice(0, 8)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {datasets.length === 0 && !datasetsLoading ? (
                      <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground">
                        暂无可选数据集，可先使用系统默认配置。
                      </div>
                    ) : null}
                  </div>

                  <div
                    className={cn(
                      'rounded-md p-3',
                      SETTINGS_INSET_CLASS
                    )}
                    title={`${scopeLabel} · ${scopeDatasetId}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-medium text-muted-foreground">
                        作用范围
                      </div>
                      <span className="rounded-md border border-info/20 bg-info/10 px-2 py-0.5 text-xs font-medium text-info">
                        {isDatasetScoped ? '数据集' : '系统默认'}
                      </span>
                    </div>
                    <div className="mt-2 truncate text-sm font-medium text-foreground">
                      {scopeLabel}
                    </div>
                    <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="shrink-0">
                        ID
                      </span>
                      <span className="truncate font-mono">
                        {selectedDatasetId ? scopeDatasetId.slice(0, 8) : scopeDatasetId}
                      </span>
                    </div>
                    <div className="mt-2 truncate text-xs text-muted-foreground">
                      {isDatasetScoped ? '仅影响后续入库' : '新数据集默认值'}
                    </div>
                  </div>
                </div>
              </Panel>

              <Panel padding="none" className={SETTINGS_SIDE_PANEL_CLASS}>
              <div className="p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Info className="size-4 text-primary" />
                  配置指引
                </div>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                  先选择保存范围，再调整模型和检索参数。
                </p>
                <button
                  type="button"
                  aria-expanded={guideExpanded}
                  aria-controls={SETTINGS_GUIDE_PANEL_ID}
                  onClick={() => setGuideExpanded((expanded) => !expanded)}
                  className="mt-2 inline-flex min-h-8 items-center text-xs font-medium text-primary hover:text-primary/80"
                >
                  {guideExpanded ? '收起配置指南' : '查看配置指南'}
                  <ChevronRight
                    className={cn(
                      'ml-1 size-3 transition-transform',
                      guideExpanded && 'rotate-90'
                    )}
                  />
                </button>
                {guideExpanded ? (
                  <div
                    id={SETTINGS_GUIDE_PANEL_ID}
                    className="mt-2.5 space-y-2 border-t border-border pt-3 text-xs leading-5 text-muted-foreground"
                  >
                    <div>
                      <span className="font-medium text-foreground/82">
                        模型：
                      </span>
                      <span>中文知识库优先看中文/多语言模型；数据集独立配置只影响当前范围，隔离文档不会因为配置变化自动重新嵌入。</span>
                    </div>
                    <div>
                      <span className="font-medium text-foreground/82">
                        召回数量：
                      </span>
                      <span>常规问答建议 8～20；值越高召回更全，但延迟和噪声会上升。</span>
                    </div>
                    <div>
                      <span className="font-medium text-foreground/82">
                        阈值：
                      </span>
                      <span>建议 0.50～0.80；低阈值保召回，高阈值保精度。</span>
                    </div>
                  </div>
                ) : null}
              </div>
              </Panel>
            </div>
          )}

          <div className="space-y-2.5 xl:h-full xl:max-h-full xl:min-h-0 xl:overflow-y-auto xl:pr-1 xl:no-scrollbar">
            <Panel padding="none" className={SETTINGS_PANEL_CLASS}>
              <div className={SETTINGS_PANEL_HEADER_CLASS}>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={SETTINGS_PANEL_ICON_CLASS}>
                      <Database className="size-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        向量模型
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        当前范围：{scopeDetail}
                      </p>
                    </div>
                  </div>
                  <span className="rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                    {isDatasetScoped
                      ? hasDatasetEmbeddingOverride
                        ? '数据集独立配置'
                        : '继承后可覆盖'
                      : '系统默认'}
                  </span>
                </div>
              </div>

              <div className="p-3">
                <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-4">
                  {EMBEDDING_PRESETS.map((preset) => {
                    const model = preset.model
                    const selected = draftConfig?.embedding.model === model
                    return (
                      <button
                        key={model}
                        type="button"
                        onClick={() =>
                          setDraftConfig((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  embedding: {
                                    ...prev.embedding,
                                    provider: preset.provider,
                                    api_base: preset.apiBase,
                                    model,
                                  },
                                }
                              : null
                          )
                        }
                        className={cn(
                          'rounded-md border p-3 text-left transition-colors',
                          selected
                            ? 'border-primary/45 bg-primary/5 ring-1 ring-primary/15'
                            : 'border-border bg-background hover:border-primary/35 hover:bg-muted/30'
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span
                              className={cn(
                                'flex size-4 items-center justify-center rounded-full border',
                                selected
                                  ? 'border-primary bg-primary'
                                  : 'border-border bg-background'
                              )}
                            >
                              {selected ? (
                                <span className="size-1.5 rounded-full bg-primary-foreground" />
                              ) : null}
                            </span>
                            <div
                              className={cn(
                                'break-all text-sm font-semibold',
                                selected ? 'text-primary' : 'text-foreground'
                              )}
                            >
                              {model}
                            </div>
                            {model === 'text-embedding-v4' ? (
                              <span className="rounded-md bg-success/10 px-1.5 py-0.5 text-xs font-medium text-success">
                                推荐
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          {EMBEDDING_MODEL_META[model].description}
                        </p>

                        <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                          <span className="font-medium text-foreground">
                            {preset.brand}
                          </span>
                          <span className="font-mono text-muted-foreground">
                            {preset.provider}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </Panel>

            <Panel
              padding="none"
              className={SETTINGS_PANEL_CLASS}
            >
              <div className={SETTINGS_PANEL_HEADER_CLASS}>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={SETTINGS_PANEL_ICON_CLASS}>
                      <Settings className="size-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        检索参数
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        控制召回的数量与相似度阈值，影响检索结果的质量与范围。
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 rounded-md px-3 text-xs"
                    onClick={handleResetDraft}
                    disabled={!isDirty}
                  >
                    恢复已保存配置
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 p-4 md:grid-cols-2">
                <div className="rounded-md border border-border bg-background p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        召回数量
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        单次检索最多返回多少条结果
                      </div>
                    </div>
                    <div className="rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1 font-mono text-sm font-semibold text-primary">
                      {retrievalTopK}
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="relative h-5">
                      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 rounded-full bg-muted/70 -translate-y-1/2 dark:bg-muted-foreground/20" />
                      <div
                        className="pointer-events-none absolute left-0 top-1/2 h-1 rounded-full bg-info/80 -translate-y-1/2 dark:bg-info"
                        style={{ width: `${topKTrackPercent}%` }}
                      />
                      <input
                        aria-label="召回数量"
                        type="range"
                        min="1"
                        max="50"
                        value={retrievalTopK}
                        onChange={(e) =>
                          setDraftConfig((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  rag: {
                                    ...prev.rag,
                                    retrieval_top_k: Number(e.target.value),
                                  },
                                }
                              : null
                          )
                        }
                        className="relative z-10 h-5 w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-5 [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:mt-0 [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary/45 [&::-webkit-slider-thumb]:bg-card [&::-moz-range-track]:h-5 [&::-moz-range-track]:bg-transparent [&::-moz-range-progress]:h-5 [&::-moz-range-progress]:bg-transparent [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-primary/45 [&::-moz-range-thumb]:bg-card"
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>1</span>
                      <span>5</span>
                      <span>10</span>
                      <span>20</span>
                      <span>50</span>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      建议范围：8 ～ 20
                    </div>
                  </div>
                </div>

                <div className="rounded-md border border-border bg-background p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        相似度阈值
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        过滤相似度低于阈值的结果
                      </div>
                    </div>
                    <div className="rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1 font-mono text-sm font-semibold text-primary">
                      {similarityThreshold.toFixed(2)}
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="relative h-5">
                      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 rounded-full bg-muted/70 -translate-y-1/2 dark:bg-muted-foreground/20" />
                      <div
                        className="pointer-events-none absolute left-0 top-1/2 h-1 rounded-full bg-info/80 -translate-y-1/2 dark:bg-info"
                        style={{ width: `${similarityTrackPercent}%` }}
                      />
                      <input
                        aria-label="相似度阈值"
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={similarityThreshold}
                        onChange={(e) =>
                          setDraftConfig((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  rag: {
                                    ...prev.rag,
                                    similarity_threshold: Number(
                                      e.target.value
                                    ),
                                  },
                                }
                              : null
                          )
                        }
                        className="relative z-10 h-5 w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-5 [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:mt-0 [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary/45 [&::-webkit-slider-thumb]:bg-card [&::-moz-range-track]:h-5 [&::-moz-range-track]:bg-transparent [&::-moz-range-progress]:h-5 [&::-moz-range-progress]:bg-transparent [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-primary/45 [&::-moz-range-thumb]:bg-card"
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>0</span>
                      <span>0.25</span>
                      <span>0.50</span>
                      <span>0.75</span>
                      <span>1</span>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      建议范围：0.50 ～ 0.80
                    </div>
                  </div>
                </div>

              </div>
              <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-muted-foreground">
                  运行时检索模式由对话设置、检索方案和请求参数决定，可在检索测试中验证实际效果。
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 rounded-md"
                  onClick={handleApplyRecommendedConfig}
                >
                  应用推荐值
                </Button>
              </div>
            </Panel>

            <Panel
              padding="none"
              className="sticky bottom-0 z-10 overflow-hidden bg-background"
            >
              <div className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <span>保存配置</span>
                    <span className={cn('text-xs', isDirty ? 'text-warning' : 'text-success')}>
                      {isDirty ? '有未保存更改' : '已保存'}
                    </span>
                  </div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                    {saveScopeDescription}保存成功后会刷新当前草稿和已保存配置。
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3">
                  {isDirty ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 rounded-md border-warning/30 bg-warning/5 px-4 text-xs font-medium text-warning hover:bg-warning/10 hover:text-warning"
                      onClick={handleResetDraft}
                    >
                      重置更改
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    className="h-9 rounded-md px-4 text-xs font-medium"
                    onClick={handleSaveDraft}
                    disabled={isSavingSettings || !draftConfig || !isDirty}
                  >
                    {isSavingSettings ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : null}
                    保存配置
                  </Button>
                  {onGoToRetrievalTest ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 rounded-md px-4 text-xs font-medium"
                      onClick={onGoToRetrievalTest}
                    >
                      检索测试
                      <ChevronRight className="ml-2 size-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            </Panel>
          </div>
        </div>
      </div>

      <AlertDialog
        open={confirmEmbeddingSaveOpen}
        onOpenChange={setConfirmEmbeddingSaveOpen}
      >
        <AlertDialogContent className="border-border bg-background sm:rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-medium">
              确认更改向量模型？
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm font-medium leading-relaxed">
              {embeddingChangeDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10 rounded-md">
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSave}
              className="h-10 rounded-md bg-primary text-primary-foreground"
            >
              确认保存配置
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// --- KnowledgeConnectorRunsPanel 实现 ---
export function KnowledgeConnectorRunsPanel({
  selectedDatasetId,
  connectorRuns,
  connectorRunsLoading,
  onCancelConnectorRun,
  onResumeConnectorRun,
  onRetryFailedConnectorRun,
  onLoadConnectorRuns,
}: Readonly<KnowledgeConnectorRunsPanelProps>) {
  const t = useTranslations('KnowledgeSettingsPanel')
  const [runStatusFilter, setRunStatusFilter] =
    useState<ConnectorRunStatusFilter>('all')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)

  const stats = useMemo(
    () => ({
      total: connectorRuns.length,
      active: connectorRuns.filter(
        (r) => r.status === 'running' || r.status === 'pending'
      ).length,
      failed: connectorRuns.filter((r) => r.status === 'failed').length,
      completed: connectorRuns.filter((r) => r.status === 'completed').length,
    }),
    [connectorRuns]
  )

  const visibleRuns = useMemo(() => {
    let list =
      runStatusFilter === 'all'
        ? connectorRuns
        : connectorRuns.filter(
            (r) => String(r.status).toLowerCase() === runStatusFilter
          )

    return [...list].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }, [connectorRuns, runStatusFilter])

  useEffect(() => {
    if (!autoRefresh || stats.active === 0) return
    const id = setInterval(
      () => onLoadConnectorRuns({ datasetId: selectedDatasetId }),
      5000
    )
    return () => clearInterval(id)
  }, [autoRefresh, stats.active, selectedDatasetId, onLoadConnectorRuns])

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="space-y-3 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Terminal className="size-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              {t('connectorRuns.title')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex min-h-8 items-center gap-2 rounded-md border border-border bg-muted/20 px-2.5">
              <span className="text-xs text-foreground">
                自动刷新
              </span>
              <Switch
                aria-label="自动刷新任务"
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
              />
            </div>
            <IconButton
              label="刷新"
              variant="outline"
              className="size-8 rounded-md text-muted-foreground hover:text-foreground"
              onClick={() =>
                onLoadConnectorRuns({ datasetId: selectedDatasetId })
              }
            >
              <RefreshCw
                className={cn('size-4', connectorRunsLoading && 'animate-spin')}
              />
            </IconButton>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-md bg-muted/40 p-1 sm:grid-cols-4">
          {([
            {
              key: 'all',
              label: t('connectorRuns.summary.all'),
              count: stats.total,
              color: 'text-foreground',
            },
            {
              key: 'running',
              label: t('connectorRuns.summary.active'),
              count: stats.active,
              color: 'text-primary',
            },
            {
              key: 'failed',
              label: t('runStatus.failed'),
              count: stats.failed,
              color: 'text-destructive',
            },
            {
              key: 'completed',
              label: t('runStatus.completed'),
              count: stats.completed,
              color: 'text-success',
            },
          ] satisfies Array<{
            key: ConnectorRunStatusFilter
            label: string
            count: number
            color: string
          }>).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setRunStatusFilter(item.key)}
              className={cn(
                'flex h-8 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors',
                runStatusFilter === item.key
                  ? ['bg-background', item.color]
                  : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
              )}
            >
              <span>{item.label}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {item.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3 no-scrollbar">
        <AnimatePresence mode="popLayout">
          {visibleRuns.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-16 text-center"
            >
              <History className="mb-3 size-8 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">
                {t('connectorRuns.empty.title')}
              </span>
              <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                {t('connectorRuns.zeroState.description')}
              </p>
            </motion.div>
          ) : (
            visibleRuns.map((run) => (
              <TaskCard
                key={run.id}
                run={run}
                onCancel={onCancelConnectorRun}
                onResume={onResumeConnectorRun}
                onRetry={onRetryFailedConnectorRun}
                isExpanded={expandedRunId === run.id}
                onToggleExpand={() =>
                  setExpandedRunId(expandedRunId === run.id ? null : run.id)
                }
              />
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function TaskCard({
  run,
  onCancel,
  onResume,
  onRetry,
  isExpanded,
  onToggleExpand,
}: Readonly<TaskCardProps>) {
  const { total, processed } = getConnectorRunProgress(run.stats || {})
  const runErrors = getConnectorRunErrors(run.stats)
  const progressPct = total > 0 ? Math.round((processed / total) * 100) : 0
  const isFailed = run.status === 'failed'
  const isRunning = run.status === 'running' || run.status === 'pending'
  const isCancelled = run.status === 'cancelled'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className={cn(
        'rounded-md border transition-colors',
        isRunning
          ? 'border-primary/30 bg-primary/[0.03]'
          : 'border-border bg-background hover:bg-muted/20'
      )}
    >
      <div className="space-y-3 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-md border',
                isFailed
                  ? 'bg-destructive/10 border-destructive/20 text-destructive'
                  : isRunning
                    ? 'bg-primary/10 border-primary/20 text-primary'
                    : 'bg-muted/40 border-border/40 text-muted-foreground'
              )}
            >
              <Link2 className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="max-w-[14rem] truncate text-sm font-medium leading-none text-foreground">
                  {run.connector_id}
                </span>
                <div
                  className={cn(
                    'size-1.5 rounded-full',
                    isFailed
                      ? 'bg-destructive'
                      : isRunning
                        ? 'bg-primary animate-pulse'
                        : 'bg-muted-foreground/30'
                  )}
                />
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
                <span>{formatDate(run.created_at)}</span>
                <span>·</span>
                <span>{run.id.slice(0, 8)}</span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {isRunning && (
              <IconButton
                label="取消"
                variant="ghost"
                className="size-8 rounded-md text-muted-foreground hover:text-destructive"
                onClick={() => onCancel(run.id)}
              >
                <X className="size-3.5" />
              </IconButton>
            )}
            {isFailed && (
              <IconButton
                label="重试"
                variant="ghost"
                className="size-8 rounded-md text-muted-foreground hover:text-primary"
                onClick={() => onRetry(run.id)}
              >
                <RotateCcw className="size-3.5" />
              </IconButton>
            )}
            {isCancelled && onResume ? (
              <IconButton
                label="继续"
                variant="ghost"
                className="size-8 rounded-md text-muted-foreground hover:text-primary"
                onClick={() => onResume(run.id)}
              >
                <RefreshCw className="size-3.5" />
              </IconButton>
            ) : null}
            <IconButton
              label="复制"
              variant="ghost"
              className="size-8 rounded-md text-muted-foreground"
              onClick={() => {
                detachPromise(
                  navigator.clipboard
                    .writeText(run.id)
                    .then(() => toast.success('已复制任务 ID'))
                    .catch(() => toast.error('复制失败，请稍后重试'))
                )
              }}
            >
              <Terminal className="size-3.5" />
            </IconButton>
          </div>
        </div>

        {total > 0 && (
          <div className="space-y-1.5">
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted/60">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                className={cn(
                  'h-full transition-colors',
                  isFailed ? 'bg-destructive/60' : 'bg-primary/70'
                )}
              />
            </div>
            <div className="flex items-center justify-between px-0.5">
              <span className="text-xs text-foreground">
                已完成 {progressPct}%
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {processed}/{total}
              </span>
            </div>
          </div>
        )}

        {isFailed && run.error_message && (
          <button
            type="button"
            aria-expanded={isExpanded}
            onClick={onToggleExpand}
            className="flex min-h-9 w-full items-center justify-between rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-destructive transition-colors hover:bg-destructive/10"
          >
            <span className="truncate text-xs font-medium">
              错误详情
            </span>
            <ChevronDown
              className={cn(
                'size-3 transition-transform',
                isExpanded && 'rotate-180'
              )}
            />
          </button>
        )}
      </div>

      <AnimatePresence>
        {isExpanded && isFailed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-muted/20"
          >
            <div className="border-t border-border p-3 font-mono text-xs leading-5 text-muted-foreground">
              <div className="mb-1 font-medium text-destructive">
                错误：{run.error_message}
              </div>
              {runErrors
                .slice(0, 2)
                .map((err) => (
                  <div key={toTrimmedPrimitiveString(err.error ?? err.message ?? err.code, 'error')} className="mt-1 truncate">
                    {toTrimmedPrimitiveString(err.error ?? err.message ?? err.code, '未知错误')}
                  </div>
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
