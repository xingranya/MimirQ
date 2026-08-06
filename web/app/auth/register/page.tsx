'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Image from 'next/image'
import { AlertCircle, ArrowLeft, ArrowRight, Loader2, Lock, Mail, User, Users } from 'lucide-react'

import { AuthFormField } from '@/components/auth/auth-form-field'
import { FullScreenFrame } from '@/components/full-screen-frame'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { QueryErrorState } from '@/components/ui/query-error-state'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Link, useRouter } from '@/i18n/navigation'
import { authApi } from '@/lib/api'
import { toApiErrorInfo } from '@/lib/api-errors'
import { setAuthSession } from '@/lib/auth-storage'
import { BRAND_CONFIG } from '@/lib/brand'
import { queryKeys } from '@/lib/query-keys'

export default function EmployeeRegistrationPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [groupId, setGroupId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const optionsQuery = useQuery({
    queryKey: queryKeys.auth.selfRegistrationOptions,
    queryFn: () => authApi.getSelfRegistrationOptions(),
    retry: false,
  })
  const groups = useMemo(() => optionsQuery.data?.groups || [], [optionsQuery.data?.groups])
  const enabled = optionsQuery.data?.enabled === true
  const selectedGroupId = groups.some((group) => group.id === groupId)
    ? groupId
    : groups.length === 1
      ? groups[0]?.id || ''
      : ''

  async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }
    if (!selectedGroupId) {
      setError('请选择所属成员组')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await authApi.selfRegister({
        email: email.trim(),
        username: username.trim(),
        password,
        group_id: selectedGroupId,
      })
      setAuthSession({ token: response.token, user: response.user })
      router.push('/')
    } catch (caught: unknown) {
      setError(toApiErrorInfo(caught, '注册失败，请检查填写内容后重试。').message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <FullScreenFrame
      showBackground={false}
      className="w-full bg-muted/30"
      mainClassName="px-4 py-8 sm:py-12"
    >
      <div className="w-full max-w-[440px]">
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
          <h1 className="mt-4 text-2xl font-semibold text-foreground">员工自助注册</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            创建个人账号，并选择你所在的成员组。
          </p>
        </header>

        <section className="rounded-md border border-border bg-card p-5 sm:p-6">
          {optionsQuery.isError ? (
            <QueryErrorState
              title="注册信息加载失败"
              description={toApiErrorInfo(optionsQuery.error, '暂时无法读取可选成员组。').message}
              onRetry={() => optionsQuery.refetch()}
              retrying={optionsQuery.isFetching}
            />
          ) : optionsQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              正在读取注册信息…
            </div>
          ) : !enabled ? (
            <div className="text-center">
              <h2 className="text-base font-semibold text-foreground">暂未开放自助注册</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                请联系管理员发送邀请链接，或使用已有账号登录。
              </p>
              <Button asChild variant="outline" className="mt-5 rounded-md">
                <Link href="/auth">
                  <ArrowLeft className="size-4" />
                  返回登录
                </Link>
              </Button>
            </div>
          ) : !groups.length ? (
            <div className="text-center">
              <h2 className="text-base font-semibold text-foreground">暂无可选成员组</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                管理员需要先创建成员组，你才能完成注册。
              </p>
              <Button asChild variant="outline" className="mt-5 rounded-md">
                <Link href="/auth">返回登录</Link>
              </Button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <AuthFormField
                id="employee-email"
                label="公司邮箱"
                type="email"
                placeholder="name@company.com"
                autoComplete="email"
                icon={Mail}
                value={email}
                maxLength={255}
                onChange={setEmail}
              />
              <AuthFormField
                id="employee-username"
                label="用户名"
                placeholder="设置登录用户名"
                autoComplete="username"
                icon={User}
                value={username}
                minLength={3}
                maxLength={64}
                onChange={setUsername}
              />
              <div className="space-y-1.5">
                <Label htmlFor="employee-group" className="text-sm">
                  所属成员组
                </Label>
                <Select value={selectedGroupId} onValueChange={setGroupId}>
                  <SelectTrigger id="employee-group" className="h-10 rounded-md bg-background">
                    <Users className="size-4 text-muted-foreground" aria-hidden="true" />
                    <SelectValue placeholder="选择成员组" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs leading-5 text-muted-foreground">
                  注册后可查看管理员分配给该成员组的团队知识库。
                </p>
              </div>
              <AuthFormField
                id="employee-password"
                label="设置密码"
                type="password"
                placeholder="至少 8 个字符"
                autoComplete="new-password"
                icon={Lock}
                value={password}
                minLength={8}
                maxLength={72}
                onChange={setPassword}
              />
              <AuthFormField
                id="employee-confirm-password"
                label="确认密码"
                type="password"
                placeholder="再次输入密码"
                autoComplete="new-password"
                icon={Lock}
                value={confirmPassword}
                minLength={8}
                maxLength={72}
                onChange={setConfirmPassword}
              />

              {error ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              ) : null}

              <Button
                type="submit"
                className="h-10 w-full rounded-md"
                disabled={isSubmitting || !selectedGroupId}
              >
                {isSubmitting ? (
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                ) : null}
                {isSubmitting ? '正在注册…' : '完成注册'}
                {!isSubmitting ? <ArrowRight className="size-4" /> : null}
              </Button>

              <Button asChild type="button" variant="ghost" className="h-9 w-full rounded-md">
                <Link href="/auth">
                  <ArrowLeft className="size-4" />
                  返回登录
                </Link>
              </Button>
            </form>
          )}
        </section>
      </div>
    </FullScreenFrame>
  )
}
