import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, 'knowledge-jira-project-dialog.tsx'), 'utf8')

describe('Jira 导入弹窗视觉与交互契约', () => {
  it('使用中文任务文案和固定三段式布局', () => {
    expect(source).toContain('<DialogTitle>导入 Jira 项目</DialogTitle>')
    expect(source).toContain('grid-rows-[auto,1fr,auto]')
    expect(source).toContain('min-h-0 overflow-y-auto')
    expect(source).not.toMatch(/Jira Project \(Connector\)|Start Jira Sync|>Cancel<|URL_INGEST_ENABLED/)
    expect(source).not.toMatch(/rounded-(?:xl|2xl|3xl)|backdrop-blur|shadow-(?:sm|lg|xl|soft|strong)/)
  })

  it('将低频设置放进四个可访问的折叠区', () => {
    expect(source.match(/<details/g)).toHaveLength(4)
    expect(source).toContain('同步范围')
    expect(source).toContain('认证方式')
    expect(source).toContain('访问权限')
    expect(source).toContain('解析与入库')
  })

  it('字段具有标签、错误状态和后端数值边界', () => {
    expect(source).toContain('htmlFor="jira-project-base-url"')
    expect(source).toContain('id="jira-project-max-issues"')
    expect(source).toContain('aria-invalid={maxIssuesInvalid}')
    expect(source).toContain('max={500}')
    expect(source).toContain('max={100}')
    expect(source).toContain('max={200}')
    expect(source).toContain('disabled={submitting || datasetsLoading || hasBlockingError}')
  })

  it('密钥关闭后清理，并按任务实际知识库刷新', () => {
    expect(source).toContain('onOpenChange={handleDialogOpenChange}')
    expect(source).toContain('if (!nextOpen) clearCredentials()')
    expect(source).toContain('type="password"')
    expect(source).toContain('loadConnectorRuns({ datasetId: run.dataset_id || undefined })')
  })
})
