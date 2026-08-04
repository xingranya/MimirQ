'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react'

import { FullScreenFrame } from '@/components/full-screen-frame'
import { extractRequestIdFromError } from '@/lib/api-errors'
import { captureApiError } from '@/lib/api-error-reporting'
import { reloadOnceForStaleChunk } from '@/lib/stale-chunk-recovery'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type RouteErrorProps = Readonly<{
  error: Error & { digest?: string }
  reset: () => void
  title?: string
  message?: string
  href?: string
  hrefLabel?: string
  fullScreen?: boolean
}>

/** 重置当前 Next 路由错误边界，并保留应用壳层和页面现场。 */
export function retryRouteAfterBoundaryError(reset: () => void) {
  reset()
}

function RouteErrorScene({
  error,
  reset,
  title,
  message,
  href = '/',
  hrefLabel,
  fullScreen = false,
}: RouteErrorProps) {
  const t = useTranslations('RouteBoundaries')
  const requestId = extractRequestIdFromError(error)
  const resolvedTitle = title ?? t('error.title')
  const resolvedMessage = message ?? t('error.message')
  const resolvedHrefLabel = hrefLabel ?? t('error.home')

  useEffect(() => {
    if (reloadOnceForStaleChunk(error)) return
    captureApiError(error, resolvedMessage, { tags: { boundary: 'route-error' } })
  }, [error, resolvedMessage])

  return (
    <section
      className={cn(
        'flex w-full flex-1 items-center justify-center bg-background px-5 py-10 text-foreground',
        fullScreen ? 'min-h-dvh' : 'min-h-[480px] rounded-md border border-border'
      )}
    >
      <div className="flex w-full max-w-lg flex-col items-center text-center">
        <div className="flex size-12 items-center justify-center rounded-md bg-destructive/10 text-destructive">
          <AlertTriangle className="size-6" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-xl font-semibold text-foreground">{resolvedTitle}</h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{resolvedMessage}</p>

        <div className="mt-6 flex w-full max-w-sm flex-col-reverse gap-2 sm:flex-row sm:justify-center">
          <Button variant="outline" className="h-10 rounded-md px-4" asChild>
            <Link href={href}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              {resolvedHrefLabel}
            </Link>
          </Button>
          <Button
            className="h-10 rounded-md px-4"
            onClick={() => retryRouteAfterBoundaryError(reset)}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            {t('error.retry')}
          </Button>
        </div>

        {requestId || error?.digest ? (
          <div className="mt-5 space-y-1 text-xs text-muted-foreground">
            {requestId ? <p className="font-mono">{t('error.requestId', { requestId })}</p> : null}
            {error?.digest ? (
              <p className="font-mono">{t('error.errorId', { errorId: error.digest })}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}

/** 渲染路由级错误状态，并提供原地重试和返回入口。 */
export function RouteError(props: RouteErrorProps) {
  if (props.fullScreen) {
    return (
      <FullScreenFrame showBackground={false} className="bg-background" mainClassName="p-0">
        <RouteErrorScene {...props} fullScreen />
      </FullScreenFrame>
    )
  }

  return (
    <div className="flex flex-1 items-stretch justify-center p-4 sm:p-6">
      <RouteErrorScene {...props} />
    </div>
  )
}
