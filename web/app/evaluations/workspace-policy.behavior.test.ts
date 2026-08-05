import { describe, expect, it, vi } from 'vitest'

import { refreshEvaluationWorkspaceData, shouldShowConversationSummary } from './workspace-policy'

function createRefreshActions() {
  return {
    refreshConversations: vi.fn().mockResolvedValue(undefined),
    refreshRuns: vi.fn().mockResolvedValue(undefined),
    invalidateEvaluations: vi.fn().mockResolvedValue(undefined),
  }
}

describe('评测工作区刷新策略', () => {
  it('对话评测只刷新会话和运行记录', async () => {
    const actions = createRefreshActions()

    await refreshEvaluationWorkspaceData('conversation', actions)

    expect(actions.refreshConversations).toHaveBeenCalledOnce()
    expect(actions.refreshRuns).toHaveBeenCalledOnce()
    expect(actions.invalidateEvaluations).not.toHaveBeenCalled()
  })

  it.each(['regression', 'queryset_health'] as const)(
    '%s 页签使全部评测查询失效',
    async (activeTab) => {
      const actions = createRefreshActions()

      await refreshEvaluationWorkspaceData(activeTab, actions)

      expect(actions.invalidateEvaluations).toHaveBeenCalledOnce()
      expect(actions.refreshConversations).not.toHaveBeenCalled()
      expect(actions.refreshRuns).not.toHaveBeenCalled()
    }
  )

  it('仅在对话评测页签显示会话统计', () => {
    expect(shouldShowConversationSummary('conversation')).toBe(true)
    expect(shouldShowConversationSummary('regression')).toBe(false)
    expect(shouldShowConversationSummary('queryset_health')).toBe(false)
  })
})
