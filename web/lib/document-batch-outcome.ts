export type DocumentBatchSuccessField = 'updated' | 'deleted' | 'queued' | 'moved'

type DocumentBatchResult = Partial<Record<DocumentBatchSuccessField, number>> & {
  skipped?: number
  not_found?: string[]
  denied?: string[]
  conflicts?: string[]
}

export type DocumentBatchOutcome = {
  status: 'success' | 'warning' | 'error'
  requested: number
  succeeded: number
  failed: number
  skipped: number
  notFound: number
  denied: number
  conflicts: number
  unclassified: number
  remainingIds: string[]
}

function nonNegativeInteger(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.trunc(parsed))
}

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  )
}

/** 统一解释文档批量接口的成功数、失败明细和剩余选择。 */
export function createDocumentBatchOutcome(
  requestedIds: readonly string[],
  result: DocumentBatchResult,
  successField: DocumentBatchSuccessField
): DocumentBatchOutcome {
  const requested = uniqueStrings(requestedIds)
  const requestedSet = new Set(requested)
  const succeeded = Math.min(requested.length, nonNegativeInteger(result[successField]))
  const failed = Math.max(0, requested.length - succeeded)
  const notFoundIds = uniqueStrings(result.not_found)
  const deniedIds = uniqueStrings(result.denied)
  const conflictIds = uniqueStrings(result.conflicts)
  const skipped = Math.min(failed, nonNegativeInteger(result.skipped))
  const knownFailureIds = Array.from(
    new Set([...notFoundIds, ...deniedIds, ...conflictIds])
  ).filter((id) => requestedSet.has(id))
  const namedFailureCount =
    notFoundIds.length + deniedIds.length + conflictIds.length + skipped
  const unclassified = Math.max(0, failed - Math.min(failed, namedFailureCount))

  // 后端没有返回足够的失败 ID 时保留原选择，避免把未成功的文档误清除。
  const remainingIds =
    failed === 0
      ? []
      : knownFailureIds.length === failed && skipped === 0
        ? requested.filter((id) => knownFailureIds.includes(id))
        : requested

  return {
    status: succeeded === 0 ? 'error' : failed > 0 ? 'warning' : 'success',
    requested: requested.length,
    succeeded,
    failed,
    skipped,
    notFound: notFoundIds.length,
    denied: deniedIds.length,
    conflicts: conflictIds.length,
    unclassified,
    remainingIds,
  }
}

export function formatDocumentBatchOutcome(
  outcome: DocumentBatchOutcome,
  copy: Readonly<{
    successVerb: string
    completeFailure: string
  }>
): string {
  const details = [
    outcome.notFound > 0 ? `未找到 ${outcome.notFound} 份` : '',
    outcome.denied > 0 ? `无权操作 ${outcome.denied} 份` : '',
    outcome.conflicts > 0 ? `状态冲突 ${outcome.conflicts} 份` : '',
    outcome.skipped > 0 ? `已跳过 ${outcome.skipped} 份` : '',
    outcome.unclassified > 0 ? `其他原因 ${outcome.unclassified} 份` : '',
  ].filter(Boolean)
  const detailText = details.length ? `（${details.join('、')}）` : ''

  if (outcome.succeeded === 0) {
    return `${copy.completeFailure}${detailText}。`
  }
  if (outcome.failed > 0) {
    return `${copy.successVerb} ${outcome.succeeded} 份文档，${outcome.failed} 份未处理${detailText}。`
  }
  return `${copy.successVerb} ${outcome.succeeded} 份文档。`
}
