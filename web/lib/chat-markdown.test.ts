import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { describe, expect, it } from 'vitest'

import { normalizeChatMarkdown } from './chat-markdown'

describe('对话 Markdown 规范化', () => {
  it('将紧连的中文编号段落转换为标准有序列表', () => {
    const source =
      '主要信息如下：1.**赛事基本赛制**：每局 5 个订单。（来源：比赛方案）2.**场地与设施**：场地为 10m×10m。（来源：比赛方案）综上，文档覆盖赛事流程。'

    expect(normalizeChatMarkdown(source)).toBe(
      '主要信息如下：\n\n1. **赛事基本赛制**：每局 5 个订单。（来源：比赛方案）\n\n2. **场地与设施**：场地为 10m×10m。（来源：比赛方案）\n\n综上，文档覆盖赛事流程。'
    )

    const rendered = renderToStaticMarkup(
      createElement(
        ReactMarkdown,
        { remarkPlugins: [remarkGfm] },
        normalizeChatMarkdown(source)
      )
    )
    expect(rendered).toContain('<ol>')
    expect(rendered.match(/<li>/g)).toHaveLength(2)
  })

  it('补齐标题、列表标记与强调文本之间的空格', () => {
    expect(normalizeChatMarkdown('##标题\n-**重点**：内容')).toBe(
      '## 标题\n- **重点**：内容'
    )
  })

  it('拆分紧跟在中文句末的无序列表项', () => {
    const source =
      '-**比赛规则与任务流程**：每局下发 5 个订单。-**场景与商品配置变化**：新版场景包含 45 个货位。'
    const normalized = normalizeChatMarkdown(source)

    expect(normalized).toBe(
      '- **比赛规则与任务流程**：每局下发 5 个订单。\n\n- **场景与商品配置变化**：新版场景包含 45 个货位。'
    )

    const rendered = renderToStaticMarkup(
      createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, normalized)
    )
    expect(rendered.match(/<li>/g)).toHaveLength(2)
  })

  it('不改写版本号、小数、行内代码和围栏代码块', () => {
    const source = [
      '版本 V2.0，阈值 0.50，示例 `1.**原样**：值`。',
      '```text',
      '1.**代码内容**：保持原样',
      '```',
    ].join('\n')

    expect(normalizeChatMarkdown(source)).toBe(source)
  })

  it('流式代码块尚未闭合时仍保持代码内容原样', () => {
    const source = '```markdown\n1.**仍在生成**：内容'
    expect(normalizeChatMarkdown(source)).toBe(source)
  })
})
