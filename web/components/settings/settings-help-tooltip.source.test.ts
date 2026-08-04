import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('设置帮助提示', () => {
  const helperSource = readSource('components/settings/settings-help-tooltip.tsx')
  const sectionSources = [
    readSource('app/settings/_sections/frontend-preferences-section.tsx'),
    readSource('app/settings/_sections/navigation-visibility-section.tsx'),
    readSource('app/settings/_sections/rag-section.tsx'),
  ]

  it('使用共享浮层并处理窄屏碰撞边界', () => {
    expect(helperSource).toContain('<TooltipProvider')
    expect(helperSource).toContain('<TooltipTrigger asChild>')
    expect(helperSource).toContain('aria-label={label}')
    expect(helperSource).toContain('collisionPadding={12}')
    expect(helperSource).toContain('max-w-[min(20rem,calc(100vw-2rem))]')
  })

  it('设置区块不再自绘绝对定位帮助气泡', () => {
    for (const source of sectionSources) {
      expect(source).toContain('SettingsHelpTooltip')
      expect(source).not.toContain('group/help')
      expect(source).not.toContain('group/frontend-local-help')
      expect(source).not.toContain('group/nav-entry-help')
    }
  })

  it('用户提示不暴露检索实现术语', () => {
    const ragSource = sectionSources[2]
    expect(ragSource).not.toContain('hybrid / keyword')
    expect(ragSource).not.toContain('Reranker 会')
    expect(ragSource).not.toContain('chunk 是')
  })
})
