import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const componentSource = (fileName: string) =>
  fs.readFileSync(path.resolve(__dirname, '_components', fileName), 'utf8')

describe('图谱面板响应式与视觉契约', () => {
  const bodySource = componentSource('graph-page-body.tsx')
  const headerSource = componentSource('graph-page-header.tsx')
  const nodePanelSource = componentSource('graph-node-detail-panel.tsx')
  const linkPanelSource = componentSource('graph-link-detail-panel.tsx')
  const analysisPanelSource = componentSource('kg-network-analysis-panel.tsx')
  const explainPanelSource = componentSource('graph-explainability-panel.tsx')

  it('在窄屏使用互斥底部面板并让画布角落控件避让', () => {
    expect(nodePanelSource).toContain(
      'fixed inset-x-2 bottom-2 z-20 flex max-h-[calc(100dvh-5.5rem)]'
    )
    expect(linkPanelSource).toContain(
      'fixed inset-x-2 bottom-2 z-20 flex max-h-[calc(100dvh-5.5rem)]'
    )
    expect(explainPanelSource).toContain(
      'fixed inset-x-2 bottom-2 z-20 max-h-[calc(100dvh-5.5rem)]'
    )
    expect(bodySource).toContain('hidden={hasMobileCanvasPanelOpen}')
    expect(bodySource).toContain("hasMobileCanvasPanelOpen ? 'max-md:hidden'")
    expect(analysisPanelSource).toContain('if (hidden) return null')
  })

  it('保留移动端图谱搜索入口', () => {
    expect(headerSource).toContain('aria-label="搜索图谱"')
    expect(headerSource).toContain('mobileSearchInputRef')
    expect(headerSource).toContain('className="size-9 shrink-0 border-border bg-background md:hidden"')
  })

  it('移除详情与分析面板的旧装饰效果', () => {
    for (const source of [nodePanelSource, linkPanelSource, analysisPanelSource]) {
      expect(source).not.toContain('linear-gradient')
      expect(source).not.toContain('radial-gradient')
      expect(source).not.toContain('backdrop-blur')
      expect(source).not.toContain('rounded-[')
      expect(source).not.toContain('rounded-xl')
      expect(source).not.toContain('rounded-2xl')
      expect(source).not.toContain('shadow-soft')
      expect(source).not.toContain('shadow-strong')
      expect(source).not.toContain('text-[11px]')
    }
  })
})
