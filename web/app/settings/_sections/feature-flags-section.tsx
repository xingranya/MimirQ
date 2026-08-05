'use client'

import { SettingsSwitchIndicator } from '@/components/settings/settings-switch'
import { cn } from '@/lib/utils'
import type { FeatureFlags, SystemStatus } from '@/lib/api'
import {
  CloudCog,
  FileCode,
  FileSearch,
  LayoutGrid,
  Network,
  ScanLine,
  Sparkles,
  Wand2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type FeatureFlagDescriptor = {
  name: string
  description: string
  icon: LucideIcon
  dependencies: string[]
  parserStatusKey?: string
}

const FEATURE_FLAG_DETAILS: Record<keyof FeatureFlags, FeatureFlagDescriptor> = {
  kg_enabled: {
    name: '知识图谱抽取',
    description: '从文档中提取实体、事件和关系。',
    icon: Sparkles,
    dependencies: ['向量数据库和大语言模型'],
  },
  deepdoc_enabled: {
    name: 'DeepDoc 结构化解析',
    description: '解析扫描件和图文混排 PDF 中的版面结构。',
    icon: ScanLine,
    dependencies: [],
    parserStatusKey: 'deepdoc',
  },
  docling_enabled: {
    name: 'Docling 结构化解析',
    description: '提取文档版面和表格结构。',
    icon: FileSearch,
    dependencies: [],
    parserStatusKey: 'docling',
  },
  etl4llm_enabled: {
    name: 'ETL4LLM 版面解析',
    description: '通过 ETL4LLM 服务解析版面、表格和图片。',
    icon: LayoutGrid,
    dependencies: ['服务地址'],
    parserStatusKey: 'etl4llm',
  },
  marker_enabled: {
    name: 'Marker 文档解析',
    description: '通过 Marker 服务将 PDF 转为 Markdown。',
    icon: FileCode,
    dependencies: ['服务地址'],
    parserStatusKey: 'marker',
  },
  paddle_vl_enabled: {
    name: 'PaddleOCR-VL 解析',
    description: '通过 PaddleOCR-VL 服务解析扫描件和复杂版面。',
    icon: ScanLine,
    dependencies: ['服务地址'],
    parserStatusKey: 'paddle_vl',
  },
  textin_enabled: {
    name: 'TextIn xParse',
    description: '通过 TextIn API 将文档和图片转为 Markdown。',
    icon: CloudCog,
    dependencies: ['API 地址、APP ID 和密钥'],
    parserStatusKey: 'textin',
  },
  markitdown_enabled: {
    name: 'MarkItDown 文档解析',
    description: '将 Office 文档、表格和 PDF 转为 Markdown。',
    icon: FileCode,
    dependencies: [],
    parserStatusKey: 'markitdown',
  },
  llama_index_enabled: {
    name: 'LlamaIndex 分块',
    description: '使用 LlamaIndex 生成文档分块。',
    icon: Network,
    dependencies: [],
  },
  mineru_enabled: {
    name: 'MinerU 解析',
    description: '通过 MinerU 本地服务或云端 API 解析复杂 PDF。',
    icon: CloudCog,
    dependencies: ['本地服务地址或 API 令牌'],
    parserStatusKey: 'mineru',
  },
  magicpdf_enabled: {
    name: 'MagicPDF 本地解析',
    description: '使用本地 MagicPDF 解析复杂 PDF。',
    icon: Wand2,
    dependencies: ['MagicPDF 运行环境'],
    parserStatusKey: 'magicpdf',
  },
}

const FEATURE_FLAG_GROUPS: ReadonlyArray<{
  id: string
  label: string
  keys: ReadonlyArray<keyof FeatureFlags>
}> = [
  {
    id: 'knowledge',
    label: '知识组织',
    keys: ['kg_enabled', 'llama_index_enabled'],
  },
  {
    id: 'local-parsers',
    label: '内置解析',
    keys: ['deepdoc_enabled', 'docling_enabled', 'markitdown_enabled'],
  },
]

type FeatureFlagsSectionProps = {
  editedFeatureFlags?: Partial<FeatureFlags>
  getFeatureValue: (key: keyof FeatureFlags) => boolean
  toggleFeature: (key: keyof FeatureFlags) => void
  parserStatuses?: SystemStatus['parsers']
  disabled?: boolean
}

function parserStatusText(status: NonNullable<SystemStatus['parsers']>[string]): string {
  if (status.available) return '运行环境可用'
  return status.enabled ? '运行环境不可用' : '运行状态未启用'
}

export function FeatureFlagsSection({
  editedFeatureFlags,
  getFeatureValue,
  toggleFeature,
  parserStatuses,
  disabled = false,
}: Readonly<FeatureFlagsSectionProps>) {
  return (
    <section aria-label="功能开关" className="space-y-5">
      <p className="text-sm leading-5 text-muted-foreground">
        控制知识组织和内置解析能力。需要连接参数的服务请在高级解析中启用和配置。
      </p>

      <div className="space-y-5">
        {FEATURE_FLAG_GROUPS.map((group) => (
          <section key={group.id} aria-labelledby={`feature-group-${group.id}`}>
            <h5
              id={`feature-group-${group.id}`}
              className="mb-2 text-xs font-semibold text-muted-foreground"
            >
              {group.label}
            </h5>
            <div className="divide-y divide-border border-y border-border">
              {group.keys.map((featureKey) => {
                const feature = FEATURE_FLAG_DETAILS[featureKey]
                const Icon = feature.icon
                const isEnabled = getFeatureValue(featureKey)
                const isEdited = Boolean(editedFeatureFlags && featureKey in editedFeatureFlags)
                const status = feature.parserStatusKey
                  ? parserStatuses?.[feature.parserStatusKey]
                  : undefined
                const nameId = `feature-${featureKey}-name`
                const descriptionId = `feature-${featureKey}-description`
                const dependencyId = `feature-${featureKey}-dependency`
                const statusId = `feature-${featureKey}-status`
                const describedBy = [
                  descriptionId,
                  feature.dependencies.length > 0 ? dependencyId : null,
                  status ? statusId : null,
                ]
                  .filter(Boolean)
                  .join(' ')

                return (
                  <button
                    type="button"
                    key={featureKey}
                    disabled={disabled}
                    aria-pressed={isEnabled}
                    aria-labelledby={nameId}
                    aria-describedby={describedBy}
                    onClick={() => toggleFeature(featureKey)}
                    className="flex min-h-14 w-full items-start justify-between gap-4 px-1 py-3 text-left transition-colors focus-ring hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent motion-reduce:transition-none sm:px-2"
                  >
                    <span className="flex min-w-0 items-start gap-3">
                      <span
                        className={cn(
                          'flex size-8 shrink-0 items-center justify-center rounded-md',
                          isEnabled
                            ? 'bg-primary/10 text-primary'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span id={nameId} className="text-sm font-medium text-foreground">
                            {feature.name}
                          </span>
                          {isEdited ? (
                            <span className="text-xs font-medium text-primary">未保存</span>
                          ) : null}
                        </span>
                        <span
                          id={descriptionId}
                          className="mt-1 block text-sm leading-5 text-muted-foreground"
                        >
                          {feature.description}
                        </span>
                        {feature.dependencies.length > 0 ? (
                          <span
                            id={dependencyId}
                            className="mt-1 block text-xs leading-5 text-muted-foreground"
                          >
                            需配置：{feature.dependencies.join('、')}
                          </span>
                        ) : null}
                        {status ? (
                          <span
                            id={statusId}
                            title={status.message || undefined}
                            className={cn(
                              'mt-1 block text-xs leading-5',
                              status.available
                                ? 'text-success'
                                : status.enabled
                                  ? 'text-destructive'
                                  : 'text-muted-foreground'
                            )}
                          >
                            {parserStatusText(status)}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <SettingsSwitchIndicator checked={isEnabled} className="mt-1" />
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  )
}
