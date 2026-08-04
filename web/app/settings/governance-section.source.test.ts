import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(__dirname, '_sections/governance-section.tsx'),
  'utf8'
)

describe('个人数据删除安全门禁', () => {
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
})
