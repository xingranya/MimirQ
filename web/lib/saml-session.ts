import type { AuthResponse } from '@/types'

export const SAML_BRIDGE_COOKIE_NAME = 'mimirq_saml_bridge'
export const SAML_BRIDGE_COOKIE_PATH = '/api/saml'
export const SAML_BRIDGE_SESSION_API_PATH = '/api/saml/session'
export const SAML_CALLBACK_ERROR_FALLBACK = 'saml_sign_in_failed'

export const SAML_CALLBACK_ERROR_MESSAGES = {
  saml_access_denied: '当前账号没有使用该身份提供方登录的权限。',
  saml_backend_unreachable: '单点登录服务暂时不可用，请稍后重试。',
  saml_invalid_request: '登录请求无效，请返回登录页重新开始。',
  saml_invalid_response: '身份提供方返回了无效的登录响应。',
  saml_invalid_session: '登录会话已失效，请返回登录页重新开始。',
  saml_missing_response: '身份提供方没有返回登录结果。',
  [SAML_CALLBACK_ERROR_FALLBACK]: '单点登录失败，请返回登录页重试。',
} as const

export function getSamlCallbackErrorMessage(raw: string | null | undefined): string {
  const value = String(raw || '').trim()
  if (!value) {
    return SAML_CALLBACK_ERROR_MESSAGES[SAML_CALLBACK_ERROR_FALLBACK]
  }
  const safeMessages = Object.values(SAML_CALLBACK_ERROR_MESSAGES) as readonly string[]
  if (safeMessages.includes(value)) return value
  return SAML_CALLBACK_ERROR_MESSAGES[value as keyof typeof SAML_CALLBACK_ERROR_MESSAGES]
    || SAML_CALLBACK_ERROR_MESSAGES[SAML_CALLBACK_ERROR_FALLBACK]
}

export type SamlBridgeState =
  | {
      kind: 'success'
      session: AuthResponse
      returnTo: string
    }
  | {
      kind: 'error'
      error: string
    }

type SamlBridgeResponse = AuthResponse & {
  return_to?: string
  error?: string
  detail?: string
}

export async function consumeSamlBridgeState(): Promise<SamlBridgeState | null> {
  try {
    const res = await fetch(SAML_BRIDGE_SESSION_API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      cache: 'no-store',
    })
    const payload = (await res.json().catch(() => null)) as SamlBridgeResponse | null

    if (!res.ok) {
      const error = String(payload?.detail || payload?.error || '').trim()
      return error ? { kind: 'error', error: getSamlCallbackErrorMessage(error) } : null
    }
    if (!payload?.user || !payload?.token?.access_token) {
      return null
    }
    return {
      kind: 'success',
      session: {
        user: payload.user,
        token: payload.token,
      },
      returnTo: String(payload.return_to || '/').trim() || '/',
    }
  } catch {
    return null
  }
}
