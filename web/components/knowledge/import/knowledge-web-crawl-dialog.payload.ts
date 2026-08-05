import type {
  ConnectorRunCreateRequest,
  DocumentAccessMode,
  DocumentPipelineOptions,
  WebCrawlAuthConfig,
} from '@/types'

const HTTP_PROTOCOLS = new Set(['http:', 'https:'])

function dedupeStrings(values: string[], max: number): string[] {
  const output: string[] = []
  const seen = new Set<string>()

  for (const raw of values) {
    const value = raw.trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    output.push(value)
    if (output.length >= max) break
  }

  return output
}

export type WebCrawlUrlAnalysis = {
  urls: string[]
  invalidCount: number
  duplicateCount: number
  overflowCount: number
}

export function analyzeWebCrawlUrls(raw: string, max: number): WebCrawlUrlAnalysis {
  const candidates = raw
    .split(/[\n,;]+/g)
    .map((value) => value.trim())
    .filter(Boolean)

  const urls: string[] = []
  const seen = new Set<string>()
  let invalidCount = 0
  let duplicateCount = 0
  let overflowCount = 0

  for (const candidate of candidates) {
    try {
      if (!HTTP_PROTOCOLS.has(new URL(candidate).protocol)) {
        invalidCount += 1
        continue
      }
    } catch {
      invalidCount += 1
      continue
    }
    if (seen.has(candidate)) {
      duplicateCount += 1
      continue
    }
    seen.add(candidate)
    if (urls.length >= max) {
      overflowCount += 1
      continue
    }
    urls.push(candidate)
  }

  return { urls, invalidCount, duplicateCount, overflowCount }
}

export function parseWebCrawlUrls(raw: string, max: number): string[] {
  return analyzeWebCrawlUrls(raw, max).urls
}

function parsePatterns(raw: string, max: number): string[] {
  return dedupeStrings(raw.split(/\n+/g), max).map((pattern) => pattern.slice(0, 500))
}

function parseAccessMembers(raw: string): string[] {
  return dedupeStrings(raw.split(/[\n,;]+/g), 200)
}

function clampInteger(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

export type WebCrawlRunPayloadInput = {
  datasetId: string
  datasetDefaultValue: string
  startUrls: string
  filename: string
  maxPages: number
  maxDepth: number
  sameHostOnly: boolean
  includePatterns: string
  excludePatterns: string
  useSitemaps: boolean
  sitemapUrls: string
  respectRobots: boolean
  dedupCanonical: boolean
  userAgent: string
  auth: WebCrawlAuthConfig | null
  parserBackend: string
  chunkStrategy: string
  pipeline?: DocumentPipelineOptions
  accessMode: DocumentAccessMode
  accessMembers: string
  accessGroupIds: string[]
}

export function buildWebCrawlRunPayload(
  input: WebCrawlRunPayloadInput
): Extract<ConnectorRunCreateRequest, { connector_id: 'web_crawl' }> {
  const access =
    input.accessMode === 'inherit'
      ? null
      : {
          mode: input.accessMode,
          partial_member_list:
            input.accessMode === 'partial_members' ? parseAccessMembers(input.accessMembers) : null,
          partial_group_list:
            input.accessMode === 'partial_members' ? dedupeStrings(input.accessGroupIds, 200) : null,
        }

  return {
    connector_id: 'web_crawl',
    dataset_id: input.datasetId === input.datasetDefaultValue ? undefined : input.datasetId,
    config: {
      start_urls: parseWebCrawlUrls(input.startUrls, 5),
      max_pages: clampInteger(input.maxPages, 1, 500, 50),
      max_depth: clampInteger(input.maxDepth, 0, 10, 3),
      same_host_only: Boolean(input.sameHostOnly),
      include_patterns: parsePatterns(input.includePatterns, 30),
      exclude_patterns: parsePatterns(input.excludePatterns, 60),
      use_sitemaps: Boolean(input.useSitemaps),
      sitemap_urls: input.useSitemaps ? parseWebCrawlUrls(input.sitemapUrls, 10) : [],
      respect_robots: Boolean(input.respectRobots),
      dedup_canonical: Boolean(input.dedupCanonical),
      user_agent: input.userAgent.trim() || undefined,
      auth: input.auth,
      filename: input.filename.trim() || undefined,
      parser_backend: input.parserBackend,
      chunk_strategy: input.chunkStrategy,
      pipeline: input.pipeline,
      access,
    },
  }
}
