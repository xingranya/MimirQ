import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(__dirname, 'industry-rules-workbench.tsx'),
  'utf8'
)

describe('行业规则工作台视觉契约', () => {
  it('使用共享页头和扁平化工作区，不保留旧装饰视觉', () => {
    expect(source).toContain('title="行业规则库"')
    expect(source).toContain('icon={ShieldCheck}')
    expect(source).toContain('density="system-dense"')
    expect(source).toContain("const WORKBENCH_SECTION = 'rounded-lg border")
    expect(source).not.toContain('Ruleset CMS')
    expect(source).not.toContain('linear-gradient')
    expect(source).not.toContain('shadow-[')
    expect(source).not.toContain('rounded-[')
    expect(source).not.toContain('border-b-2')
  })

  it('术语在移动端使用逐条表单，桌面表格保留独立滚动边界', () => {
    expect(source).toContain('data-testid="industry-rules-glossary-mobile"')
    expect(source).toContain('divide-y divide-border rounded-lg border border-border md:hidden')
    expect(source).toContain(
      'hidden flex-1 overflow-x-auto rounded-lg border border-border md:block'
    )
    expect(source).toContain('min-w-[680px] w-full text-left text-sm')
    expect(source).toContain('xl:grid-cols-[minmax(0,1fr)_380px]')
  })

  it('移动端操作栏可换行，字段与按钮保持统一尺寸和中文文案', () => {
    expect(source).toContain('className="flex w-full gap-2 sm:w-auto"')
    expect(source).toContain("'h-9 rounded-md border-border")
    expect(source).toContain('placeholder="触发词，逗号分隔"')
    expect(source).not.toContain('placeholder="Marker，逗号分隔"')
    expect(source).not.toMatch(/text-\[(?:11|13|15|30)px\]/)
  })
})
