import { AlertCircle, Loader2, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'

function summaryPendingDescription(runStatus: string) {
  if (runStatus === 'pending' || runStatus === 'running') {
    return '扫描完成后会显示文件数量、长度和格式分布。'
  }
  if (runStatus === 'failed' || runStatus === 'cancelled' || runStatus === 'canceled') {
    return '当前扫描没有生成摘要。请选择其他批次或重新扫描。'
  }
  if (runStatus === 'completed') {
    return '当前批次还没有可用摘要，请重新加载。'
  }
  return '完成一次预检扫描后，可在这里查看文件范围和质量分布。'
}

export function PrecheckSummaryStatus({
  loading,
  errorMessage,
  hasSummary,
  runStatus,
  onRetry,
}: Readonly<{
  loading: boolean
  errorMessage: string
  hasSummary: boolean
  runStatus: string
  onRetry: () => void
}>) {
  if (loading && !hasSummary) {
    return (
      <div
        role="status"
        className="flex min-h-24 items-center justify-center gap-2 border-y border-border py-6 text-sm text-muted-foreground"
      >
        <Loader2
          className="size-4 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        正在加载扫描摘要…
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div
        role="alert"
        className="flex flex-col gap-3 rounded-md border border-destructive/25 bg-destructive/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 items-start gap-2">
          <AlertCircle
            className="mt-0.5 size-4 shrink-0 text-destructive"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-destructive">
              {hasSummary ? '摘要刷新失败' : '摘要加载失败'}
            </p>
            <p className="mt-0.5 text-sm leading-5 text-destructive/85">
              {errorMessage}
              {hasSummary ? ' 当前仍显示上次加载的摘要。' : ''}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 rounded-md border-destructive/25 bg-background text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onRetry}
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
          重试摘要
        </Button>
      </div>
    )
  }

  if (hasSummary) return null

  return (
    <div className="border-y border-border py-6 text-center">
      <p className="text-sm text-muted-foreground">
        {summaryPendingDescription(runStatus)}
      </p>
    </div>
  )
}
