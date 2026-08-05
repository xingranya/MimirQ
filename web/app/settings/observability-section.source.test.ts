import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(
  path.resolve(__dirname, '_sections/observability-section.tsx'),
  'utf8'
)

describe('可观测性配置视觉契约', () => {
  it('使用扁平列表和对外文案', () => {
    expect(source).toContain('divide-y divide-border')
    expect(source).not.toContain('rounded-lg')
    expect(source).not.toContain('text-[10px]')
    expect(source).not.toContain('logs/rag_metrics.jsonl')
    expect(source).not.toContain('观测与调试')
    expect(source).toContain('记录与诊断')
  })

  it('附加字段随主开关显示且数值与后端边界一致', () => {
    expect(source).toContain('checked && children')
    expect(source).toContain('Math.max(0, Math.min(5000, parsed))')
    expect(source).toContain('问题和回答原文会保存在服务器日志中')
  })
})
