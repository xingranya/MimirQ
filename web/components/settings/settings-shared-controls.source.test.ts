import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const switchSource = readFileSync(
  resolve(__dirname, 'settings-switch.tsx'),
  'utf8'
)
const dangerZoneSource = readFileSync(
  resolve(__dirname, 'danger-zone-panel.tsx'),
  'utf8'
)

describe('设置页共享控件', () => {
  it('使用稳定的标准开关尺寸和状态位移', () => {
    expect(switchSource).toContain('h-6 w-11')
    expect(switchSource).toContain('[--switch-translate-checked:1.25rem]')
    expect(switchSource).toContain("data-[switch-state=checked]:bg-primary")
    expect(switchSource).toContain("data-switch-state={checked ? 'checked' : 'unchecked'}")
  })

  it('开关不再内嵌文字、阴影或缩放动画', () => {
    expect(switchSource).not.toContain("before:content-['停用']")
    expect(switchSource).not.toContain("after:content-['启用']")
    expect(switchSource).not.toContain('shadow-[')
    expect(switchSource).not.toContain('scale-[')
  })

  it('高风险面板保留原生展开语义并使用扁平层级', () => {
    expect(dangerZoneSource).toContain('<details')
    expect(dangerZoneSource).toContain('<summary')
    expect(dangerZoneSource).toContain('group-open:rotate-180')
    expect(dangerZoneSource).toContain('rounded-lg border p-0')
    expect(dangerZoneSource).not.toContain('shadow-[')
    expect(dangerZoneSource).not.toMatch(/text-\[(?:9|10|11)(?:\.\d+)?px\]/)
  })
})
