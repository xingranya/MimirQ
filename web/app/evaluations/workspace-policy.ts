export type EvaluationWorkspaceTab = 'conversation' | 'regression' | 'queryset_health'

type EvaluationRefreshActions = {
  refreshConversations: () => Promise<unknown>
  refreshRuns: () => Promise<unknown>
  invalidateEvaluations: () => Promise<unknown>
}

export async function refreshEvaluationWorkspaceData(
  activeTab: EvaluationWorkspaceTab,
  actions: EvaluationRefreshActions
): Promise<void> {
  if (activeTab === 'conversation') {
    await Promise.all([actions.refreshConversations(), actions.refreshRuns()])
    return
  }

  await actions.invalidateEvaluations()
}

export function shouldShowConversationSummary(activeTab: EvaluationWorkspaceTab): boolean {
  return activeTab === 'conversation'
}
