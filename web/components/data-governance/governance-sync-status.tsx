'use client'

import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { QueryErrorState } from '@/components/ui/query-error-state'
import { cn } from '@/lib/utils'
import type { GovernanceRemoteSource } from '@/lib/governance-document-sync'

type GovernanceSyncStatusProps = {
  failedSources: GovernanceRemoteSource[]
  hasFiles: boolean
  isError: boolean
  isFetching: boolean
  onRetry: () => void
}

/** 显示治理文档同步的部分失败或完全失败状态，并提供就地恢复入口。 */
export function GovernanceSyncStatus({
  failedSources,
  hasFiles,
  isError,
  isFetching,
  onRetry,
}: Readonly<GovernanceSyncStatusProps>) {
  const t = useTranslations('DataGovernancePanel.sync')

  if (isError) {
    return (
      <QueryErrorState
        title={t('errorTitle')}
        description={hasFiles ? t('errorWithFiles') : t('errorDescription')}
        onRetry={onRetry}
        retrying={isFetching}
        className="rounded-md"
      />
    )
  }

  if (failedSources.length === 0) return null

  const failedSource = failedSources[0]
  const description =
    failedSource === 'knowledge_base' ? t('partialKnowledgeBase') : t('partialParsingWorkspace')

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-w-0 flex-col gap-3 rounded-md border border-warning/25 bg-warning/5 p-3 sm:flex-row sm:items-center"
    >
      <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{t('partialTitle')}</p>
        <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 shrink-0 rounded-md"
        onClick={onRetry}
        disabled={isFetching}
      >
        <RefreshCw
          className={cn('size-4', isFetching && 'animate-spin motion-reduce:animate-none')}
          aria-hidden="true"
        />
        {isFetching ? t('retrying') : t('retry')}
      </Button>
    </div>
  )
}
