import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(
  path.resolve(__dirname, '_sections/system-status-section.tsx'),
  'utf8'
)

describe('系统状态区视觉契约', () => {
  it('状态说明可换行且解析器明细默认折叠', () => {
    expect(source).toContain('<details className="group')
    expect(source).toContain('break-words text-xs leading-5')
    expect(source).not.toContain('truncate text-[11px]')
    expect(source).not.toContain('rounded-full')
    expect(source).not.toContain('text-[11px]')
  })

  it('模型使用配置语义，数据库使用连接语义', () => {
    expect(source).toContain('positiveLabel="已连接"')
    expect(source).toContain('positiveLabel="已配置"')
    expect(source).toMatch(/info\.enabled\s+\? '环境不可用'/)
  })
})
