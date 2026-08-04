import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workbenchSource = readFileSync(
  resolve(__dirname, 'industry-rules-workbench.tsx'),
  'utf8'
)
const dialogSource = readFileSync(
  resolve(__dirname, '../ui/unsaved-changes-dialog.tsx'),
  'utf8'
)

function sourceBetween(start: string, end: string): string {
  const startIndex = workbenchSource.indexOf(start)
  const endIndex = workbenchSource.indexOf(end, startIndex + start.length)
  expect(startIndex, `未找到 ${start}`).toBeGreaterThanOrEqual(0)
  expect(endIndex, `未找到 ${end}`).toBeGreaterThan(startIndex)
  return workbenchSource.slice(startIndex, endIndex)
}

describe('行业规则草稿保护', () => {
  it('切换、刷新和离开页面共用未保存确认', () => {
    expect(workbenchSource).toContain('useUnsavedNavigationGuard({')
    expect(workbenchSource).toContain("type: 'switch-ruleset'")
    expect(workbenchSource).toContain("type: 'refresh'")
    expect(workbenchSource).toContain('<UnsavedChangesDialog')
    expect(workbenchSource).toContain('discardDisabled={savingRules}')
    expect(dialogSource).toContain('disabled={discardDisabled}')
  })

  it('单分区保存不会完整回填并覆盖其他草稿', () => {
    expect(
      sourceBetween('const saveGlossary', 'const savePatterns')
    ).not.toContain('rulesetDetailQuery.refetch')
    expect(
      sourceBetween('const savePatterns', 'const saveIntents')
    ).not.toContain('rulesetDetailQuery.refetch')
    expect(
      sourceBetween('const saveIntents', 'const exportCurrentRuleset')
    ).not.toContain('rulesetDetailQuery.refetch')
    expect(workbenchSource).toContain(
      'current ? { ...current, glossary: savedFingerprint } : current'
    )
    expect(workbenchSource).toContain(
      'current ? { ...current, patterns: savedFingerprint } : current'
    )
    expect(workbenchSource).toContain(
      'current ? { ...current, intents: savedFingerprint } : current'
    )
    expect(workbenchSource).toContain('queryClient.cancelQueries({')
    expect(workbenchSource).toContain('updateCachedRuleset(ruleset, {')
    expect(workbenchSource).toContain(
      'enabled: Boolean(selectedRuleset.trim()) && !savingRules'
    )
  })

  it('详情加载和刷新期间冻结草稿，预览只接受最后一次响应', () => {
    expect(workbenchSource).toContain(
      'detail.name !== selectedRuleset || hasUnsavedChanges'
    )
    expect(workbenchSource).toContain(
      'savedFingerprints === null || !selectedRuleset.trim() || refreshing'
    )
    expect(workbenchSource).toContain('createLatestAsyncRequest()')
    expect(workbenchSource).toContain("outcome.status === 'stale'")
    expect(workbenchSource).toContain('previewRequests.invalidate()')
    expect(workbenchSource).toContain('setPreviewError(message)')
    expect(workbenchSource).toContain('role="alert"')
  })
})
