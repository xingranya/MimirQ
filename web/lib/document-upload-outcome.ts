import type {
  DocumentBatchUploadFailure,
  DocumentBatchUploadResponse,
} from '@/types'

export type DocumentUploadOutcomeStatus = 'success' | 'warning' | 'error'

export type DocumentUploadOutcome = {
  status: DocumentUploadOutcomeStatus
  total: number
  succeeded: number
  failed: number
  failures: DocumentBatchUploadFailure[]
}

type DocumentUploadOutcomeCopy = {
  successVerb: string
  completeFailure: string
  emptyFailure?: string
  detailLimit?: number
}

function normalizeCount(value: unknown): number {
  const count = Number(value)
  if (!Number.isFinite(count) || count <= 0) return 0
  return Math.floor(count)
}

function compactText(value: unknown, fallback: string, maxLength: number): string {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return fallback
  const characters = Array.from(normalized)
  if (characters.length <= maxLength) return normalized
  return `${characters.slice(0, Math.max(1, maxLength - 1)).join('')}…`
}

export function createDocumentUploadOutcome(
  response: DocumentBatchUploadResponse
): DocumentUploadOutcome {
  const successfulItems = Array.isArray(response.successful) ? response.successful : []
  const failures = Array.isArray(response.failed) ? response.failed : []
  const succeeded = Math.max(
    normalizeCount(response.successful_count),
    successfulItems.length
  )
  const reportedTotal = normalizeCount(response.total)
  const failed = Math.max(
    normalizeCount(response.failed_count),
    failures.length,
    reportedTotal - succeeded
  )
  const total = Math.max(reportedTotal, succeeded + failed)

  return {
    status: succeeded === 0 ? 'error' : failed > 0 ? 'warning' : 'success',
    total,
    succeeded,
    failed,
    failures,
  }
}

export function formatDocumentUploadOutcome(
  outcome: DocumentUploadOutcome,
  copy: DocumentUploadOutcomeCopy
): string {
  const detailLimit = Math.max(0, Math.floor(copy.detailLimit ?? 3))
  const visibleFailures = outcome.failures.slice(0, detailLimit)
  const details = visibleFailures.map((failure) => {
    const filename = compactText(failure.filename, '未命名文件', 64)
    const reason = compactText(failure.error, '未返回失败原因', 96)
    return `${filename}（${reason}）`
  })
  const hiddenFailureCount = Math.max(0, outcome.failed - visibleFailures.length)
  if (detailLimit > 0 && hiddenFailureCount > 0) {
    details.push(`另有 ${hiddenFailureCount} 个文件失败`)
  }
  const detailText = details.length > 0 ? `：${details.join('；')}` : ''

  if (outcome.status === 'error') {
    if (outcome.total === 0) return copy.emptyFailure ?? '没有可处理的文件'
    return `${copy.completeFailure}，${outcome.failed || outcome.total} 个文件未处理${detailText}`
  }
  if (outcome.status === 'warning') {
    return `${copy.successVerb} ${outcome.succeeded} 个文件，${outcome.failed} 个失败${detailText}`
  }
  return `${copy.successVerb} ${outcome.succeeded} 个文件`
}
