import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const statusSource = readFileSync(resolve(__dirname, 'auth-callback-status.tsx'), 'utf8')
const oidcSource = readFileSync(resolve(__dirname, '../../app/auth/oidc/callback/page.tsx'), 'utf8')
const samlSource = readFileSync(resolve(__dirname, '../../app/auth/saml/callback/page.tsx'), 'utf8')

describe('单点登录回调状态界面', () => {
  it('两种协议复用同一个品牌状态组件', () => {
    expect(oidcSource).toContain('<AuthCallbackStatus')
    expect(samlSource).toContain('<AuthCallbackStatus')
    expect(statusSource).toContain('src={BRAND_CONFIG.wordmarkSrc}')
    expect(statusSource).toContain('width={300}')
    expect(statusSource).toContain('height={80}')
  })

  it('提供中文处理、成功、失败和返回登录状态', () => {
    expect(statusSource).toContain('正在完成单点登录')
    expect(statusSource).toContain('登录成功')
    expect(statusSource).toContain('无法完成单点登录')
    expect(statusSource).toContain('返回登录')
    expect(statusSource).toContain("role={status === 'error' ? 'alert' : 'status'}")
  })

  it('使用扁平表面和窄屏可用的操作按钮', () => {
    expect(statusSource).toContain('w-full sm:w-auto')
    expect(statusSource).not.toMatch(/rounded-(?:xl|2xl|3xl|full)/)
    expect(statusSource).not.toContain('shadow-')
    expect(statusSource).not.toContain('backdrop-blur')
    expect(statusSource).not.toContain('gradient')
    expect(oidcSource).not.toContain('error_description')
  })
})
