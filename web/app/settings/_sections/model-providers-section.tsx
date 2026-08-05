'use client'

import { ModelProviderCard } from '@/components/model-provider-card'
import type { ModelProvider, ProviderCategory } from '@/types/models'
import type { LucideIcon } from 'lucide-react'
import { ArrowRight, Cpu, Layers, Server } from 'lucide-react'
import { cn } from '@/lib/utils'
import { systemPageTokens, systemWorkbenchTokens } from '@/components/ui/system-page-tokens'

const CONFIGURABLE_CATEGORIES = [
  'model',
  'embedding',
] as const satisfies readonly ProviderCategory[]

const CATEGORY_INFO: Record<
  (typeof CONFIGURABLE_CATEGORIES)[number],
  { title: string; description: string; icon: LucideIcon }
> = {
  model: {
    title: '语言模型',
    description: '用于对话和文本生成的大语言模型',
    icon: Server,
  },
  embedding: {
    title: '向量模型',
    description: '用于文档语义理解和检索',
    icon: Cpu,
  },
}

type ModelProvidersSectionProps = {
  groupedProviders: Record<ProviderCategory, ModelProvider[]>
  onConfigure: (provider: ModelProvider) => void
}

export function ModelProvidersSection({
  groupedProviders,
  onConfigure,
}: Readonly<ModelProvidersSectionProps>) {
  return (
    <section>
      <div className="space-y-4">
        {CONFIGURABLE_CATEGORIES.map((category) => {
          const info = CATEGORY_INFO[category]
          const InfoIcon = info.icon

          return (
            <div key={category} className={cn(systemWorkbenchTokens.panel, 'p-3.5')}>
              <div className="mb-3 flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/35">
                  <InfoIcon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-[13px] font-semibold text-foreground">{info.title}</h3>
                  <p className={systemPageTokens.subtle}>{info.description}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {groupedProviders[category].map((provider) => (
                  <ModelProviderCard
                    key={provider.id}
                    provider={provider}
                    onConfigure={onConfigure}
                  />
                ))}
              </div>
            </div>
          )
        })}

        <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Layers className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-foreground">重排序模型</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                服务选择、参数和本地模型版本统一在“检索与生成”中管理。
              </p>
            </div>
          </div>
          <a
            href="#settings-retrieval"
            className="inline-flex h-9 shrink-0 items-center gap-2 text-sm font-medium text-primary focus-ring"
          >
            前往检索与生成
            <ArrowRight className="size-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  )
}
