'use client'

import { PipelineOptionsPanel } from '@/components/pipeline-options-panel'
import { ChunkStrategyDropdown } from '@/components/business/chunk-strategy-dropdown'
import { SettingsHelpTooltip } from '@/components/settings/settings-help-tooltip'
import { ParserDropdown } from '@/components/business/parser-dropdown'
import { Label } from '@/components/ui/label'
import { ChevronDown } from 'lucide-react'

type FrontendPreferencesSectionProps = {
  parserBackend: string
  setParserBackend: (value: string) => void
  chunkStrategy: string
  setChunkStrategy: (value: string) => void
}

export function FrontendPreferencesSection({
  parserBackend,
  setParserBackend,
  chunkStrategy,
  setChunkStrategy,
}: Readonly<FrontendPreferencesSectionProps>) {
  return (
    <section className="space-y-4 border-t border-border py-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-1.5">
              <Label className="text-sm font-medium text-foreground">解析方式</Label>
              <SettingsHelpTooltip
                label="查看前端偏好保存说明"
                side="right"
                className="size-7"
              >
                这些偏好只保存在当前浏览器，用于新上传和预览，不会修改系统配置。
              </SettingsHelpTooltip>
            </div>
            <ParserDropdown value={parserBackend} onChange={setParserBackend} />
          </div>
          <div className="min-w-0 space-y-2">
            <Label className="text-sm font-medium text-foreground">切块策略</Label>
            <ChunkStrategyDropdown
              value={chunkStrategy}
              onChange={setChunkStrategy}
            />
          </div>
        </div>

        <details className="group border-y border-border">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-medium text-foreground transition-colors hover:text-primary">
            <span>入库管线高级配置</span>
            <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t border-border py-4">
            <PipelineOptionsPanel compact />
          </div>
        </details>
    </section>
  )
}
