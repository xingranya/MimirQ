import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(__dirname, 'answer-lineage-action.tsx'),
  'utf8'
)

describe('回答血缘弹窗视觉契约', () => {
  it('使用统一弹窗边界和中文文案', () => {
    expect(source).toContain('max-h-[calc(100dvh-1rem)]')
    expect(source).toContain('回答血缘')
    expect(source).toContain('请求编号：')
    expect(source).not.toMatch(/rounded-2xl|shadow-strong|backdrop-blur|linear-gradient/)
    expect(source).not.toContain('Answer Lineage')
    expect(source).not.toContain('Loading...')
  })

  it('保留按请求编号加载血缘的接口', () => {
    expect(source).toContain('lineageApi.getAnswerLineageIfAvailable(requestId)')
    expect(source).toContain('enabled: open && Boolean(requestId)')
  })
})
