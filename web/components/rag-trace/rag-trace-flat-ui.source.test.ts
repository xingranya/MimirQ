import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ragTraceRoot = __dirname
const panelSource = readFileSync(resolve(ragTraceRoot, 'rag-trace-panel.tsx'), 'utf8')
const dialogSource = readFileSync(resolve(ragTraceRoot, 'rag-trace-dialog.tsx'), 'utf8')
const catalogSource = readFileSync(resolve(ragTraceRoot, '../../i18n/messages/zh-CN/rag.ts'), 'utf8')
const surfaceSource = [panelSource, dialogSource].join('\n')

describe('RAG 追踪工作区界面契约', () => {
  it('使用扁平样式和统一字号', () => {
    expect(surfaceSource).not.toContain('bg-[linear-gradient')
    expect(surfaceSource).not.toContain('bg-[radial-gradient')
    expect(surfaceSource).not.toContain('backdrop-blur')
    expect(surfaceSource).not.toContain('rounded-2xl')
    expect(surfaceSource).not.toContain('rounded-xl')
    expect(surfaceSource).not.toContain('shadow-soft')
    expect(surfaceSource).not.toContain('text-[10')
    expect(surfaceSource).not.toContain('text-[11')
  })

  it('在中等视口保持单栏，并让移动端对话框独立滚动', () => {
    expect(panelSource).toContain('xl:grid-cols-[300px,minmax(0,1fr)]')
    expect(panelSource).toContain('xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]')
    expect(dialogSource).toContain('h-[calc(100dvh-1rem)]')
    expect(dialogSource).toContain('min-h-0 flex-1 overflow-y-auto')
  })

  it('面向用户的状态使用自然中文', () => {
    expect(panelSource).toContain("return '配置不同'")
    expect(panelSource).toContain('当前通道：')
    expect(panelSource).toContain('文档级证据')
    expect(panelSource).toContain('aria-label="打开证据"')
    expect(catalogSource).toContain("metricsUnavailable: '当前阶段没有额外指标，可继续查看下方的检索通道和证据。'")
    expect(surfaceSource).not.toContain('cfg: ')
    expect(surfaceSource).not.toContain('hits · focus=')
    expect(surfaceSource).not.toContain('document-level evidence')
    expect(surfaceSource).not.toContain('Pipeline timeline keyboard navigation')
  })

  it('保留追踪、对比、诊断包和证据定位能力', () => {
    expect(panelSource).toContain('chatApi.getRagTraces')
    expect(panelSource).toContain('observabilityApi.getRagTraceBundleDiff')
    expect(panelSource).toContain('observabilityApi.getRagTraceBundle')
    expect(panelSource).toContain('openDocument(')
  })
})
