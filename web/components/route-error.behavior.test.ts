import { describe, expect, it, vi } from 'vitest'

import { retryRouteAfterBoundaryError } from './route-error'

describe('路由错误重试', () => {
  it('只重置当前错误边界，不触发完整页面刷新', () => {
    const reset = vi.fn()

    retryRouteAfterBoundaryError(reset)

    expect(reset).toHaveBeenCalledTimes(1)
  })
})
