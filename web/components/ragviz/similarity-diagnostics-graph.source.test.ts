import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const graphSource = readFileSync(resolve(__dirname, 'similarity-diagnostics-graph.tsx'), 'utf8')
const catalogSource = readFileSync(resolve(__dirname, '../../i18n/messages/zh-CN/rag.ts'), 'utf8')

describe('相似度诊断图视觉与文案契约', () => {
  it('只在没有节点时显示空状态', () => {
    expect(graphSource).toContain('if (nodes.length === 0)')
    expect(graphSource).not.toContain('nodes.length === 0 || links.length === 0')
    expect(graphSource).toContain('const hasLinks = links.length > 0')
    expect(graphSource).toContain("t('noLinksTitle')")
    expect(graphSource).toContain("t('noLinksDescription')")
  })

  it('使用响应式高度和主题语义色', () => {
    expect(graphSource).toContain('h-[320px]')
    expect(graphSource).toContain('sm:h-[380px]')
    expect(graphSource).toContain('lg:h-[420px]')
    expect(graphSource).toContain("getCssHslColor('--warning'")
    expect(graphSource).toContain("getCssHslColor('--destructive'")
    expect(graphSource).toContain("getCssHslColor('--muted-foreground'")
    expect(graphSource).not.toContain("return '#f59e0b'")
    expect(graphSource).not.toContain("return '#ef4444'")
    expect(graphSource).not.toContain("return '#64748b'")
  })

  it('使用扁平样式和标准字号', () => {
    for (const forbidden of [
      'backdrop-blur',
      'shadow-',
      'rounded-xl',
      'rounded-2xl',
      'rounded-3xl',
      'uppercase',
      'tracking-[',
    ]) {
      expect(graphSource).not.toContain(forbidden)
    }
    expect(graphSource).not.toMatch(/text-\[(?:[0-9]|1[01])(?:\.[0-9]+)?px\]/)
  })

  it('提供可直接上线的中文状态文案', () => {
    expect(catalogSource).toContain("loadingSrMessage: '正在加载相似度诊断图'")
    expect(catalogSource).toContain("noLinksTitle: '当前阈值下未形成关联'")
    expect(catalogSource).not.toContain('Loading embedding diagnostics graph')
  })
})
