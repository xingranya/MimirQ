import type {
  ConnectorRunCreateRequest,
  DocumentAccessMode,
  DocumentPipelineOptions,
  JiraProjectConnectorConfig,
  WebCrawlAuthConfig,
} from '@/types'
import { trimTrailingSlashes } from '@/lib/utils'

type JiraSyncMode = 'auto' | 'full' | 'incremental'
type JiraSourceAclFallbackMode = 'only_me' | 'partial_members'

export type JiraProjectRunPayloadInput = {
  datasetId: string
  datasetDefaultValue: string
  baseUrl: string
  projectKey: string
  jql: string
  auth: WebCrawlAuthConfig | null
  syncMode: JiraSyncMode
  maxIssues: number
  pageSize: number
  includeComments: boolean
  maxCommentsPerIssue: number
  userAgent: string
  parserBackend: string
  chunkStrategy: string
  pipeline?: DocumentPipelineOptions
  accessMode: DocumentAccessMode
  accessMembers: string
  accessGroupIds: string[]
  sourceAclEnabled: boolean
  sourceAclFallbackMode: JiraSourceAclFallbackMode
}

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

function parseAccessMembers(raw: string): string[] {
  return dedupeStrings((raw || '').split(/[\n,;]+/g), 200)
}

function clampInteger(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

export function buildJiraProjectRunPayload(
  input: JiraProjectRunPayloadInput
): Extract<ConnectorRunCreateRequest, { connector_id: 'jira_project' }> {
  const trimmedBaseUrl = trimTrailingSlashes(input.baseUrl)
  const trimmedProjectKey = input.projectKey.trim().toUpperCase()
  const trimmedJql = input.jql.trim()
  const trimmedUserAgent = input.userAgent.trim()
  const hasManualAccessOverride = input.accessMode !== 'inherit'

  const access =
    input.accessMode === 'inherit'
      ? null
      : {
          mode: input.accessMode,
          partial_member_list: input.accessMode === 'partial_members' ? parseAccessMembers(input.accessMembers) : null,
          partial_group_list:
            input.accessMode === 'partial_members' ? dedupeStrings(input.accessGroupIds, 200) : null,
        }

  const config: JiraProjectConnectorConfig = {
    base_url: trimmedBaseUrl,
    project_key: trimmedProjectKey,
    jql: trimmedJql || undefined,
    auth: input.auth,
    sync_mode: input.syncMode,
    max_issues: clampInteger(input.maxIssues, 1, 500, 50),
    page_size: clampInteger(input.pageSize, 1, 100, 25),
    include_comments: Boolean(input.includeComments),
    max_comments_per_issue: clampInteger(input.maxCommentsPerIssue, 0, 200, 20),
    user_agent: trimmedUserAgent || undefined,
    parser_backend: input.parserBackend,
    chunk_strategy: input.chunkStrategy,
    pipeline: input.pipeline,
    access,
    source_acl:
      input.sourceAclEnabled && !hasManualAccessOverride
        ? {
            mode: 'inherit',
            fallback_mode: input.sourceAclFallbackMode,
          }
        : undefined,
  }

  return {
    connector_id: 'jira_project',
    dataset_id: input.datasetId === input.datasetDefaultValue ? undefined : input.datasetId,
    config,
  }
}
