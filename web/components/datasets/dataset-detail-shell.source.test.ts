import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const shellSource = readFileSync(
  resolve(__dirname, 'dataset-detail-shell.tsx'),
  'utf8'
)
const evidencePageSource = readFileSync(
  resolve(__dirname, '../../app/datasets/[id]/evidence/page.tsx'),
  'utf8'
)

describe('数据集详情共享壳层', () => {
  it('桌面只展示五个一级入口并将低频能力收入更多菜单', () => {
    expect(shellSource).toContain('const PRIMARY_SECTIONS')
    expect(shellSource).toContain('const SECONDARY_SECTIONS')
    expect(shellSource).toContain("{ value: 'health', label: '运行状态'")
    expect(shellSource).toContain("{ value: 'tables', label: '表格资产'")
    expect(shellSource).toContain("{ value: 'workflow', label: '处理工作流'")
    expect(shellSource).toContain("{ value: 'kg', label: '知识图谱'")
    expect(shellSource).toContain('<DropdownMenu>')
  })

  it('移动端提供单一功能选择器并保持客户端路由', () => {
    expect(shellSource).toContain('aria-label="选择数据集功能"')
    expect(shellSource).toContain('className="min-w-0 flex-1 md:hidden"')
    expect(shellSource).toContain('router.push(')
    expect(shellSource).toContain('encodeURIComponent(datasetId)')
  })

  it('共享壳层使用扁平表面且证据页已完成迁移', () => {
    expect(shellSource).not.toContain('gradient')
    expect(shellSource).not.toContain('backdrop-blur')
    expect(shellSource).not.toContain('rounded-[')
    expect(shellSource).not.toContain('shadow-[')
    expect(evidencePageSource).toContain('<DatasetDetailShell')
    expect(evidencePageSource).toContain('activeSection="evidence"')
    expect(evidencePageSource).not.toContain('<PageScaffold')
  })
})
