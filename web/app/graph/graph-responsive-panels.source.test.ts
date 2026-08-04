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
  const canvasSource = componentSource('graph-canvas.tsx')
  const controlsSource = componentSource('graph-floating-controls.tsx')
  const legendSource = fs.readFileSync(
    path.resolve(__dirname, '../../components/graph/graph-legend.tsx'),
    'utf8'
  )
  const statsSource = fs.readFileSync(
    path.resolve(__dirname, '../../components/graph/graph-stats-bar.tsx'),
    'utf8'
  )

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

  it('语义列表在手机端停靠底部并在打开节点详情前收起', () => {
    expect(canvasSource).toContain(
      "'inset-x-2 bottom-2 md:inset-x-auto md:bottom-auto md:right-4 md:top-20 md:w-72'"
    )
    expect(canvasSource).toContain("'max-h-[min(50dvh,26rem)]")
    expect(canvasSource).toContain("matchMedia('(max-width: 767px)').matches")
    expect(canvasSource).toContain('setIsSemanticListVisible(false)')
    expect(canvasSource).toContain("'flex size-11 items-center justify-center rounded-md")
    expect(canvasSource).not.toContain('onPointerDown')
    expect(canvasSource).not.toContain('cursor-grab')
  })

  it('画布和浮动控件使用扁平视觉与中文操作文案', () => {
    const visualSources = [canvasSource, controlsSource, statsSource]
    for (const source of visualSources) {
      expect(source).not.toContain('linear-gradient')
      expect(source).not.toContain('radial-gradient')
      expect(source).not.toContain('backdrop-blur')
      expect(source).not.toContain('rounded-[')
      expect(source).not.toContain('rounded-xl')
      expect(source).not.toContain('rounded-2xl')
      expect(source).not.toContain('shadow-')
      expect(source).not.toContain('text-[11px]')
    }
    expect(controlsSource).toContain('复制 PNG')
    expect(controlsSource).toContain('复制 SVG')
    expect(controlsSource).not.toContain('Copy PNG')
    expect(controlsSource).not.toContain('Shortest Path')
    expect(legendSource).not.toContain('Directed Edge')
    expect(legendSource).not.toContain('Event Edge')
  })
})
