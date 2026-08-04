'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import {
  AuthCallbackStatus,
  type AuthCallbackState,
} from '@/components/auth/auth-callback-status'
import { useRouter } from '@/i18n/navigation'
import { getOidcCallbackErrorMessage } from '@/lib/oidc-callback-errors'
import { completeOidcLogin } from '@/lib/oidc'

export default function OidcCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const ranRef = useRef(false)
  const [status, setStatus] = useState<AuthCallbackState>('working')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    const errorCode = searchParams.get('error')
    if (errorCode) {
      setStatus('error')
      setError(getOidcCallbackErrorMessage(errorCode))
      return
    }

    const code = searchParams.get('code')
    const state = searchParams.get('state')
    if (!code || !state) {
      setStatus('error')
      setError(getOidcCallbackErrorMessage('missing_code_or_state'))
      return
    }

    void (async () => {
      try {
        const { returnTo } = await completeOidcLogin({ code, state })
        setStatus('success')
        router.replace(returnTo || '/')
      } catch (callbackError: unknown) {
        setStatus('error')
        setError(getOidcCallbackErrorMessage(
          callbackError instanceof Error ? callbackError.message : null
        ))
      }
    })()
  }, [router, searchParams])

  return (
    <AuthCallbackStatus
      status={status}
      errorMessage={error}
      onBackToLogin={() => router.replace('/auth')}
    />
  )
}
