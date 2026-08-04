import Image from 'next/image'
import { Loader2, ShieldAlert, ShieldCheck } from 'lucide-react'

import { FullScreenFrame } from '@/components/full-screen-frame'
import { Button } from '@/components/ui/button'
import { BRAND_CONFIG } from '@/lib/brand'

export type AuthCallbackState = 'working' | 'success' | 'error'

export function AuthCallbackStatus({
  errorMessage,
  onBackToLogin,
  status,
}: Readonly<{
  errorMessage?: string | null
  onBackToLogin: () => void
  status: AuthCallbackState
}>) {
  const content = {
    working: {
      title: '正在完成单点登录',
      description: '正在验证身份信息，请稍候。',
      icon: Loader2,
      iconClassName: 'animate-spin text-muted-foreground motion-reduce:animate-none',
    },
    success: {
      title: '登录成功',
      description: `正在进入${BRAND_CONFIG.name}…`,
      icon: ShieldCheck,
      iconClassName: 'text-success',
    },
    error: {
      title: '无法完成单点登录',
      description: errorMessage || '登录失败，请返回登录页重试。',
      icon: ShieldAlert,
      iconClassName: 'text-destructive',
    },
  }[status]
  const StatusIcon = content.icon

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
            className="h-10 w-auto max-w-[200px] select-none object-contain"
          />
          <p className="mt-3 text-sm font-medium text-foreground">{BRAND_CONFIG.name}</p>
        </header>

        <section
          role={status === 'error' ? 'alert' : 'status'}
          aria-live={status === 'error' ? 'assertive' : 'polite'}
          className="rounded-md border border-border bg-card p-5 sm:p-6"
        >
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
              <StatusIcon className={`size-4 ${content.iconClassName}`} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-base font-semibold text-foreground">{content.title}</h1>
              <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">
                {content.description}
              </p>
            </div>
          </div>

          {status === 'error' ? (
            <div className="mt-5 flex justify-end">
              <Button type="button" className="h-9 w-full sm:w-auto" onClick={onBackToLogin}>
                返回登录
              </Button>
            </div>
          ) : null}
        </section>
      </div>
    </FullScreenFrame>
  )
}
