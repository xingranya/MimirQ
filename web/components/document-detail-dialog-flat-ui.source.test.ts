import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const files = [
  'document-detail-dialog.tsx',
  'document-detail-dialog/document-detail-summary-cards.tsx',
  'document-detail-dialog/document-detail-tags-panel.tsx',
  'document-detail-dialog/document-detail-lifecycle-panel.tsx',
  'document-detail-dialog/document-detail-activity-panel.tsx',
  'document-detail-dialog/document-versions-dialog.tsx',
]

const sources = files.map((file) => ({
  file,
  source: readFileSync(resolve(__dirname, file), 'utf8'),
}))

const detailSource = sources[0].source
const summarySource = sources[1].source
const lifecycleSource = sources[3].source
const activitySource = sources[4].source
const versionsSource = sources[5].source

describe('文档详情弹窗视觉契约', () => {
  it('主弹窗和子面板使用统一扁平视觉', () => {
    for (const { file, source } of sources) {
      expect(source, file).not.toMatch(
        /rounded-(?:xl|2xl|3xl|full)|shadow-strong|linear-gradient|backdrop-blur/
      )
    }
  })

  it('主弹窗保留固定页头页尾和可滚动内容边界', () => {
    expect(detailSource).toContain('grid-rows-[auto_minmax(0,1fr)_auto]')
    expect(detailSource).toContain('overflow-y-auto overscroll-contain')
    expect(detailSource).toContain('py-3 pl-4 pr-14')
    expect(activitySource).toContain('min-h-[360px] flex-none')
  })

  it('窄屏操作区允许换行，不让按钮覆盖内容', () => {
    expect(activitySource).toContain('flex flex-col gap-2 sm:flex-row')
    expect(activitySource).toContain('flex flex-wrap items-center gap-1')
    expect(activitySource).toContain('flex flex-wrap items-center gap-2')
    expect(versionsSource).toContain('flex flex-col gap-3 rounded-lg')
  })

  it('摘要和生命周期标签不直接暴露字段键名', () => {
    expect(summarySource).toContain('label="解析方式"')
    expect(summarySource).toContain('label="切块大小"')
    expect(summarySource).not.toContain('label="parser_backend"')
    expect(summarySource).not.toContain('label="chunk_size"')
    expect(lifecycleSource).toContain('>发布状态</span>')
    expect(lifecycleSource).not.toContain('>publication_status</span>')
  })
})
