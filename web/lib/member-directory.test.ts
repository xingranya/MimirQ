import { describe, expect, it } from 'vitest'

import {
  getMemberAccountId,
  getMemberDisplay,
  getMemberInitials,
  matchesMemberQuery,
} from './member-directory'

const member = {
  user_id: 'legacy-id',
  account_id: 'account-id',
  username: 'fox',
  email: 'fox@example.com',
}

describe('成员目录显示', () => {
  it('优先显示用户名和邮箱，并明确保留账号 ID', () => {
    expect(getMemberAccountId(member)).toBe('account-id')
    expect(getMemberDisplay(member)).toEqual({
      accountId: 'account-id',
      primary: 'fox',
      secondary: 'fox@example.com',
    })
    expect(getMemberInitials(member)).toBe('F')
  })

  it('支持按用户名、邮箱和账号 ID 搜索', () => {
    expect(matchesMemberQuery(member, 'FOX')).toBe(true)
    expect(matchesMemberQuery(member, 'example.com')).toBe(true)
    expect(matchesMemberQuery(member, 'account-id')).toBe(true)
    expect(matchesMemberQuery(member, 'finance')).toBe(false)
  })

  it('外部账号没有本地资料时仍提供可理解的回退显示', () => {
    expect(getMemberDisplay({ user_id: 'oidc-user-7' })).toEqual({
      accountId: 'oidc-user-7',
      primary: 'oidc-user-7',
      secondary: '账号 ID：oidc-user-7',
    })
  })
})
