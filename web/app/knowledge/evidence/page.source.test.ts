// Source contract check only; this is not behavior coverage.
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('证据验证页面', () => {
  it('在中文加载状态后按需加载证据验证工具', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'page.tsx'), 'utf8')

    expect(src).toContain("import dynamic from 'next/dynamic'")
    expect(src).toContain("import { PageLoading } from '@/components/ui/page-loading'")
    expect(src).toContain("const EvidenceWorkbench = dynamic(() => import('@/components/ragviz/evidence-workbench').then((mod) => mod.EvidenceWorkbench), {")
    expect(src).toContain('ssr: false')
    expect(src).toContain('正在加载证据验证工具…')
    expect(src).toContain('title="证据验证"')
    expect(src).toContain('此处只验证检索结果，不生成回答。')
    expect(src).not.toContain("import { EvidenceWorkbench } from '@/components/ragviz/evidence-workbench'")
    expect(src).not.toContain('Evidence Workbench')
    expect(src).not.toContain('检索-only')
  })
})
