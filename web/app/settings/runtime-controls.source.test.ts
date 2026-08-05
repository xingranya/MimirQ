import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, '_sections/runtime-controls-section.tsx'), 'utf8')

describe('运行控制设置视觉与字段契约', () => {
  it('使用线性分区和统一控件尺寸', () => {
    expect(source).toContain('grid border-t border-border xl:grid-cols-2')
    expect(source).toContain("const RUNTIME_INPUT = 'h-9 rounded-md border-border bg-background text-sm'")
    expect(source).not.toContain('shadow-')
    expect(source).not.toContain('rounded-[16px]')
    expect(source).not.toContain('rounded-xl')
    expect(source).not.toContain('text-[10px]')
    expect(source).not.toContain('text-[12px]')
  })

  it('为数字和文本配置提供关联标签', () => {
    for (const id of [
      'runtime-heartbeat-sec',
      'runtime-cache-ttl',
      'runtime-cache-max-bytes',
      'runtime-pii-mask',
      'runtime-pii-holdback',
    ]) {
      expect(source).toContain(`htmlFor={id}`)
      expect(source).toContain(`id="${id}"`)
    }
  })

  it('保留高影响配置折叠和四类更新入口', () => {
    expect(source).toContain('<DangerZonePanel')
    expect(source).toContain('updateChat({')
    expect(source).toContain('updateCache({')
    expect(source).toContain('updateSafety({')
    expect(source).toContain('updateLangGraph({ use_subgraphs: !isSubgraphEnabled })')
  })
})
