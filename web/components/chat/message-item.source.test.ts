import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, 'message-item.tsx'), 'utf8')

describe('对话消息层级源码契约', () => {
  it('思考步骤和完整来源默认折叠', () => {
    expect(source).toContain('const [stepsOpen, setStepsOpen] = useState(false)')
    expect(source).toContain('const [sourcesOpen, setSourcesOpen] = useState(false)')
    expect(source).not.toContain('setStepsOpen(isStreaming)')
    expect(source).toContain('const citationPreviewRows = citationRows.slice(0, 2)')
    expect(source).toContain('onClick={() => setSourcesOpen(true)}')
    expect(source).toContain('open={sourcesOpen}')
  })

  it('消息操作按钮不使用绝对定位覆盖正文', () => {
    expect(source).not.toContain('absolute bottom-2 right-11')
    expect(source).not.toContain("'absolute z-10 rounded-md p-1")
    expect(source).not.toContain('backdrop-blur')
    expect(source).not.toContain('glass-card')
  })

  it('流式内容到达前展示明确的等待状态', () => {
    expect(source).toContain('isStreaming && !message.content')
    expect(source).toContain('正在准备回答…')
  })
})
