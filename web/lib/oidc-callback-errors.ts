const OIDC_CALLBACK_ERROR_MESSAGES = {
  accessDenied: '身份提供方拒绝了登录请求。请确认账号权限后重试。',
  invalidRequest: '登录请求无效，请返回登录页重新开始。',
  invalidSession: '登录会话已失效，请返回登录页重新开始。',
  serviceUnavailable: '单点登录服务暂时不可用，请稍后重试。',
  signInFailed: '单点登录失败，请返回登录页重试。',
} as const

/** 将 OIDC 回调错误转换为安全、可操作的用户文案。 */
export function getOidcCallbackErrorMessage(raw: string | null | undefined): string {
  const value = String(raw || '').trim().toLowerCase()
  if (!value) return OIDC_CALLBACK_ERROR_MESSAGES.signInFailed

  if (value === 'access_denied') return OIDC_CALLBACK_ERROR_MESSAGES.accessDenied
  if (value === 'login_required' || value === 'interaction_required') {
    return OIDC_CALLBACK_ERROR_MESSAGES.invalidSession
  }
  if (
    value === 'invalid_request'
    || value === 'invalid_grant'
    || value === 'invalid_scope'
    || value === 'unauthorized_client'
    || value === 'unsupported_response_type'
    || value === 'missing_code_or_state'
    || value === 'missing_oidc_transaction'
    || value === 'invalid_oidc_transaction'
  ) {
    return value === 'missing_oidc_transaction' || value === 'invalid_oidc_transaction'
      ? OIDC_CALLBACK_ERROR_MESSAGES.invalidSession
      : OIDC_CALLBACK_ERROR_MESSAGES.invalidRequest
  }
  if (
    value === 'temporarily_unavailable'
    || value === 'server_error'
    || value === 'failed to fetch'
    || value.includes('networkerror')
    || value.startsWith('oidc_discovery_')
    || value.startsWith('oidc_token_exchange_failed_')
    || value.startsWith('oidc_server_exchange_failed_')
  ) {
    return OIDC_CALLBACK_ERROR_MESSAGES.serviceUnavailable
  }
  return OIDC_CALLBACK_ERROR_MESSAGES.signInFailed
}
