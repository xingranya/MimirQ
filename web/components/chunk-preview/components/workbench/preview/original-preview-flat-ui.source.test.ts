import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readSource = (file: string) => readFileSync(resolve(__dirname, file), 'utf8')
const originalSource = readSource('original-preview.tsx')
const pdfSource = readSource('pdf-preview.tsx')
const monacoSource = readSource('original-preview-monaco.tsx')
const coverageSource = readSource('coverage-heatmap-mini.tsx')
const semanticSource = readSource('semantic-quality-heatmap-mini.tsx')
const catalogSource = readFileSync(
  resolve(__dirname, '../../../../../i18n/messages/zh-CN/chunk-preview.ts'),
  'utf8'
)

describe('分块原文定位区', () => {
  it('保留文本、渲染、定位和 PDF 四种查看方式', () => {
    for (const mode of ["setPreviewMode('raw')", "setPreviewMode('rendered')", "setPreviewMode('editor')", "setPreviewMode('pdf')"]) {
      expect(originalSource).toContain(mode)
    }
    expect(originalSource).toContain('<MarkdownRenderer')
    expect(originalSource).toContain('<OriginalPreviewMonaco')
    expect(originalSource).toContain('<PdfPreview />')
    expect(originalSource).toContain('const text = await currentFile.text()')
  })

  it('保留 PDF 异步计算、主线程降级和切块联动', () => {
    expect(pdfSource).toContain("await import('comlink')")
    expect(pdfSource).toContain('computeOnMainThread()')
    expect(pdfSource).toContain('setHoveredChunkIndex(idx)')
    expect(pdfSource).toContain('setSelectedChunkIndex(idx)')
    expect(pdfSource).toContain('<PdfViewer')
  })

  it('PDF 操作栏使用静态布局且不覆盖查看器', () => {
    expect(pdfSource).toContain('flex h-full min-h-0 flex-col')
    expect(pdfSource).toContain('flex shrink-0 justify-end border-b')
    expect(pdfSource).toContain('min-h-0 flex-1')
    expect(pdfSource).not.toContain('absolute right-3 top-3')
  })

  it('覆盖率和语义质量图只展示真实统计', () => {
    expect(coverageSource).toContain('stats?.coverage_ratio')
    expect(coverageSource).toContain('stats?.gap_count')
    expect(semanticSource).toContain('getSemanticQualityMetadata(chunk)')
    expect(semanticSource).toContain('语义质量热力图')
  })

  it('所有原文定位表面使用扁平样式和可读字号', () => {
    for (const source of [originalSource, pdfSource, monacoSource, coverageSource, semanticSource]) {
      for (const forbidden of [
        'bg-[linear-gradient',
        'bg-[radial-gradient',
        'backdrop-blur',
        'shadow-[',
        'shadow-lg',
        'rounded-xl',
        'rounded-2xl',
        'rounded-3xl',
        'font-black',
        'uppercase',
        'tracking-[',
      ]) {
        expect(source).not.toContain(forbidden)
      }
      expect(source).not.toMatch(/text-\[(?:[0-9]|1[01])(?:\.[0-9]+)?px\]/)
    }
  })

  it('用户文案不暴露原始字段和英文辅助说明', () => {
    expect(catalogSource).toContain("raw: '文本'")
    expect(catalogSource).toContain("editor: '定位'")
    expect(catalogSource).toContain("noPositionTagsTitle: '没有 PDF 位置数据'")
    expect(catalogSource).toContain("loadingSrMessage: '正在加载文本预览'")

    for (const oldCopy of [
      "srMessage: 'Preparing PDF highlight overlays'",
      "originalTextMissing: '后端未返回 original_text（可能被 original_text_max_chars 限制）。'",
      "raw: '源码'",
      "editorTitle: 'Large-text viewer with stable highlight + overview markers'",
      "loadingSrMessage: 'Loading text preview'",
    ]) {
      expect(catalogSource).not.toContain(oldCopy)
    }
  })
})
