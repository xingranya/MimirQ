// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/settings/settings-switch', () => ({
  SettingsSwitch: ({
    checked,
    onCheckedChange,
    'aria-label': ariaLabel,
  }: {
    checked: boolean
    onCheckedChange: (checked: boolean) => void
    'aria-label': string
  }) => (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={checked}
      onClick={() => onCheckedChange(!checked)}
    />
  ),
}))

import { ObservabilitySection } from './observability-section'

const DEFAULT_OBSERVABILITY = {
  tool_call_log_enabled: false,
  tool_call_log_include_preview: false,
  tool_call_log_max_preview_chars: 500,
  agent_log_enabled: false,
  agent_log_include_execution_path: false,
  agent_log_max_preview_chars: 500,
  metrics_log_enabled: false,
  metrics_log_include_text: false,
}

describe('可观测性配置区', () => {
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

  it('主开关关闭时隐藏附加字段', () => {
    act(() =>
      root.render(
        <ObservabilitySection
          observability={{
            ...DEFAULT_OBSERVABILITY,
          }}
          updateObservability={vi.fn()}
        />
      )
    )

    expect(container.textContent).toContain('工具调用记录')
    expect(container.textContent).toContain('任务运行记录')
    expect(container.textContent).toContain('问答过程指标')
    expect(container.querySelectorAll('input[type="number"]')).toHaveLength(0)
    expect(container.textContent).not.toContain('日志访问权限')
  })

  it('字符上限按后端范围收敛', () => {
    const updateObservability = vi.fn()
    act(() =>
      root.render(
        <ObservabilitySection
          observability={{
            ...DEFAULT_OBSERVABILITY,
            tool_call_log_enabled: true,
            tool_call_log_include_preview: true,
            tool_call_log_max_preview_chars: 500,
          }}
          updateObservability={updateObservability}
        />
      )
    )

    const input = container.querySelector<HTMLInputElement>(
      '#tool-call-preview-limit'
    )
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )?.set
      setter?.call(input, '9000')
      input?.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(updateObservability).toHaveBeenCalledWith({
      tool_call_log_max_preview_chars: 5000,
    })
  })

  it('字符上限输入与可见标签关联', () => {
    act(() =>
      root.render(
        <ObservabilitySection
          observability={{
            ...DEFAULT_OBSERVABILITY,
            tool_call_log_enabled: true,
            tool_call_log_include_preview: true,
            agent_log_enabled: true,
          }}
          updateObservability={vi.fn()}
        />
      )
    )

    const toolLabel = container.querySelector<HTMLLabelElement>(
      'label[for="tool-call-preview-limit"]'
    )
    const taskLabel = container.querySelector<HTMLLabelElement>(
      'label[for="task-error-preview-limit"]'
    )

    expect(toolLabel?.textContent).toContain('结果摘要字符上限')
    expect(toolLabel?.control?.id).toBe('tool-call-preview-limit')
    expect(taskLabel?.textContent).toContain('错误摘要字符上限')
    expect(taskLabel?.control?.id).toBe('task-error-preview-limit')
  })

  it('记录问答原文时显示隐私提醒', () => {
    act(() =>
      root.render(
        <ObservabilitySection
          observability={{
            ...DEFAULT_OBSERVABILITY,
            metrics_log_enabled: true,
            metrics_log_include_text: true,
          }}
          updateObservability={vi.fn()}
        />
      )
    )

    expect(container.textContent).toContain('保存在服务器日志中')
    expect(container.textContent).toContain('个人信息或业务内容')
    expect(container.textContent).toContain('日志访问权限和保留期限')
  })
})
