import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const indicatorSource = fs.readFileSync(
  path.resolve(__dirname, 'graph-loading-indicator.tsx'),
  'utf8'
)
const forceGraphSource = fs.readFileSync(
  path.resolve(__dirname, 'force-graph-3d.tsx'),
  'utf8'
)

describe('图谱加载状态视觉契约', () => {
  it('使用扁平状态图标和中文默认文案', () => {
    expect(indicatorSource).toContain("srMessage = '正在加载图谱'")
    expect(indicatorSource).toContain('LoaderCircle')
    expect(indicatorSource).toContain('motion-reduce:animate-none')
    expect(indicatorSource).not.toContain('linear-gradient')
    expect(indicatorSource).not.toContain('radial-gradient')
    expect(indicatorSource).not.toContain('graph-loader-orb')
    expect(indicatorSource).not.toContain('text-[11px]')
  })

  it('三维图谱加载入口不再使用大圆角和阴影', () => {
    expect(forceGraphSource).toContain('srMessage="正在加载 3D 图谱引擎"')
    expect(forceGraphSource).not.toContain('rounded-2xl')
    expect(forceGraphSource).not.toContain('shadow-soft')
  })
})
