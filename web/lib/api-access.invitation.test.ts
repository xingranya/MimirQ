import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '@/lib/api/core'
import { rbacApi } from '@/lib/api/access'

describe('成员邀请 API', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('向租户邀请端点提交邮箱和角色', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: {
        email: 'member@example.com',
        role: 'viewer',
        token: 'signed-invitation',
        expires_at: '2026-08-09T00:00:00Z',
      },
    } as never)

    const result = await rbacApi.createTenantInvitation({
      email: 'member@example.com',
      role: 'viewer',
    })

    expect(post).toHaveBeenCalledWith('/rbac/invitations', {
      email: 'member@example.com',
      role: 'viewer',
    })
    expect(result.token).toBe('signed-invitation')
  })
})
