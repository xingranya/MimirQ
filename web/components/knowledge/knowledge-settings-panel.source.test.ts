import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const panelSource = readFileSync(
  resolve(__dirname, 'knowledge-settings-panel.tsx'),
  'utf8'
)
const catalogSource = readFileSync(
  resolve(__dirname, '../../i18n/messages/zh-CN/knowledge.ts'),
  'utf8'
)

describe('知识库参数界面契约', () => {
  it('使用扁平样式和可读字号', () => {
    expect(panelSource).not.toContain('bg-[linear-gradient')
    expect(panelSource).not.toContain('backdrop-blur')
    expect(panelSource).not.toContain('rounded-[18px]')
    expect(panelSource).not.toContain('rounded-2xl')
    expect(panelSource).not.toContain('shadow-[')
    expect(panelSource).not.toContain('text-[9px]')
    expect(panelSource).not.toContain('text-[10px]')
    expect(panelSource).not.toContain('text-[11px]')
  })

  it('只展示能够真实保存的设置', () => {
    expect(panelSource).toContain('运行时检索模式由对话设置、检索方案和请求参数决定')
    expect(panelSource).not.toContain('retrievalModeView')
    expect(panelSource).not.toContain('estimatedRecall')
    expect(panelSource).not.toContain('当前配置预估效果')
    expect(panelSource).not.toContain('噪声率')
  })

  it('保留作用域、保存和检索测试流程', () => {
    expect(panelSource).toContain('datasetApi.update(selectedDatasetId')
    expect(panelSource).toContain('settingsApi.update(draftConfig)')
    expect(panelSource).toContain('queryClient.invalidateQueries')
    expect(panelSource).toContain('onClick={onGoToRetrievalTest}')
    expect(panelSource).toContain('确认更改向量模型？')
  })

  it('连接器任务在触屏和中文环境下可直接操作', () => {
    expect(panelSource).toContain('aria-label="自动刷新任务"')
    expect(panelSource).toContain("toast.success('已复制任务 ID')")
    expect(panelSource).toContain('已完成 {progressPct}%')
    expect(panelSource).toContain('错误详情')
    expect(panelSource).not.toContain('group-hover:opacity-100')
    expect(panelSource).not.toContain('Quiet Environment')
    expect(catalogSource).toContain("copyRunIdTitle: '复制任务 ID'")
  })
})
