export const MAX_GROUP_MEMBERS_PER_REQUEST = 200

export type NormalizedGroupMemberIds = {
  ids: string[]
  error?: string
}

/** 解析成员标识，去除重复项，并在超过接口上限时拒绝整批输入。 */
export function normalizeGroupMemberIds(raw: string): NormalizedGroupMemberIds {
  const parts = (raw || '')
    .split(/[\n,;]+/g)
    .map((part) => part.trim())
    .filter(Boolean)

  const ids: string[] = []
  const seen = new Set<string>()
  for (const memberId of parts) {
    if (seen.has(memberId)) continue
    seen.add(memberId)
    if (memberId.length > 255) {
      return { ids: [], error: '成员标识过长，最多 255 个字符。' }
    }
    ids.push(memberId)
  }

  if (ids.length > MAX_GROUP_MEMBERS_PER_REQUEST) {
    return {
      ids: [],
      error: `一次最多添加 ${MAX_GROUP_MEMBERS_PER_REQUEST} 人，当前输入 ${ids.length} 个不同的成员标识。请分批添加。`,
    }
  }

  return { ids }
}
