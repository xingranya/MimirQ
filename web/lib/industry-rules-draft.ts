/** 术语编辑行。 */
export type GlossaryEntry = {
  id: string
  term: string
  aliasesText: string
}

/** 问题模式编辑行。 */
export type PatternEntry = {
  id: string
  markersText: string
  followup: string
  enabled: boolean
}

/** 意图分类编辑行。 */
export type IntentEntry = {
  id: string
  name: string
  keywordsText: string
  route: string
}

/** 行业规则工作台的三个可编辑分区。 */
export type IndustryRulesDraft = {
  glossaryEntries: readonly GlossaryEntry[]
  patternEntries: readonly PatternEntry[]
  intentEntries: readonly IntentEntry[]
}

/** 三个分区各自的持久化内容指纹。 */
export type IndustryRulesDraftFingerprints = {
  glossary: string
  patterns: string
  intents: string
}

/** 返回术语草稿中第一个缺少术语名称的行号。 */
export function glossaryDraftValidationError(
  entries: readonly GlossaryEntry[]
): string | null {
  const index = entries.findIndex((entry) => !entry.term.trim())
  return index >= 0 ? `第 ${index + 1} 条术语缺少术语名称` : null
}

/** 返回问题模式草稿中第一个缺少触发词的行号。 */
export function patternsDraftValidationError(
  entries: readonly PatternEntry[]
): string | null {
  const index = entries.findIndex(
    (entry) => splitCommaText(entry.markersText).length === 0
  )
  return index >= 0 ? `第 ${index + 1} 条问题模式缺少触发词` : null
}

/** 返回意图草稿中第一个缺少意图名称的行号。 */
export function intentsDraftValidationError(
  entries: readonly IntentEntry[]
): string | null {
  const index = entries.findIndex((entry) => !entry.name.trim())
  return index >= 0 ? `第 ${index + 1} 条意图缺少意图名称` : null
}

function splitCommaText(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

/** 生成术语分区的持久化请求体，忽略仅供前端使用的行标识。 */
export function buildGlossaryPayload(
  entries: readonly GlossaryEntry[]
): Record<string, string[]> {
  const payload: Record<string, string[]> = {}
  for (const entry of entries) {
    const term = entry.term.trim()
    if (!term) continue
    payload[term] = splitCommaText(entry.aliasesText)
  }
  return payload
}

/** 生成问题模式分区的持久化请求体。 */
export function buildPatternsPayload(
  entries: readonly PatternEntry[]
): Array<Record<string, unknown>> {
  return entries
    .map((entry) => ({
      markers: splitCommaText(entry.markersText),
      followup: entry.followup.trim(),
      enabled: entry.enabled,
    }))
    .filter((entry) => entry.markers.length > 0)
}

/** 生成意图分区的持久化请求体。 */
export function buildIntentsPayload(
  entries: readonly IntentEntry[]
): Array<Record<string, unknown>> {
  return entries
    .map((entry) => ({
      name: entry.name.trim(),
      keywords: splitCommaText(entry.keywordsText),
      route: entry.route.trim() || 'default',
    }))
    .filter((entry) => entry.name)
}

/** 计算术语分区的本地草稿指纹，只忽略前端行标识。 */
export function glossaryDraftFingerprint(
  entries: readonly GlossaryEntry[]
): string {
  return JSON.stringify(
    entries.map(({ term, aliasesText }) => ({ term, aliasesText }))
  )
}

/** 计算问题模式分区的本地草稿指纹，只忽略前端行标识。 */
export function patternsDraftFingerprint(
  entries: readonly PatternEntry[]
): string {
  return JSON.stringify(
    entries.map(({ markersText, followup, enabled }) => ({
      markersText,
      followup,
      enabled,
    }))
  )
}

/** 计算意图分区的本地草稿指纹，只忽略前端行标识。 */
export function intentsDraftFingerprint(
  entries: readonly IntentEntry[]
): string {
  return JSON.stringify(
    entries.map(({ name, keywordsText, route }) => ({
      name,
      keywordsText,
      route,
    }))
  )
}

/** 计算三个分区的本地草稿指纹，避免次要字段修改被静默丢弃。 */
export function industryRulesDraftFingerprints(
  draft: IndustryRulesDraft
): IndustryRulesDraftFingerprints {
  return {
    glossary: glossaryDraftFingerprint(draft.glossaryEntries),
    patterns: patternsDraftFingerprint(draft.patternEntries),
    intents: intentsDraftFingerprint(draft.intentEntries),
  }
}
