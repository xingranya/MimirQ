import type { AutoDocumentTag } from '@/types'

/** 去除空标签和重复标签，并保留第一次出现的顺序。 */
export function dedupeGovernanceTags(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = String(value || '').trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

/** 读取文档标签的实际值；类型名称只在旧响应缺少值时兜底。 */
export function getGovernanceDocumentTagValue(tag: AutoDocumentTag): string {
  const value = String(tag.value || tag.label || '').trim()
  if (tag.type !== 'sensitivity') return value
  if (value === 'internal') return '内部'
  if (value === 'restricted') return '受限'
  return value
}

/** 按分类、领域、行业、文档类型和主题的顺序选择分类候选。 */
export function selectGovernanceCategoryTag(
  tags: AutoDocumentTag[]
): AutoDocumentTag | undefined {
  const preferredTypes: AutoDocumentTag['type'][] = [
    'category',
    'domain',
    'industry',
    'doc_type',
    'topic',
  ]
  for (const type of preferredTypes) {
    const match = tags.find(
      (tag) => tag.type === type && getGovernanceDocumentTagValue(tag)
    )
    if (match) return match
  }
  return tags.find((tag) => getGovernanceDocumentTagValue(tag))
}
