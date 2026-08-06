import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8')

describe('员工自助注册页源码契约', () => {
  it('区分配置关闭、成员组为空和可注册状态', () => {
    expect(source).toContain('authApi.getSelfRegistrationOptions')
    expect(source).toContain('暂未开放自助注册')
    expect(source).toContain('暂无可选成员组')
    expect(source).toContain('authApi.selfRegister')
  })

  it('保持扁平布局和明确的成员组权限说明', () => {
    expect(source).not.toMatch(/rounded-(?:xl|2xl|3xl|full)/)
    expect(source).not.toContain('shadow-')
    expect(source).not.toContain('gradient')
    expect(source).toContain('注册后可查看管理员分配给该成员组的团队知识库。')
    expect(source).toContain('所属成员组')
  })
})
