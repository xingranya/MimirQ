import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('评测中心视觉与响应式契约', () => {
  const source = fs.readFileSync(path.resolve(__dirname, 'page.tsx'), 'utf8')

  it('保持扁平视觉并移除旧式装饰效果', () => {
    expect(source).not.toContain('backdrop-blur')
    expect(source).not.toContain('linear-gradient')
    expect(source).not.toContain('radial-gradient')
    expect(source).not.toContain('rounded-[')
    expect(source).not.toContain('rounded-xl')
    expect(source).not.toContain('rounded-2xl')
    expect(source).not.toContain('shadow-')
    expect(source).not.toContain('hover:scale')
    expect(source).not.toContain('tracking-[')
  })

  it('在窄屏按需切换参数、结果和运行记录', () => {
    expect(source).toContain(
      "useState<ConversationWorkspaceView>('results')"
    )
    expect(source).toContain("{ id: 'setup', label: '参数'")
    expect(source).toContain("{ id: 'results', label: '结果'")
    expect(source).toContain("{ id: 'runs', label: '记录'")
    expect(source).toContain("setConversationWorkspaceView('results')")
    expect(source).toContain("conversationWorkspaceView === 'setup'")
    expect(source).toContain("conversationWorkspaceView === 'runs'")
  })

  it('保留桌面参数栏和运行记录的独立折叠能力', () => {
    expect(source).toContain("xl:grid-cols-[56px_minmax(0,1fr)_56px]")
    expect(source).toContain("setupRailCollapsed ? 'xl:hidden' : 'xl:flex'")
    expect(source).toContain("runsRailCollapsed ? 'xl:hidden' : 'xl:flex'")
    expect(source).toContain('setSetupRailCollapsed(true)')
    expect(source).toContain('setRunsRailCollapsed(true)')
  })
})
