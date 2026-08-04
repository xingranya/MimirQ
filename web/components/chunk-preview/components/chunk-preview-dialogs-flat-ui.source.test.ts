import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (filename: string) =>
  readFileSync(resolve(__dirname, filename), 'utf8')

const cardSource = source('chunk-card.tsx')
const autoTuneSource = source('chunk-auto-tune-dialog.tsx')
const compareSource = source('chunk-compare-dialog.tsx')
const inspectorSource = source('chunk-inspector-dialog.tsx')
const presetSource = source('chunk-preset-panel.tsx')
const helpSource = source('chunking-help-dialog.tsx')
const catalogSource = readFileSync(
  resolve(__dirname, '../../../i18n/messages/zh-CN/chunk-preview.ts'),
  'utf8'
)

const visualSources = [
  cardSource,
  autoTuneSource,
  compareSource,
  inspectorSource,
  presetSource,
  helpSource,
]

describe('分块预览二三级界面契约', () => {
  it('使用扁平容器、可读字号和稳定滚动边界', () => {
    for (const value of visualSources) {
      expect(value).not.toContain('bg-[linear-gradient')
      expect(value).not.toContain('backdrop-blur')
      expect(value).not.toContain('shadow-[')
      expect(value).not.toContain('rounded-xl')
      expect(value).not.toContain('rounded-2xl')
      expect(value).not.toContain('text-[9px]')
      expect(value).not.toContain('text-[10px]')
      expect(value).not.toContain('text-[11px]')
    }

    expect(autoTuneSource).toContain('max-h-[min(90dvh,840px)]')
    expect(compareSource).toContain('max-h-[min(90dvh,900px)]')
    expect(inspectorSource).toContain('h-[min(92dvh,880px)]')
    expect(helpSource).toContain('max-h-[min(90dvh,800px)]')
  })

  it('卡片正文不再被绝对定位按钮覆盖，触屏可直接操作', () => {
    expect(cardSource).not.toContain('absolute inset-0')
    expect(cardSource).not.toContain('group-hover:opacity-100')
    expect(cardSource).toContain('onClick={onToggleSelect}')
    expect(cardSource).toContain("t('chunkCard.copyCitation')")
    expect(cardSource).toContain("t('chunkCard.copyContent')")
  })

  it('保留调参、对比、编辑和预设的完整业务链路', () => {
    expect(autoTuneSource).toContain('documentApi.chunkPreviewBySha')
    expect(autoTuneSource).toContain('abortRef.current?.abort()')
    expect(autoTuneSource).toContain('runPreview({ force: true })')

    expect(compareSource).toContain('computeChunkPreviewDiff')
    expect(compareSource).toContain('buildSemanticEvidenceHighlights')
    expect(compareSource).toContain('chunkPreviewDiffToExport')

    expect(inspectorSource).toContain('onSave({ content, metadata: parsedMetadata })')
    expect(inspectorSource).toContain('onReset()')
    expect(inspectorSource).toContain("toast.success(t('chunkInspector.copyEmbeddingSuccess'))")

    expect(presetSource).toContain('chunkPresetApi.list')
    expect(presetSource).toContain('chunkPresetApi.update')
    expect(presetSource).toContain('chunkPresetApi.create')
  })

  it('用户文案不再暴露调参内部字段和英文表头', () => {
    expect(catalogSource).toContain("title: '自动调整切块参数'")
    expect(catalogSource).toContain("params: '参数'")
    expect(catalogSource).toContain("coverage: '覆盖率'")
    expect(catalogSource).toContain("referenceLabel: '最接近的对照内容'")
    expect(catalogSource).toContain("copyEmbeddingFailed: '复制失败，请检查浏览器权限'")
    expect(catalogSource).not.toContain('Auto-tune 完成')
    expect(catalogSource).not.toContain("params: 'Params'")
  })
})
