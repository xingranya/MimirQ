import { describe, expect, it } from 'vitest'

import { getOidcCallbackErrorMessage } from './oidc-callback-errors'

describe('OIDC 回调错误映射', () => {
  it('映射身份提供方拒绝和会话失效', () => {
    expect(getOidcCallbackErrorMessage('access_denied')).toContain('身份提供方拒绝')
    expect(getOidcCallbackErrorMessage('missing_oidc_transaction')).toContain('登录会话已失效')
  })

  it('网络与发现错误提示服务暂不可用', () => {
    expect(getOidcCallbackErrorMessage('oidc_discovery_failed_503')).toContain('暂时不可用')
    expect(getOidcCallbackErrorMessage('Failed to fetch')).toContain('暂时不可用')
  })

  it('不回显未知错误详情', () => {
    const message = getOidcCallbackErrorMessage('provider debug stack trace')
    expect(message).toBe('单点登录失败，请返回登录页重试。')
    expect(message).not.toContain('debug stack trace')
  })
})
