'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { ArrowRight, Loader2, Lock, User } from 'lucide-react'

import { FullScreenFrame } from '@/components/full-screen-frame'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Link, useRouter } from '@/i18n/navigation'
import { authApi } from '@/lib/api'
import { toApiErrorInfo } from '@/lib/api-errors'
import { setAuthSession } from '@/lib/auth-storage'
import { BRAND_CONFIG } from '@/lib/brand'

export default function TenantInvitationPage() {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [isReady, setIsReady] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(globalThis.location.hash.replace(/^#/, ''))
    setToken(String(params.get('token') || '').trim())
    setIsReady(true)
  }, [])

  async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (!token) {
      setError('邀请链接无效，请联系管理员重新生成')
      return
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await authApi.acceptTenantInvitation({
        token,
        username: username.trim(),
        password,
      })
      setAuthSession({ token: response.token, user: response.user })
      globalThis.history.replaceState(null, '', globalThis.location.pathname)
      router.push('/')
    } catch (caught: unknown) {
      setError(toApiErrorInfo(caught, '接受邀请失败，请联系管理员重新生成邀请链接').message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const invalidInvitation = isReady && !token

  return (
    <FullScreenFrame className="w-full overflow-y-auto">
      <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-5 py-10">
        <div className="mb-7 flex flex-col items-center text-center">
          <Image
            src={BRAND_CONFIG.wordmarkSrc}
            alt={BRAND_CONFIG.standardName}
            width={300}
            height={80}
            priority
            unoptimized
            className="h-10 w-auto max-w-[220px] object-contain"
          />
          <h1 className="mt-5 text-2xl font-semibold text-foreground">加入见外传媒知识库</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            设置你的账号信息，完成后即可进入公司知识库。
          </p>
        </div>

        <section className="rounded-lg border border-border bg-card p-6">
          {invalidInvitation ? (
            <div role="alert" className="text-center">
              <h2 className="text-base font-semibold text-foreground">邀请链接无效</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                链接缺少邀请凭证，请联系管理员重新生成。
              </p>
              <Button asChild variant="outline" className="mt-5 rounded-md">
                <Link href="/auth">返回登录</Link>
              </Button>
            </div>
          ) : (
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="invitation-username">用户名</Label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="invitation-username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    minLength={3}
                    maxLength={64}
                    autoComplete="username"
                    placeholder="输入你的用户名"
                    className="h-10 rounded-md pl-9"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="invitation-password">密码</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="invitation-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={8}
                    maxLength={72}
                    autoComplete="new-password"
                    placeholder="至少 8 个字符"
                    className="h-10 rounded-md pl-9"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="invitation-confirm-password">确认密码</Label>
                <Input
                  id="invitation-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
                  placeholder="再次输入密码"
                  className="h-10 rounded-md"
                  required
                />
              </div>

              {error ? (
                <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              <Button type="submit" className="h-10 w-full rounded-md" disabled={!isReady || isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="mr-2 size-4 animate-spin motion-reduce:animate-none" />
                ) : null}
                {isSubmitting ? '正在加入' : '接受邀请'}
                {!isSubmitting ? <ArrowRight className="ml-2 size-4" /> : null}
              </Button>
            </form>
          )}
        </section>
      </main>
    </FullScreenFrame>
  )
}
