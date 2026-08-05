import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(__dirname, '_sections/governance-section.tsx'),
  'utf8'
)
const governanceOpsSource = readFileSync(
  resolve(__dirname, '../../components/settings/governance-ops-panel.tsx'),
  'utf8'
)
const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8')
const datasetSelectSource = readFileSync(
  resolve(__dirname, '../../components/ops/dataset-select-field.tsx'),
  'utf8'
)
const operationResultSource = readFileSync(
  resolve(__dirname, '../../components/ops/operation-result-panel.tsx'),
  'utf8'
)

describe('数据治理配置与运维契约', () => {
  it('真实删除必须绑定当前目标的安全预演指纹', () => {
    expect(source).toContain('previewMatchesCurrentTarget')
    expect(source).toContain('preview_fingerprint: rtbfPreviewSnapshot.fingerprint')
    expect(source).toContain("record.dry_run !== true")
    expect(source).toContain("responseSubject !== requestedAccountId")
  })

  it('执行前要求输入完整目标账号进行二次确认', () => {
    expect(source).toContain('rtbfDeleteConfirmValue.trim() === normalizedRtbfAccountId')
    expect(source).toContain('确认删除该账号的个人数据')
    expect(source).toContain('确认并执行删除')
    expect(source).toContain('!deleteConfirmationMatches')
    expect(source).toContain('<AlertDialog')
    expect(source).toContain('event.preventDefault()')
    expect(source).toContain('<AlertDialogCancel disabled={Boolean(rtbfRunningKey)}>')
    expect(source).toContain('if (!open && rtbfRunningKey) return')
  })

  it('不再展示尚未持久化的工单状态查询', () => {
    expect(source).not.toContain('rtbfApi.getStatus')
    expect(source).not.toContain('查询工单状态')
    expect(source).not.toContain('rtbfTicketId')
  })

  it('默认设置和治理运维使用各自的权限边界', () => {
    expect(source).toContain('disabled={!settingsWritable}')
    expect(source).toContain('TENANT_PERMISSIONS.LIFECYCLE_MANAGE')
    expect(source).toContain('tenantAccessCanEditDatasets')
    expect(source).toContain('enabled: canManagePersonalData')
    expect(pageSource).toContain('settingsWritable={settingsWritable}')
  })

  it('数值输入与后端范围一致并保留合法零值', () => {
    expect(source).toContain('Math.min(1000, Math.max(1, value))')
    expect(source).toContain('Math.min(10, Math.max(0, value))')
    expect(governanceOpsSource).toContain('Math.min(365, Math.max(0, value))')
  })

  it('使用单层列表、窄屏布局和默认收起的运维入口', () => {
    expect(source).toContain('divide-y divide-border')
    expect(source).toContain('<details className="group border-t border-border pt-3">')
    expect(source).toContain('个人数据删除、待复核查询和切块预设维护')
    expect(source).toContain('sm:flex-row')
    expect(source).not.toContain('systemWorkbenchTokens.panel')
    expect(source).not.toContain('rounded-full')
  })

  it('用户可见文案不暴露内部字段和实现名称', () => {
    expect(source).not.toContain('governance.enabled')
    expect(source).not.toContain('governance.pii_anonymize')
    expect(source).not.toContain('governance.secrets_redact')
    expect(source).not.toContain('governance.quarantine_on_drop')
    expect(source).not.toContain('quarantined')
    expect(source).not.toContain('原始响应')
    expect(source).not.toContain('RTBF 请求')
    expect(governanceOpsSource).not.toContain('当前接口')
    expect(governanceOpsSource).not.toContain('/governance/datasets/')
    expect(operationResultSource).toContain('查看处理详情')
  })

  it('运维字段和共享数据集选择器具有可访问标签', () => {
    expect(governanceOpsSource).toContain('htmlFor="governance-review-scope"')
    expect(governanceOpsSource).toContain('id="governance-review-scope"')
    expect(governanceOpsSource).toContain('htmlFor="governance-due-window"')
    expect(governanceOpsSource).toContain('id="governance-due-window"')
    expect(datasetSelectSource).toContain('<Label htmlFor={selectId}')
    expect(datasetSelectSource).toContain('<SelectTrigger id={selectId}')
  })

  it('数据集选择器区分失败、空列表与正常结果', () => {
    expect(datasetSelectSource).toContain('error, refreshDatasets')
    expect(datasetSelectSource).toContain('数据集加载失败')
    expect(datasetSelectSource).toContain('重新加载')
    expect(datasetSelectSource).toContain('暂无可用数据集')
  })
})
