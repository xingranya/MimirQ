import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workbenchSource = readFileSync(resolve(__dirname, 'similarity-workbench.tsx'), 'utf8')
const displaySource = readFileSync(resolve(__dirname, 'similarity/display-components.tsx'), 'utf8')
const controlsSource = readFileSync(resolve(__dirname, 'similarity/form-controls.tsx'), 'utf8')
const panelsSource = readFileSync(resolve(__dirname, 'similarity/panels.tsx'), 'utf8')
const routeSource = readFileSync(resolve(__dirname, '../../app/knowledge/similarity/page.tsx'), 'utf8')

describe('相似度工作台视觉契约', () => {
  it('主工作区与侧栏使用扁平表面', () => {
    expect(workbenchSource).toContain('overflow-hidden bg-background')
    expect(workbenchSource).toContain('border-r border-border bg-card')
    expect(workbenchSource).toContain('border-l border-border bg-card')
    expect(workbenchSource).not.toContain('backdrop-blur')
    expect(workbenchSource).not.toContain('radial-gradient')
    expect(workbenchSource).not.toContain('rounded-[')
    expect(workbenchSource).not.toMatch(/rounded-(?:xl|2xl|3xl)/)
  })

  it('空状态和内容面板不使用装饰性渐变与阴影', () => {
    for (const source of [displaySource, controlsSource, panelsSource]) {
      expect(source).not.toContain('backdrop-blur')
      expect(source).not.toContain('linear-gradient')
      expect(source).not.toContain('shadow-[')
      expect(source).not.toContain('rounded-[')
      expect(source).not.toMatch(/rounded-(?:xl|2xl|3xl)/)
    }
    expect(displaySource).toContain('暂无相似度矩阵')
  })

  it('加载状态和辅助标签使用中文', () => {
    expect(routeSource).toContain('正在加载相似度分析')
    expect(routeSource).not.toContain('Similarity Workbench')
    expect(workbenchSource).not.toContain('Resize left split')
    expect(workbenchSource).not.toContain('Resize right split')
    expect(workbenchSource).not.toContain('Matrix Setup')
  })
})
