import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const drawerSource = fs.readFileSync(
  path.resolve(__dirname, 'profile-editor-drawer.tsx'),
  'utf8'
)

describe('治理模板规则编辑器', () => {
  it('输入规则内容时保持规则行挂载', () => {
    expect(drawerSource).toContain('key={`regex-rule-${idx}`}')
    expect(drawerSource).not.toContain(
      "key={[r.pattern || '', r.repl || '', String(r.flags ?? 0)].join('::')}"
    )
  })

  it('关闭抽屉或离开页面前确认未保存修改', () => {
    expect(drawerSource).toContain('governanceProfileDraftFingerprint({')
    expect(drawerSource).toContain('enabled: hasUnsavedChanges')
    expect(drawerSource).toContain('setDiscardConfirmOpen(true)')
    expect(drawerSource).toContain('<UnsavedChangesDialog')
  })

  it('保存前应用尚未提交的高级 JSON', () => {
    expect(drawerSource).toContain(
      'const parsed = parseGovernancePipelinePatchJson(patchJson)'
    )
    expect(drawerSource).toContain('let payloadToSave = payload')
    expect(drawerSource).toContain('payload: payloadToSave')
    expect(drawerSource).toContain('setPipelinePatch(parsed.value)')
  })
})
