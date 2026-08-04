'use client'

import { PipelineOptionsPanel } from '@/components/pipeline-options-panel'
import { ChunkStrategyDropdown } from '@/components/business/chunk-strategy-dropdown'
import { SettingsHelpTooltip } from '@/components/settings/settings-help-tooltip'
import { Panel } from '@/components/ui/panel'
import { ParserDropdown } from '@/components/business/parser-dropdown'
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
    <section>
      <Panel
        className="space-y-3 rounded-[16px] border-border/60 bg-card/82 shadow-sm"
        padding="md"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground/78">
              <span>解析方式</span>
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
          <div className="space-y-2">
            <div className="text-[12px] font-medium text-foreground/78">
              切块策略
            </div>
            <ChunkStrategyDropdown
              value={chunkStrategy}
              onChange={setChunkStrategy}
            />
          </div>
        </div>

        <details className="group rounded-[14px] border border-border/60 bg-muted/24">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-[12px] font-medium text-foreground/78 transition-colors hover:bg-muted/35">
            <span>入库管线高级配置</span>
            <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t border-border/60 bg-card/75 p-3">
            <PipelineOptionsPanel compact />
          </div>
        </details>
      </Panel>
    </section>
  )
}
