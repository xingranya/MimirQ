import { describe, expect, it } from 'vitest'

import { createLatestAsyncRequest } from './latest-async-request'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

describe('最后一次异步请求门禁', () => {
  it('乱序返回时只接受最后发起的请求', async () => {
    const coordinator = createLatestAsyncRequest()
    const first = deferred<string>()
    const second = deferred<string>()
    const firstResult = coordinator.run(() => first.promise)
    const secondResult = coordinator.run(() => second.promise)

    second.resolve('新结果')
    await expect(secondResult).resolves.toEqual({
      status: 'current',
      ok: true,
      value: '新结果',
    })

    first.resolve('旧结果')
    await expect(firstResult).resolves.toEqual({ status: 'stale' })
  })

  it('过期请求失败时不返回旧错误', async () => {
    const coordinator = createLatestAsyncRequest()
    const first = deferred<string>()
    const second = deferred<string>()
    const firstResult = coordinator.run(() => first.promise)
    const secondResult = coordinator.run(() => second.promise)

    first.reject(new Error('旧请求失败'))
    await expect(firstResult).resolves.toEqual({ status: 'stale' })

    second.resolve('可用结果')
    await expect(secondResult).resolves.toMatchObject({
      status: 'current',
      ok: true,
    })
  })

  it('主动失效后不再接受在途响应', async () => {
    const coordinator = createLatestAsyncRequest()
    const request = deferred<string>()
    const result = coordinator.run(() => request.promise)

    coordinator.invalidate()
    request.resolve('已失效')

    await expect(result).resolves.toEqual({ status: 'stale' })
  })

  it('最后一次请求失败时返回当前错误', async () => {
    const coordinator = createLatestAsyncRequest()
    const error = new Error('当前请求失败')

    await expect(
      coordinator.run(() => Promise.reject(error))
    ).resolves.toEqual({ status: 'current', ok: false, error })
  })
})
