import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const snapshotRoot = __dirname
const pageSource = readFileSync(
  resolve(snapshotRoot, 'kg-snapshots-page.tsx'),
  'utf8'
)
const surfaceSource = [
  'constants.ts',
  'snapshot-graph.tsx',
  'components/shared.tsx',
  'components/json-code-pane.tsx',
  'components/snapshot-audit-panel.tsx',
  'components/snapshot-diff-view.tsx',
  'components/snapshot-exact-drift-panel.tsx',
  'components/snapshot-graph-canvas.tsx',
  'components/snapshot-node-details-rail.tsx',
  'components/snapshot-studio-toolbar.tsx',
]
  .map((file) => readFileSync(resolve(snapshotRoot, file), 'utf8'))
  .join('\n')

describe('图谱快照扁平界面契约', () => {
  it('窄屏使用纵向滚动，桌面恢复双栏工作区', () => {
    expect(pageSource).toContain(
      'flex-col overflow-y-auto lg:flex-row lg:overflow-hidden'
    )
    expect(pageSource).toContain('lg:w-[280px]')
    expect(pageSource).toContain('min-h-[620px]')
  })

  it('主要界面不使用旧式装饰和过小字号', () => {
    expect(surfaceSource).not.toContain('bg-[linear-gradient')
    expect(surfaceSource).not.toContain('bg-[radial-gradient')
    expect(surfaceSource).not.toContain('backdrop-blur')
    expect(surfaceSource).not.toContain('rounded-2xl')
    expect(surfaceSource).not.toContain('rounded-xl')
    expect(surfaceSource).not.toContain('text-[10')
    expect(surfaceSource).not.toContain('text-[11')
  })

  it('用户操作使用清晰中文', () => {
    expect(surfaceSource).toContain('比较差异')
    expect(surfaceSource).toContain("flat: '不变'")
    expect(surfaceSource).toContain("negative: '减少'")
    expect(surfaceSource).toContain("positive: '增加'")
    expect(surfaceSource).not.toContain('bounded diff')
    expect(surfaceSource).not.toContain('Type Drift')
    expect(surfaceSource).not.toContain('Delta Distribution')
  })

  it('保留快照与实时图谱接口调用', () => {
    expect(pageSource).toContain('kgApi.exportSnapshot')
    expect(pageSource).toContain('kgApi.diffSnapshots')
    expect(pageSource).toContain('kgApi.compareSnapshots')
    expect(pageSource).toContain('kgApi.getGraph')
  })
})
