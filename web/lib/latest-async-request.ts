/** 最后一次异步请求的判定结果。 */
export type LatestAsyncRequestOutcome<T> =
  | { status: 'current'; ok: true; value: T }
  | { status: 'current'; ok: false; error: unknown }
  | { status: 'stale' }

/** 可使旧请求失效的异步请求协调器。 */
export type LatestAsyncRequest = {
  invalidate: () => void
  run: <T>(request: () => Promise<T>) => Promise<LatestAsyncRequestOutcome<T>>
}

/**
 * 为自动预览等请求提供最后一次响应优先语义，过期成功和失败都不会进入界面状态。
 */
export function createLatestAsyncRequest(): LatestAsyncRequest {
  let sequence = 0

  return {
    invalidate() {
      sequence += 1
    },
    async run<T>(
      request: () => Promise<T>
    ): Promise<LatestAsyncRequestOutcome<T>> {
      const requestSequence = ++sequence
      try {
        const value = await request()
        if (requestSequence !== sequence) return { status: 'stale' }
        return { status: 'current', ok: true, value }
      } catch (error) {
        if (requestSequence !== sequence) return { status: 'stale' }
        return { status: 'current', ok: false, error }
      }
    },
  }
}
