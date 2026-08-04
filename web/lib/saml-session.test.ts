import { afterEach, describe, expect, it, vi } from 'vitest'

import { consumeSamlBridgeState, getSamlCallbackErrorMessage } from './saml-session'

describe('getSamlCallbackErrorMessage', () => {
  it('未知错误使用安全中文兜底', () => {
    expect(getSamlCallbackErrorMessage('debug stack trace')).toBe('单点登录失败，请返回登录页重试。')
  })

  it('已映射的安全文案可以重复传入', () => {
    expect(getSamlCallbackErrorMessage('身份提供方返回了无效的登录响应。')).toBe(
      '身份提供方返回了无效的登录响应。'
    )
  })
})

describe('consumeSamlBridgeState', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('不回显任意后端错误详情', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          { detail: 'backend stack trace' },
          { status: 500 }
        )
      )
    )

    await expect(consumeSamlBridgeState()).resolves.toEqual({
      kind: 'error',
      error: '单点登录失败，请返回登录页重试。',
    })
  })
})
