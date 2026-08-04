import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
}))
vi.mock('@/components/app-frame', () => ({
  AppFrame: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@/components/provider-icon', () => ({
  ProviderIcon: () => null,
}))
vi.mock('@/components/ui/page-scaffold', () => ({
  PageScaffold: ({ children }: { children: React.ReactNode }) => children,
}))

import LogosPreviewPage from './page'

describe('供应商图标页环境门禁', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it('生产环境返回标准未找到状态', () => {
    vi.stubEnv('NODE_ENV', 'production')

    expect(() => LogosPreviewPage()).toThrow('NEXT_NOT_FOUND')
    expect(mocks.notFound).toHaveBeenCalledOnce()
  })

  it('开发环境保留品牌资源检查页面', () => {
    vi.stubEnv('NODE_ENV', 'development')

    expect(() => LogosPreviewPage()).not.toThrow()
    expect(mocks.notFound).not.toHaveBeenCalled()
  })
})
