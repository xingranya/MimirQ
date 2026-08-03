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
        id: '00000000-0000-0000-0000-000000000001',
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

  it('读取待处理邀请且不接收令牌字段', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: {
        total: 1,
        items: [
          {
            id: '00000000-0000-0000-0000-000000000001',
            email: 'member@example.com',
            role: 'viewer',
            invited_by: 'owner-1',
            status: 'pending',
            expires_at: '2026-08-09T00:00:00Z',
            created_at: '2026-08-02T00:00:00Z',
          },
        ],
      },
    } as never)

    const result = await rbacApi.listTenantInvitations({ status: 'pending', limit: 100 })

    expect(get).toHaveBeenCalledWith('/rbac/invitations', {
      params: { status: 'pending', limit: 100 },
    })
    expect(result.items?.[0]?.email).toBe('member@example.com')
  })

  it('按邀请 ID 撤销待处理邀请', async () => {
    const del = vi.spyOn(apiClient, 'delete').mockResolvedValue({
      data: {
        invitation_id: '00000000-0000-0000-0000-000000000001',
        revoked: true,
        revoked_at: '2026-08-02T01:00:00Z',
      },
    } as never)

    const result = await rbacApi.revokeTenantInvitation('00000000-0000-0000-0000-000000000001')

    expect(del).toHaveBeenCalledWith('/rbac/invitations/00000000-0000-0000-0000-000000000001')
    expect(result.revoked).toBe(true)
  })
})
