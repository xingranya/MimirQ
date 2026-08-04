'use client'

import { useEffect, useRef, useState } from 'react'

import {
  AuthCallbackStatus,
  type AuthCallbackState,
} from '@/components/auth/auth-callback-status'
import { useRouter } from '@/i18n/navigation'
import { setAuthSession } from '@/lib/auth-storage'
import { consumeSamlBridgeState, getSamlCallbackErrorMessage } from '@/lib/saml-session'

export default function SamlCallbackPage() {
  const router = useRouter()
  const ranRef = useRef(false)
  const [status, setStatus] = useState<AuthCallbackState>('working')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    const routedError = new URLSearchParams(window.location.search).get('error')?.trim()
    if (routedError) {
      setStatus('error')
      setError(getSamlCallbackErrorMessage(routedError))
      return
    }

    void (async () => {
      try {
        const bridgeState = await consumeSamlBridgeState()
        if (!bridgeState) {
          setStatus('error')
          setError('登录会话已失效，请返回登录页重新开始。')
          return
        }

        if (bridgeState.kind === 'error') {
          setStatus('error')
          setError(getSamlCallbackErrorMessage(bridgeState.error))
          return
        }

        setAuthSession(bridgeState.session)
        setStatus('success')
        router.replace(bridgeState.returnTo || '/')
      } catch {
        setStatus('error')
        setError('无法建立登录会话，请返回登录页重试。')
      }
    })()
  }, [router])

  return (
    <AuthCallbackStatus
      status={status}
      errorMessage={error}
      onBackToLogin={() => router.replace('/auth')}
    />
  )
}
