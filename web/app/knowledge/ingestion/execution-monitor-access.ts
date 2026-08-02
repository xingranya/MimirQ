import type {
  Document,
  IngestionDashboardSummaryResponse,
} from '@/types'

export type ExecutionStatusCounts = {
  completed: number
  processing: number
  pending: number
  failed: number
  quarantined: number
}

const EMPTY_STATUS_COUNTS: ExecutionStatusCounts = {
  completed: 0,
  processing: 0,
  pending: 0,
  failed: 0,
  quarantined: 0,
}

function safeCount(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

/** 系统汇总不可用时，使用当前账户可见文档生成可信的状态统计。 */
export function resolveExecutionStatusCounts(
  summary: IngestionDashboardSummaryResponse | null | undefined,
  documents: Document[]
): ExecutionStatusCounts {
  if (summary) {
    return {
      completed: safeCount(summary.by_status.completed),
      processing: safeCount(summary.by_status.processing),
      pending: safeCount(summary.by_status.pending),
      failed: safeCount(summary.by_status.failed),
      quarantined: safeCount(summary.by_status.quarantined),
    }
  }

  return documents.reduce<ExecutionStatusCounts>((counts, document) => {
    const status = String(document.status || '').trim().toLowerCase()
    if (['completed', 'complete', 'ready', 'done', 'success'].includes(status)) {
      counts.completed += 1
    } else if (['processing', 'parsing', 'running'].includes(status)) {
      counts.processing += 1
    } else if (['pending', 'queued', 'waiting'].includes(status)) {
      counts.pending += 1
    } else if (status === 'quarantined') {
      counts.quarantined += 1
    } else if (['failed', 'failure', 'error'].includes(status)) {
      counts.failed += 1
    }
    return counts
  }, { ...EMPTY_STATUS_COUNTS })
}

/** 生成不掩盖权限或请求错误的队列状态文案。 */
export function resolveTaskQueueStatusLabel({
  demoMode,
  accessLoading,
  canReadObservability,
  queryFetching,
  queryError,
  hasSnapshot,
  queueEnabled,
  brokerUp,
}: Readonly<{
  demoMode: boolean
  accessLoading: boolean
  canReadObservability: boolean
  queryFetching: boolean
  queryError: boolean
  hasSnapshot: boolean
  queueEnabled?: boolean
  brokerUp?: boolean
}>): string {
  if (demoMode) return 'Demo 运行态'
  if (accessLoading) return '正在确认权限'
  if (!canReadObservability) return '无队列查看权限'
  if (queryFetching && !hasSnapshot) return '正在读取队列'
  if (queryError) return '队列读取失败'
  if (!hasSnapshot) return '队列暂无数据'
  if (!queueEnabled) return '队列未启用'
  if (!brokerUp) return 'Broker 异常'
  return 'Broker 正常'
}
