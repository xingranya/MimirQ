import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, 'theme-customizer.tsx'), 'utf8')
const messages = readFileSync(
  resolve(__dirname, '../i18n/messages/zh-CN/common.ts'),
  'utf8'
)

describe('外观定制面板视觉与行为契约', () => {
  it('使用扁平选项和稳定的移动端宽度', () => {
    expect(source).not.toMatch(
      /rounded-(?:xl|2xl|3xl)|backdrop-blur|shadow-(?:sm|lg|inner)|hover:-translate/
    )
    expect(source).toContain('w-[min(20rem,calc(100vw-2rem))]')
    expect(source).toContain("'rounded-md border px-3 py-3 text-left")
  })

  it('背景、主色和明暗模式都提供可读选中状态', () => {
    expect(source).toContain('aria-pressed={selected}')
    expect(source).toContain('aria-pressed={colorOverride === preset.value}')
    expect(source).toContain("value: 'system'")
    expect(source).toContain("setTheme('system')")
  })

  it('保留主题持久化链路并使用自然中文说明', () => {
    expect(source).toContain('persistThemeAppearance(surfaceTheme, colorOverride)')
    expect(source).toContain('notifyThemeAppearanceChanged()')
    expect(messages).toContain('选择背景、主色和明暗模式')
    expect(messages).not.toContain('轻柔光晕')
  })
})
