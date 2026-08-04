import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workbenchSource = readFileSync(resolve(__dirname, 'evidence-workbench.tsx'), 'utf8')
const opsSource = readFileSync(resolve(__dirname, '../evidence/evidence-ops-panel.tsx'), 'utf8')
const messagesSource = readFileSync(resolve(__dirname, '../../i18n/messages/zh-CN/rag.ts'), 'utf8')

describe('证据验证界面契约', () => {
  it('将证据检索作为主流程，并把维护操作放入高级区', () => {
    expect(workbenchSource).toContain('验证问题')
    expect(workbenchSource).toContain('找到可用证据')
    expect(workbenchSource).toContain('建议拒绝回答')
    expect(workbenchSource).toContain('查看本次检索信息')
    expect(opsSource).toContain('<details')
    expect(opsSource).toContain('高级维护')
    expect(opsSource).toContain('请求数据（JSON）')
  })

  it('导出结果绑定实际请求上下文', () => {
    expect(workbenchSource).toContain('setResultContext(requestContext)')
    expect(workbenchSource).toContain('query: resultContext.query')
    expect(workbenchSource).toContain('dataset_id: resultContext.datasetId || null')
    expect(workbenchSource).toContain('retrieval_profile: resultContext.profile')
  })

  it('使用用户可理解的中文文案', () => {
    expect(messagesSource).toContain("query: '需要验证的问题'")
    expect(messagesSource).toContain("profile: '检索强度'")
    expect(messagesSource).toContain("scoreLabel: '相关度'")
    expect(messagesSource).not.toContain("query: 'Query'")
    expect(messagesSource).not.toContain("profile: '检索 Profile'")
    expect(messagesSource).not.toContain("fallbackTitle: 'Citation'")
    expect(opsSource).not.toContain('Patch Suite')
    expect(opsSource).not.toContain('Patch Item')
    expect(opsSource).not.toContain('Evidence Capsule')
  })

  it('移除旧式装饰表面和过小文案', () => {
    for (const source of [workbenchSource, opsSource]) {
      expect(source).not.toContain('gradient')
      expect(source).not.toContain('backdrop-blur')
      expect(source).not.toContain('rounded-[')
      expect(source).not.toContain('rounded-xl')
      expect(source).not.toContain('rounded-2xl')
      expect(source).not.toContain('rounded-full')
      expect(source).not.toContain('shadow-[')
      expect(source).not.toContain('shadow-strong')
      expect(source).not.toMatch(/text-\[(?:8|9|10|11)px\]/)
    }
  })
})
