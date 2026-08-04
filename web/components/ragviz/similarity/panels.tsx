'use client'

import type {
  DiagnosticDecision,
  SimilarityDiagnosticsResult,
} from '@/components/ragviz/similarity-diagnostics'
import type { ColorSchemeKey, SimilarityMatrixEntry } from './color-schemes'
import {
  HeatmapScaleLegend,
  SimilarityDiagnosticsView,
  SimilarityEmptyState,
} from './display-components'
import { EchartsHeatmap } from './echarts-heatmap'
import type { SelectedHeatmapCell } from './heatmap-types'

export type MainViewMode = 'heatmap' | 'diagnostics'
export type DisplayLabels = { xLabels: string[]; yLabels: string[] }
export type SimilarityDisplayMatrix = Array<Array<number | null>>

type SimilarityMainPanelProps = Readonly<{
  primaryEntry: SimilarityMatrixEntry | null
  displayMatrix: number[][] | null
  displayLabels: DisplayLabels | null
  mainView: MainViewMode
  diagnostics: SimilarityDiagnosticsResult | null
  maskedMatrix: SimilarityDisplayMatrix | null
  colorScheme: ColorSchemeKey
  isDifferenceMode: boolean
  onDecisionChange: (candidateId: string, decision: DiagnosticDecision | null) => void
  onCellSelect: (cell: SelectedHeatmapCell) => void
}>

export function SimilarityMainPanel({
  primaryEntry,
  displayMatrix,
  displayLabels,
  mainView,
  diagnostics,
  maskedMatrix,
  colorScheme,
  isDifferenceMode,
  onDecisionChange,
  onCellSelect,
}: SimilarityMainPanelProps) {
  if (!primaryEntry || !displayMatrix || !displayLabels) {
    return (
      <div className="flex h-full items-start justify-center px-8 pb-14 pt-0">
        <SimilarityEmptyState />
      </div>
    )
  }

  if (mainView === 'diagnostics') {
    return (
      <SimilarityDiagnosticsPanel
        diagnostics={diagnostics}
        onDecisionChange={onDecisionChange}
      />
    )
  }

  return (
    <SimilarityHeatmapPanel
      primaryEntry={primaryEntry}
      displayMatrix={displayMatrix}
      displayLabels={displayLabels}
      maskedMatrix={maskedMatrix}
      colorScheme={colorScheme}
      isDifferenceMode={isDifferenceMode}
      onCellSelect={onCellSelect}
    />
  )
}

function SimilarityDiagnosticsPanel({
  diagnostics,
  onDecisionChange,
}: Readonly<{
  diagnostics: SimilarityDiagnosticsResult | null
  onDecisionChange: (
    candidateId: string,
    decision: DiagnosticDecision | null
  ) => void
}>) {
  if (diagnostics) {
    return (
      <SimilarityDiagnosticsView
        diagnostics={diagnostics}
        onDecisionChange={onDecisionChange}
      />
    )
  }

  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="rounded-md border border-dashed border-border bg-muted/30 px-6 py-8 text-center">
        <div className="text-sm font-semibold text-foreground">
          向量诊断暂不可用
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          当前处于差值模式，3D 投影预览和异常点标注只在单个主图矩阵上启用。
        </p>
      </div>
    </div>
  )
}

function SimilarityHeatmapPanel({
  primaryEntry,
  displayMatrix,
  displayLabels,
  maskedMatrix,
  colorScheme,
  isDifferenceMode,
  onCellSelect,
}: Readonly<{
  primaryEntry: SimilarityMatrixEntry
  displayMatrix: number[][]
  displayLabels: DisplayLabels
  maskedMatrix: SimilarityDisplayMatrix | null
  colorScheme: ColorSchemeKey
  isDifferenceMode: boolean
  onCellSelect: (cell: SelectedHeatmapCell) => void
}>) {
  return (
    <div className="h-full overflow-auto p-4">
      <section className="flex min-h-[560px] flex-col overflow-hidden rounded-md border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">
              {primaryEntry.xCollectionLabel}（X 轴）
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {displayLabels.xLabels.length} 项 × {displayLabels.yLabels.length} 项
            </div>
          </div>
          <div className="rounded-sm border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
            点击单元格查看右侧统计
          </div>
        </div>

        <div className="min-h-0 flex-1 p-3">
          <EchartsHeatmap
            matrix={maskedMatrix ?? displayMatrix}
            xLabels={displayLabels.xLabels}
            yLabels={displayLabels.yLabels}
            colorScheme={colorScheme}
            isDifference={isDifferenceMode}
            onCellSelect={onCellSelect}
          />
        </div>

        <HeatmapScaleLegend
          colorScheme={colorScheme}
          isDifference={isDifferenceMode}
        />
      </section>
    </div>
  )
}
