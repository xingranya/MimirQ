import { describe, expect, it } from 'vitest'

import { buildJiraProjectRunPayload } from './knowledge-jira-project-dialog.payload'

const baseInput = {
  datasetId: '__default__',
  datasetDefaultValue: '__default__',
  baseUrl: 'https://example.atlassian.net',
  projectKey: 'PLAT',
  jql: '',
  auth: null,
  syncMode: 'auto' as const,
  maxIssues: 50,
  pageSize: 25,
  includeComments: true,
  maxCommentsPerIssue: 20,
  userAgent: '',
  parserBackend: 'auto',
  chunkStrategy: 'jira_ticket',
  accessMode: 'inherit' as const,
  accessMembers: '',
  accessGroupIds: [],
  sourceAclEnabled: false,
  sourceAclFallbackMode: 'partial_members' as const,
}

describe('Jira 导入任务参数', () => {
  it('整理地址、项目 Key 和可选字段', () => {
    const payload = buildJiraProjectRunPayload({
      ...baseInput,
      datasetId: 'dataset-1',
      baseUrl: ' https://example.atlassian.net/ ',
      projectKey: ' plat ',
      jql: ' statusCategory != Done ',
      userAgent: ' SEEWAY/1.0 ',
    })

    expect(payload.dataset_id).toBe('dataset-1')
    expect(payload.config.base_url).toBe('https://example.atlassian.net')
    expect(payload.config.project_key).toBe('PLAT')
    expect(payload.config.jql).toBe('statusCategory != Done')
    expect(payload.config.user_agent).toBe('SEEWAY/1.0')
  })

  it('把同步数量限制在后端接受的边界内并保留评论零值', () => {
    const payload = buildJiraProjectRunPayload({
      ...baseInput,
      maxIssues: 900,
      pageSize: 0,
      maxCommentsPerIssue: 0,
    })

    expect(payload.config.max_issues).toBe(500)
    expect(payload.config.page_size).toBe(1)
    expect(payload.config.max_comments_per_issue).toBe(0)
  })

  it('去重成员和成员组，并限制最多 200 项', () => {
    const accessMembers = ['alice', 'alice', 'bob', ...Array.from({ length: 205 }, (_, index) => `member-${index}`)].join('\n')
    const accessGroupIds = ['group-1', 'group-1', 'group-2']
    const payload = buildJiraProjectRunPayload({
      ...baseInput,
      accessMode: 'partial_members',
      accessMembers,
      accessGroupIds,
    })

    expect(payload.config.access?.partial_member_list).toHaveLength(200)
    expect(payload.config.access?.partial_member_list?.slice(0, 3)).toEqual(['alice', 'bob', 'member-0'])
    expect(payload.config.access?.partial_group_list).toEqual(['group-1', 'group-2'])
  })

  it('只在继承知识库权限时提交 Jira 来源权限', () => {
    const inherited = buildJiraProjectRunPayload({
      ...baseInput,
      sourceAclEnabled: true,
      sourceAclFallbackMode: 'only_me',
    })
    const overridden = buildJiraProjectRunPayload({
      ...baseInput,
      accessMode: 'only_me',
      sourceAclEnabled: true,
    })

    expect(inherited.config.source_acl).toEqual({ mode: 'inherit', fallback_mode: 'only_me' })
    expect(overridden.config.source_acl).toBeUndefined()
  })
})
