// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SystemStatusSection } from './system-status-section'

describe('系统状态区', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('区分服务连接状态和模型配置状态', () => {
    act(() =>
      root.render(
        <SystemStatusSection
          status={{
            database: { connected: true, message: '主数据库连接正常' },
            milvus: { connected: false, message: '向量数据库连接超时' },
            llm: { configured: true, model: 'qwen3:8b' },
            embedding: { configured: false, model: '' },
            parsers: {},
          }}
          backendMeta={null}
        />
      )
    )

    expect(container.textContent).toContain('主数据库')
    expect(container.textContent).toContain('已连接')
    expect(container.textContent).toContain('向量数据库连接超时')
    expect(container.textContent).toContain('未连接')
    expect(container.textContent).toContain('qwen3:8b')
    expect(container.textContent).toContain('已配置')
    expect(container.textContent).toContain('未配置')
  })

  it('默认折叠解析器明细并区分未启用和环境不可用', () => {
    act(() =>
      root.render(
        <SystemStatusSection
          status={{
            database: { connected: true, message: '' },
            milvus: { connected: true, message: '' },
            llm: { configured: true, model: 'qwen3:8b' },
            embedding: { configured: true, model: 'bge-large-zh' },
            parsers: {
              magicpdf: {
                enabled: true,
                available: false,
                message: '本地服务未响应',
              },
              mineru: {
                enabled: false,
                available: false,
                message: '未开启',
              },
              basic: {
                enabled: true,
                available: true,
                message: '可用',
              },
            },
          }}
          backendMeta={null}
        />
      )
    )

    const details = container.querySelector('details')
    expect(details?.hasAttribute('open')).toBe(false)
    expect(container.textContent).toContain('1/3 可用')
    expect(container.textContent).toContain('MagicPDF')
    expect(container.textContent).toContain('环境不可用')
    expect(container.textContent).toContain('MinerU')
    expect(container.textContent).toContain('未启用')
  })
})
