'use client'

import { useState, type ReactNode } from 'react'
import Image from 'next/image'
import {
  AlertCircle,
  ArrowRight,
  Copy,
  Loader2,
  Lock,
  Mail,
  User,
} from 'lucide-react'

import { FullScreenFrame } from '@/components/full-screen-frame'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from '@/i18n/navigation'
import { authApi } from '@/lib/api'
import {
  formatRequestId,
  toApiErrorInfo,
  type ApiErrorInfo,
} from '@/lib/api-errors'
import { setAuthSession } from '@/lib/auth-storage'
import { BRAND_CONFIG } from '@/lib/brand'
import { startOidcLogin } from '@/lib/oidc'
import { getOidcPublicProvidersFromEnv } from '@/lib/oidc-providers'
import { cn, detachPromise } from '@/lib/utils'

type Mode = 'login' | 'register'

function getAuthSsoProviderLabel(provider?: {
  id?: string
  name?: string
}): string {
  const providerName = provider?.name || provider?.id
  return providerName ? `使用 ${providerName} 登录` : '使用企业账号登录'
}

function getAuthSubmitContent(isSubmitting: boolean, mode: Mode): ReactNode {
  if (isSubmitting) {
    return (
      <>
        <Loader2
          className="size-4 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        正在处理…
      </>
    )
  }

  return (
    <>
      {mode === 'login' ? '登录' : '创建管理员'}
      <ArrowRight className="size-4" aria-hidden="true" />
    </>
  )
}

function toAuthPageError(err: unknown, mode: Mode): ApiErrorInfo {
  const info = toApiErrorInfo(err, '请求失败，请稍后重试')
  if (mode !== 'register') return info

  if (info.status === 403) {
    return {
      ...info,
      message: '初始化密钥无效或缺失，请核对后重试。',
    }
  }

  if (info.status === 409) {
    return {
      ...info,
      message: '首次设置已关闭。请使用已有账号登录，或联系管理员开通账号。',
    }
  }

  return info
}

export default function AuthPage() {
  const router = useRouter()
  const oidcProviders = getOidcPublicProvidersFromEnv()
  const oidcEnabled = oidcProviders.length > 0
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [bootstrapToken, setBootstrapToken] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [ssoProviderWorkingId, setSsoProviderWorkingId] = useState<
    string | null
  >(null)
  const [error, setError] = useState<ApiErrorInfo | null>(null)
  const isSsoSubmitting = ssoProviderWorkingId !== null

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode)
    setError(null)
  }

  const handleSso = async (providerId: string) => {
    setError(null)
    setSsoProviderWorkingId(providerId)
    try {
      await startOidcLogin({ providerId, returnTo: '/' })
    } catch (err: unknown) {
      setError(toApiErrorInfo(err, '企业账号登录失败，请稍后重试'))
      setSsoProviderWorkingId(null)
    }
  }

  const handleSubmit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (mode === 'register' && password !== confirmPassword) {
      setError({ message: '两次输入的密码不一致' })
      return
    }

    setIsSubmitting(true)
    try {
      const response =
        mode === 'login'
          ? await authApi.login({ identifier: identifier.trim(), password })
          : await authApi.register({
              email: email.trim(),
              username: username.trim(),
              password,
              bootstrapToken: bootstrapToken.trim() || undefined,
            })
      setAuthSession({ token: response.token, user: response.user })
      router.push('/')
    } catch (err: unknown) {
      setError(toAuthPageError(err, mode))
    } finally {
      setIsSubmitting(false)
    }
  }

  let ssoSectionContent: ReactNode = null
  if (oidcProviders.length > 1) {
    ssoSectionContent = (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">选择企业登录方式</p>
        {oidcProviders.map((provider) => {
          const label = getAuthSsoProviderLabel(provider)
          const working = ssoProviderWorkingId === provider.id
          return (
            <Button
              key={provider.id}
              type="button"
              variant="outline"
              className="h-10 w-full justify-between rounded-md"
              disabled={isSubmitting || isSsoSubmitting}
              onClick={() => detachPromise(handleSso(provider.id))}
            >
              <span className="inline-flex items-center gap-2">
                {working ? (
                  <Loader2
                    className="size-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : null}
                {working ? '正在跳转…' : label}
              </span>
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          )
        })}
      </div>
    )
  } else if (oidcProviders.length === 1) {
    const provider = oidcProviders[0]
    ssoSectionContent = (
      <Button
        type="button"
        variant="outline"
        className="h-10 w-full rounded-md"
        disabled={isSubmitting || isSsoSubmitting}
        onClick={() => detachPromise(handleSso(provider?.id || 'default'))}
      >
        {isSsoSubmitting ? (
          <>
            <Loader2
              className="size-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            正在跳转…
          </>
        ) : (
          <>
            {getAuthSsoProviderLabel(provider)}
            <ArrowRight className="size-4" aria-hidden="true" />
          </>
        )}
      </Button>
    )
  }

  return (
    <FullScreenFrame
      showBackground={false}
      className="w-full bg-muted/30"
      mainClassName="px-4 py-8 sm:py-12"
    >
      <div className="w-full max-w-[420px]">
        <header className="mb-6 flex flex-col items-center text-center">
          <Image
            src={BRAND_CONFIG.wordmarkSrc}
            alt={BRAND_CONFIG.standardName}
            width={300}
            height={80}
            priority
            unoptimized
            className="h-12 w-auto max-w-[220px] select-none object-contain"
          />
          <h1 id="auth-title" className="mt-4 text-2xl font-semibold text-foreground">
            {BRAND_CONFIG.name}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            登录后可继续访问企业知识、引用与处理记录。
          </p>
        </header>

        <section
          aria-labelledby="auth-title"
          className="rounded-md border border-border bg-card p-5 sm:p-6"
        >
          {oidcEnabled ? (
            <div className="mb-6 space-y-4">
              {ssoSectionContent}
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <div className="h-px flex-1 bg-border" />
                <span>或</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            </div>
          ) : null}

          <div
            className="mb-6 grid grid-cols-2 gap-1 rounded-md bg-muted p-1"
            aria-label="登录方式"
          >
            <button
              type="button"
              aria-pressed={mode === 'login'}
              className={cn(
                'focus-ring h-9 rounded-md text-sm font-medium transition-colors motion-reduce:transition-none',
                mode === 'login'
                  ? 'bg-background text-foreground'
                  : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
              )}
              onClick={() => switchMode('login')}
            >
              登录
            </button>
            <button
              type="button"
              aria-pressed={mode === 'register'}
              className={cn(
                'focus-ring h-9 rounded-md text-sm font-medium transition-colors motion-reduce:transition-none',
                mode === 'register'
                  ? 'bg-background text-foreground'
                  : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
              )}
              onClick={() => switchMode('register')}
            >
              首次设置
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' ? (
              <div className="space-y-4">
                <p className="text-sm leading-6 text-muted-foreground">
                  仅用于尚未创建管理员的系统。已有管理员时，请联系{' '}
                  <a
                    href={BRAND_CONFIG.contactHref}
                    className="focus-ring rounded-sm font-medium text-foreground underline underline-offset-4"
                  >
                    {BRAND_CONFIG.contactEmail}
                  </a>
                  {' '}开通账号。
                </p>
                <AuthInputField
                  id="email"
                  label="邮箱地址"
                  type="email"
                  placeholder="name@example.com"
                  autoComplete="email"
                  icon={Mail}
                  value={email}
                  onChange={setEmail}
                />
                <AuthInputField
                  id="username"
                  label="用户名"
                  placeholder="设置用户名"
                  autoComplete="username"
                  icon={User}
                  value={username}
                  onChange={setUsername}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="bootstrapToken" className="text-sm">
                    初始化密钥（可选）
                  </Label>
                  <Input
                    id="bootstrapToken"
                    type="password"
                    placeholder="输入系统管理员提供的密钥"
                    className="h-10 rounded-md bg-background"
                    value={bootstrapToken}
                    onChange={(event) => setBootstrapToken(event.target.value)}
                    autoComplete="off"
                  />
                  <p className="text-sm leading-5 text-muted-foreground">
                    仅在首次创建管理员时需要。
                  </p>
                </div>
              </div>
            ) : (
              <AuthInputField
                id="identifier"
                label="账号"
                placeholder="输入邮箱或用户名"
                autoComplete="username"
                icon={User}
                value={identifier}
                onChange={setIdentifier}
              />
            )}

            <AuthInputField
              id="password"
              label={mode === 'login' ? '密码' : '设置密码'}
              type="password"
              placeholder="输入密码"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              icon={Lock}
              value={password}
              onChange={setPassword}
            />

            {mode === 'register' ? (
              <AuthInputField
                id="confirmPassword"
                label="确认密码"
                type="password"
                placeholder="再次输入密码"
                autoComplete="new-password"
                icon={Lock}
                value={confirmPassword}
                onChange={setConfirmPassword}
              />
            ) : null}

            {error ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/5 p-3"
              >
                <AlertCircle
                  className="mt-0.5 size-4 shrink-0 text-destructive"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-5 text-destructive">
                    {error.message}
                  </p>
                  {error.requestId ? (
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                        请求编号：{formatRequestId(error.requestId)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0 rounded-md text-muted-foreground hover:text-foreground"
                        aria-label="复制请求编号"
                        title="复制请求编号"
                        onClick={() =>
                          navigator.clipboard?.writeText?.(error.requestId || '')
                        }
                      >
                        <Copy className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <Button
              type="submit"
              className="h-10 w-full rounded-md font-medium"
              disabled={isSubmitting || isSsoSubmitting}
            >
              {getAuthSubmitContent(isSubmitting, mode)}
            </Button>
          </form>
        </section>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          无法登录？请联系{' '}
          <a
            href={BRAND_CONFIG.contactHref}
            className="focus-ring rounded-sm font-medium text-foreground underline underline-offset-4"
          >
            {BRAND_CONFIG.contactEmail}
          </a>
        </p>
      </div>
    </FullScreenFrame>
  )
}

function AuthInputField({
  id,
  label,
  type = 'text',
  placeholder,
  autoComplete,
  icon: Icon,
  value,
  onChange,
}: Readonly<{
  id: string
  label: string
  type?: 'text' | 'email' | 'password'
  placeholder: string
  autoComplete: string
  icon: typeof User
  value: string
  onChange: (value: string) => void
}>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      <div className="relative">
        <Icon
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id={id}
          type={type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="h-10 rounded-md bg-background pl-10"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
        />
      </div>
    </div>
  )
}
