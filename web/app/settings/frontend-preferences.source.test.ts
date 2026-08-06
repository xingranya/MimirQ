import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(__dirname, '_sections/frontend-preferences-section.tsx'),
  'utf8'
)

describe('前端偏好设置视觉契约', () => {
  it('使用线性分区并移除旧卡片装饰', () => {
    expect(source).toContain('space-y-4 border-t border-border py-4')
    expect(source).toContain('details className="group border-y border-border"')
    expect(source).not.toContain('rounded-[16px]')
    expect(source).not.toContain('rounded-[14px]')
    expect(source).not.toContain('bg-card/82')
    expect(source).not.toContain('shadow-sm')
    expect(source).not.toContain('text-[12px]')
  })

  it('保留解析方式、切块策略和管线高级配置', () => {
    expect(source).toContain('<ParserDropdown')
    expect(source).toContain('<ChunkStrategyDropdown')
    expect(source).toContain('<PipelineOptionsPanel compact />')
    expect(source).toContain('查看前端偏好保存说明')
  })

  it('为双列控件保留最小宽度，避免标题和说明被挤压', () => {
    expect(source).toContain(
      'md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'
    )
    expect(source.match(/className="min-w-0 space-y-2"/g)).toHaveLength(2)
  })
})
