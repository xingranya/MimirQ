import { Filter } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { SimilarityMatrixEntry } from '@/components/ragviz/similarity/color-schemes'
import { Panel, RightEmptyInfoCard } from '@/components/ragviz/similarity/display-components'
import {
  similarityInputClass,
  similarityNativeSelectClass,
} from '@/components/ragviz/similarity/form-controls'
import { cn } from '@/lib/utils'

type SimilarityRange = Readonly<{ min: number; max: number }>
type SimilarityTopK = Readonly<{ value: number; axis: 'x' | 'y' }>

type SimilarityFilterControlsProps = Readonly<{
  entry: SimilarityMatrixEntry | null
  rangeBounds: SimilarityRange
  similarityRange: SimilarityRange
  topK: SimilarityTopK
  onDisplayFieldsChange: (xField: string, yField: string) => void
  onSimilarityRangeChange: (range: SimilarityRange) => void
  onTopKChange: (topK: SimilarityTopK) => void
}>

function topKDescription(topK: SimilarityTopK) {
  if (topK.value === 0) return '显示全部'
  return topK.axis === 'x' ? '按行取 Top-K' : '按列取 Top-K'
}

export function SimilarityFilterControls({
  entry,
  rangeBounds,
  similarityRange,
  topK,
  onDisplayFieldsChange,
  onSimilarityRangeChange,
  onTopKChange,
}: SimilarityFilterControlsProps) {
  if (!entry) {
    return (
      <Panel title="筛选器控制">
        <RightEmptyInfoCard
          title="暂无可筛选的矩阵"
          icon={<Filter className="size-5" />}
          description="请先生成相似度矩阵后，在这里选择一个主图矩阵。"
        />
      </Panel>
    )
  }

  const matrix = entry.result.matrix || []
  const rowCount = matrix.length
  const columnCount = rowCount > 0 ? matrix[0]?.length || 0 : 0
  const topKMax = Math.max(0, topK.axis === 'x' ? columnCount : rowCount)

  return (
    <Panel title="筛选器控制">
      <div className="space-y-5">
        <div className="space-y-2">
          <label
            htmlFor="similarity-x-display-field"
            className="text-xs font-medium text-foreground/80"
          >
            横坐标显示字段
          </label>
          <select
            id="similarity-x-display-field"
            className={similarityNativeSelectClass}
            value={entry.visualConfig.displayFields.xField}
            onChange={(event) =>
              onDisplayFieldsChange(event.target.value, entry.visualConfig.displayFields.yField)
            }
          >
            {entry.result.x_available_fields.map((field) => (
              <option key={field} value={field}>
                {field}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="similarity-y-display-field"
            className="text-xs font-medium text-foreground/80"
          >
            纵坐标显示字段
          </label>
          <select
            id="similarity-y-display-field"
            className={similarityNativeSelectClass}
            value={entry.visualConfig.displayFields.yField}
            onChange={(event) =>
              onDisplayFieldsChange(entry.visualConfig.displayFields.xField, event.target.value)
            }
          >
            {entry.result.y_available_fields.map((field) => (
              <option key={field} value={field}>
                {field}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-foreground/80">相似度阈值范围</legend>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="range"
                aria-label="最低相似度"
                min={rangeBounds.min}
                max={rangeBounds.max}
                step={0.01}
                value={similarityRange.min}
                onChange={(event) =>
                  onSimilarityRangeChange({
                    min: Number(event.target.value),
                    max: similarityRange.max,
                  })
                }
                className="flex-1"
              />
              <input
                type="number"
                aria-label="最低相似度数值"
                min={rangeBounds.min}
                max={rangeBounds.max}
                step={0.01}
                value={similarityRange.min}
                onChange={(event) =>
                  onSimilarityRangeChange({
                    min: Number(event.target.value),
                    max: similarityRange.max,
                  })
                }
                className={cn(similarityInputClass, 'w-20')}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                aria-label="最高相似度"
                min={rangeBounds.min}
                max={rangeBounds.max}
                step={0.01}
                value={similarityRange.max}
                onChange={(event) =>
                  onSimilarityRangeChange({
                    min: similarityRange.min,
                    max: Number(event.target.value),
                  })
                }
                className="flex-1"
              />
              <input
                type="number"
                aria-label="最高相似度数值"
                min={rangeBounds.min}
                max={rangeBounds.max}
                step={0.01}
                value={similarityRange.max}
                onChange={(event) =>
                  onSimilarityRangeChange({
                    min: similarityRange.min,
                    max: Number(event.target.value),
                  })
                }
                className={cn(similarityInputClass, 'w-20')}
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-foreground/80">Top-K 筛选</legend>
          <div className="flex items-center gap-2">
            <input
              type="range"
              aria-label="Top-K 数量"
              min={0}
              max={topKMax}
              step={1}
              value={topK.value}
              onChange={(event) => onTopKChange({ ...topK, value: Number(event.target.value) })}
              className="flex-1"
            />
            <input
              type="number"
              aria-label="Top-K 数值"
              min={0}
              max={topKMax}
              step={1}
              value={topK.value}
              onChange={(event) => onTopKChange({ ...topK, value: Number(event.target.value) })}
              className={cn(similarityInputClass, 'w-20')}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={topK.axis === 'x' ? 'default' : 'outline'}
              size="sm"
              aria-pressed={topK.axis === 'x'}
              onClick={() => onTopKChange({ ...topK, axis: 'x' })}
              className="flex-1"
            >
              横轴 Top-K
            </Button>
            <Button
              variant={topK.axis === 'y' ? 'default' : 'outline'}
              size="sm"
              aria-pressed={topK.axis === 'y'}
              onClick={() => onTopKChange({ ...topK, axis: 'y' })}
              className="flex-1"
            >
              纵轴 Top-K
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            当前：Top-{topK.value}（{topKDescription(topK)}）
          </p>
        </fieldset>
      </div>
    </Panel>
  )
}
