import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const drawerSource = fs.readFileSync(
  path.resolve(__dirname, 'profile-editor-drawer.tsx'),
  'utf8'
)
const ruleStatsSource = fs.readFileSync(
  path.resolve(__dirname, 'clean-preview-rule-stats-panel.tsx'),
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

  it('更新模板时提交加载版本用于冲突检测', () => {
    expect(drawerSource).toContain(
      'expected_updated_at: loadedProfile?.updated_at || undefined'
    )
  })

  it('使用扁平抽屉和面向用户的中文文案', () => {
    expect(drawerSource).toContain('模板设置')
    expect(drawerSource).toContain('效果测试')
    expect(drawerSource).toContain('场景清洗规则')
    expect(drawerSource).toContain('高级配置 JSON')
    expect(drawerSource).not.toMatch(/rounded-(?:xl|2xl|3xl|full)/)
    expect(drawerSource).not.toContain('backdrop-blur')
    expect(drawerSource).not.toContain('linear-gradient')
    expect(drawerSource).not.toMatch(/text-\[(?:9|10|11)(?:\.\d+)?px\]/)
    expect(drawerSource).not.toContain('沙盒测试')
    expect(drawerSource).not.toContain('pipeline_patch 字段')
    expect(drawerSource).not.toContain('调用 clean-preview')
  })

  it('将规则命中结果翻译成中文', () => {
    expect(ruleStatsSource).toContain('命中的清洗规则')
    expect(ruleStatsSource).toContain('共命中')
    expect(ruleStatsSource).toContain('场景清洗规则')
    expect(ruleStatsSource).not.toMatch(/['"`]hits:/)
    expect(ruleStatsSource).not.toMatch(/['"`]source:/)
    expect(ruleStatsSource).not.toMatch(/['"`]flags:/)
    expect(ruleStatsSource).not.toMatch(/['"`]repl:/)
    expect(ruleStatsSource).not.toMatch(/rounded-(?:xl|2xl|3xl|full)/)
    expect(ruleStatsSource).not.toMatch(/text-\[(?:9|10|11)(?:\.\d+)?px\]/)
  })
})
