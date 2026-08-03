export type GovernanceAnnotation = {
  id: string
  text: string
  type: 'entity' | 'keyword' | 'sensitive' | 'custom'
  label: string
  start: number
  end: number
}

export type GovernanceIssue = {
  id: string
  type: 'error' | 'warning' | 'info'
  message: string
  position?: { start: number; end: number }
}

export type GovernanceDocumentState = {
  annotations: GovernanceAnnotation[]
  tags: string[]
  category: string | null
  qualityScore: number
  issues: GovernanceIssue[]
}

export type PersistedGovernanceDocumentState = {
  version: 1
  annotations: GovernanceAnnotation[]
  tags: string[]
  category: string | null
  quality_score: number
  issues: GovernanceIssue[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function limitText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.slice(0, maxLength) : ''
}

function normalizePosition(
  value: unknown
): { start: number; end: number } | undefined {
  if (!isRecord(value)) return undefined
  const start = Math.max(0, Math.trunc(Number(value.start) || 0))
  const end = Math.max(start, Math.trunc(Number(value.end) || start))
  return { start, end }
}

function normalizeAnnotations(value: unknown): GovernanceAnnotation[] {
  if (!Array.isArray(value)) return []
  const validTypes = new Set<GovernanceAnnotation['type']>([
    'entity',
    'keyword',
    'sensitive',
    'custom',
  ])
  return value.slice(0, 500).flatMap((entry) => {
    if (!isRecord(entry)) return []
    const id = limitText(entry.id, 160).trim()
    const type = String(entry.type || '') as GovernanceAnnotation['type']
    if (!id || !validTypes.has(type)) return []
    const start = Math.max(0, Math.trunc(Number(entry.start) || 0))
    const end = Math.max(start, Math.trunc(Number(entry.end) || start))
    return [
      {
        id,
        text: limitText(entry.text, 2_000),
        type,
        label: limitText(entry.label, 200),
        start,
        end,
      },
    ]
  })
}

function normalizeIssues(value: unknown): GovernanceIssue[] {
  if (!Array.isArray(value)) return []
  const validTypes = new Set<GovernanceIssue['type']>(['error', 'warning', 'info'])
  return value.slice(0, 500).flatMap((entry) => {
    if (!isRecord(entry)) return []
    const id = limitText(entry.id, 160).trim()
    const type = String(entry.type || '') as GovernanceIssue['type']
    if (!id || !validTypes.has(type)) return []
    const position = normalizePosition(entry.position)
    return [
      {
        id,
        type,
        message: limitText(entry.message, 2_000),
        ...(position ? { position } : {}),
      },
    ]
  })
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const tags: string[] = []
  const seen = new Set<string>()
  for (const item of value.slice(0, 100)) {
    const tag = limitText(item, 100).trim()
    const key = tag.toLocaleLowerCase()
    if (!tag || seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
  }
  return tags
}

export function createEmptyGovernanceDocumentState(): GovernanceDocumentState {
  return {
    annotations: [],
    tags: [],
    category: null,
    qualityScore: 0,
    issues: [],
  }
}

export function cloneGovernanceDocumentState(
  state: GovernanceDocumentState
): GovernanceDocumentState {
  return {
    annotations: state.annotations.map((annotation) => ({ ...annotation })),
    tags: [...state.tags],
    category: state.category,
    qualityScore: state.qualityScore,
    issues: state.issues.map((issue) => ({
      ...issue,
      ...(issue.position ? { position: { ...issue.position } } : {}),
    })),
  }
}

export function readGovernanceDocumentState(
  metadata: unknown
): GovernanceDocumentState | null {
  if (!isRecord(metadata)) return null
  const userMetadata = metadata.user
  if (!isRecord(userMetadata) || !isRecord(userMetadata.governance)) return null
  const governance = userMetadata.governance
  const qualityScore = Math.min(
    100,
    Math.max(0, Number(governance.quality_score) || 0)
  )
  return {
    annotations: normalizeAnnotations(governance.annotations),
    tags: normalizeTags(governance.tags),
    category: limitText(governance.category, 500).trim() || null,
    qualityScore,
    issues: normalizeIssues(governance.issues),
  }
}

export function serializeGovernanceDocumentState(
  state: GovernanceDocumentState
): PersistedGovernanceDocumentState {
  return {
    version: 1,
    annotations: normalizeAnnotations(state.annotations),
    tags: normalizeTags(state.tags),
    category: limitText(state.category, 500).trim() || null,
    quality_score: Math.min(100, Math.max(0, Number(state.qualityScore) || 0)),
    issues: normalizeIssues(state.issues),
  }
}

export function governanceDocumentStateFingerprint(
  state: GovernanceDocumentState
): string {
  return JSON.stringify(serializeGovernanceDocumentState(state))
}
