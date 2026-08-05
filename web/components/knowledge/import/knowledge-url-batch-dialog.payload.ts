import type {
  ConnectorRunCreateRequest,
  DocumentAccessMode,
  DocumentPipelineOptions,
} from '@/types'

const HTTP_PROTOCOLS = new Set(['http:', 'https:'])

export const URL_BATCH_MAX_URLS = 50
export const URL_BATCH_MAX_URL_LENGTH = 2000
export const URL_BATCH_MAX_FILENAME_LENGTH = 500
export const URL_BATCH_MAX_ACCESS_MEMBERS = 200
export const URL_BATCH_MAX_ACCESS_MEMBER_LENGTH = 255

export type UrlBatchAnalysis = {
  urls: string[]
  invalidCount: number
  duplicateCount: number
  overflowCount: number
  tooLongCount: number
}

export type AccessMemberAnalysis = {
  members: string[]
  duplicateCount: number
  overflowCount: number
  tooLongCount: number
}

function splitEntries(raw: string): string[] {
  return raw
    .split(/[\n,;]+/g)
    .map((value) => value.trim())
    .filter(Boolean)
}

export function analyzeUrlBatch(raw: string): UrlBatchAnalysis {
  const urls: string[] = []
  const seen = new Set<string>()
  let invalidCount = 0
  let duplicateCount = 0
  let overflowCount = 0
  let tooLongCount = 0

  for (const candidate of splitEntries(raw)) {
    if (candidate.length > URL_BATCH_MAX_URL_LENGTH) {
      tooLongCount += 1
      continue
    }

    let normalizedUrl: string
    try {
      const parsed = new URL(candidate)
      if (!HTTP_PROTOCOLS.has(parsed.protocol)) {
        invalidCount += 1
        continue
      }
      normalizedUrl = parsed.toString()
    } catch {
      invalidCount += 1
      continue
    }

    if (seen.has(normalizedUrl)) {
      duplicateCount += 1
      continue
    }
    seen.add(normalizedUrl)
    if (urls.length >= URL_BATCH_MAX_URLS) {
      overflowCount += 1
      continue
    }
    urls.push(normalizedUrl)
  }

  return { urls, invalidCount, duplicateCount, overflowCount, tooLongCount }
}

export function analyzeAccessMembers(raw: string): AccessMemberAnalysis {
  const members: string[] = []
  const seen = new Set<string>()
  let duplicateCount = 0
  let overflowCount = 0
  let tooLongCount = 0

  for (const memberId of splitEntries(raw)) {
    if (memberId.length > URL_BATCH_MAX_ACCESS_MEMBER_LENGTH) {
      tooLongCount += 1
      continue
    }
    if (seen.has(memberId)) {
      duplicateCount += 1
      continue
    }
    seen.add(memberId)
    if (members.length >= URL_BATCH_MAX_ACCESS_MEMBERS) {
      overflowCount += 1
      continue
    }
    members.push(memberId)
  }

  return { members, duplicateCount, overflowCount, tooLongCount }
}

export type UrlBatchRunPayloadInput = {
  datasetId: string
  datasetDefaultValue: string
  urls: string[]
  filename: string
  parserBackend: string
  chunkStrategy: string
  pipeline?: DocumentPipelineOptions
  accessMode: DocumentAccessMode
  accessMembers: string[]
  accessGroupIds: string[]
}

export function buildUrlBatchRunPayload(
  input: UrlBatchRunPayloadInput
): Extract<ConnectorRunCreateRequest, { connector_id: 'url_batch' }> {
  const access =
    input.accessMode === 'inherit'
      ? null
      : {
          mode: input.accessMode,
          partial_member_list:
            input.accessMode === 'partial_members' ? input.accessMembers : null,
          partial_group_list:
            input.accessMode === 'partial_members'
              ? Array.from(new Set(input.accessGroupIds))
              : null,
        }

  return {
    connector_id: 'url_batch',
    dataset_id:
      input.datasetId === input.datasetDefaultValue ? undefined : input.datasetId,
    config: {
      urls: input.urls,
      filename: input.filename.trim() || undefined,
      parser_backend: input.parserBackend,
      chunk_strategy: input.chunkStrategy,
      pipeline: input.pipeline,
      access,
    },
  }
}
