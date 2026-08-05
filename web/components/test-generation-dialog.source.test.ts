import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(
  path.join(process.cwd(), 'components/test-generation-dialog.tsx'),
  'utf8'
)

describe('测试问题生成弹窗视觉契约', () => {
  it('使用共享下拉与扁平容器', () => {
    expect(source).toContain('SelectTrigger')
    expect(source).not.toContain('<select')
    expect(source).not.toMatch(/rounded-(?:xl|2xl|3xl)/)
    expect(source).not.toContain('border-2')
    expect(source).not.toContain('bg-gradient')
    expect(source).not.toContain('backdrop-blur')
  })

  it('约束移动端高度、按钮顺序和生成期关闭行为', () => {
    expect(source).toContain('max-h-[calc(100dvh-1rem)]')
    expect(source).toContain('flex-col-reverse')
    expect(source).toContain('closeDisabled={isGenerating}')
    expect(source).toContain('if (isGenerating) event.preventDefault()')
  })
})
