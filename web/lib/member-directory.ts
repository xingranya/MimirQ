export type MemberIdentity = {
  user_id?: string | null
  account_id?: string | null
  username?: string | null
  email?: string | null
}

export type MemberDisplay = {
  accountId: string
  primary: string
  secondary: string
}

export function getMemberAccountId(member: MemberIdentity): string {
  return String(member.account_id || member.user_id || '').trim()
}

export function getMemberDisplay(member: MemberIdentity): MemberDisplay {
  const accountId = getMemberAccountId(member)
  const username = String(member.username || '').trim()
  const email = String(member.email || '').trim()

  return {
    accountId,
    primary: username || email || accountId || '未知成员',
    secondary: email || (accountId ? `账号 ID：${accountId}` : '缺少账号信息'),
  }
}

export function getMemberInitials(member: MemberIdentity): string {
  const display = getMemberDisplay(member)
  return display.primary.slice(0, 1).toUpperCase() || '?'
}

export function matchesMemberQuery(member: MemberIdentity, query: string): boolean {
  const normalizedQuery = String(query || '')
    .trim()
    .toLowerCase()
  if (!normalizedQuery) return true

  return [member.username, member.email, getMemberAccountId(member)]
    .map((value) => String(value || '').toLowerCase())
    .some((value) => value.includes(normalizedQuery))
}
