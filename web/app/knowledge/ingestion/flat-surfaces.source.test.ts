import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const operationSource = readFileSync(
  resolve(__dirname, 'operation-page-client.tsx'),
  'utf8'
)
const viewSwitchSource = readFileSync(
  resolve(__dirname, 'view-switch.tsx'),
  'utf8'
)
const executionMonitorSource = readFileSync(
  resolve(__dirname, 'page-client.tsx'),
  'utf8'
)
const executionMonitorLoadingSource = readFileSync(
  resolve(__dirname, 'components/loading-wireframe.tsx'),
  'utf8'
)
const salesPanelHeaderSource = readFileSync(
  resolve(__dirname, 'components/sales-panel-header.tsx'),
  'utf8'
)
const presentationSource = readFileSync(
  resolve(__dirname, 'presentation.ts'),
  'utf8'
)
const ingestionDetailSource = readFileSync(
  resolve(__dirname, '../../../components/ingestion/ingestion-detail-dialog.tsx'),
  'utf8'
)
const governanceSource = readFileSync(
  resolve(__dirname, '../../../components/data-governance-panel.tsx'),
  'utf8'
)
const pipelineRailSource = readFileSync(
  resolve(__dirname, '../../../components/workbench/pipeline-rail.tsx'),
  'utf8'
)
const workflowStepperSource = readFileSync(
  resolve(__dirname, '../../../components/ui/ingestion-workflow-stepper.tsx'),
  'utf8'
)
const knowledgeOpsHeroSource = readFileSync(
  resolve(__dirname, '../../../components/ui/knowledge-ops-hero.tsx'),
  'utf8'
)

describe('入库与数据治理扁平化视觉契约', () => {
  it('入库操作页复用统一页头并移除装饰性表面', () => {
    expect(operationSource).toContain('<KnowledgeOpsHero')
    expect(operationSource).toContain('eyebrow={null}')
    expect(operationSource).toContain('badge={null}')
    expect(operationSource).not.toContain('gradient')
    expect(operationSource).not.toContain('backdrop-blur')
    expect(operationSource).not.toContain('rounded-[')
    expect(operationSource).not.toContain('shadow-[')
  })

  it('入库视图切换保持紧凑分段控件样式', () => {
    expect(viewSwitchSource).toContain('rounded-md border border-border bg-muted/40')
    expect(viewSwitchSource).toContain("? 'bg-background text-primary'")
    expect(viewSwitchSource).not.toContain('rounded-2xl')
    expect(viewSwitchSource).not.toContain('backdrop-blur')
  })

  it('统一页头在窄屏内容增长时不被压缩裁切', () => {
    expect(knowledgeOpsHeroSource).toContain(
      'flex min-w-0 shrink-0 flex-col gap-4'
    )
  })

  it('数据治理页关闭重复标签并移除装饰背景', () => {
    expect(governanceSource).toContain('data-governance-empty-workbench="true"')
    expect(governanceSource).toContain('eyebrow={null}')
    expect(governanceSource).toContain('badge={null}')
    expect(governanceSource).not.toContain('/grid.svg')
    expect(governanceSource).not.toContain('conic-gradient')
    expect(governanceSource).not.toContain('radial-gradient')
    expect(governanceSource).not.toContain('backdrop-blur')
    expect(governanceSource).not.toContain('rounded-[')
    expect(governanceSource).toContain(
      'items-start justify-start overflow-y-auto'
    )
  })

  it('入库流程在移动端保持四步可见', () => {
    expect(pipelineRailSource).toContain("className={compact ? 'min-w-max' : 'w-full min-w-0'}")
    expect(pipelineRailSource).not.toContain('rounded-full')
    expect(pipelineRailSource).not.toContain('shadow-[')
    expect(workflowStepperSource).toContain("compact ? 'gap-2' : 'w-full min-w-0 gap-1'")
    expect(workflowStepperSource).not.toContain('min-w-[640px]')
    expect(workflowStepperSource).not.toContain('linear-gradient')
  })

  it('执行监控页头使用纯色背景和中文状态标签', () => {
    expect(executionMonitorSource).toContain(
      "const INGESTION_BACKGROUND_CLASS = 'bg-background'"
    )
    expect(executionMonitorSource).toContain(
      "'relative overflow-hidden rounded-md border border-border bg-background'"
    )
    expect(executionMonitorSource).toContain('敏感数据策略')
    expect(executionMonitorSource).not.toContain('rounded-[28px]')
    expect(executionMonitorSource).not.toContain('Sensitive Data Policy')
  })

  it('执行监控在移动端保留范围选择并避免任务表裁切', () => {
    expect(executionMonitorSource).toContain('aria-label="选择监控数据集"')
    expect(executionMonitorSource).toContain(
      'data-execution-monitor-workspace="true"'
    )
    expect(executionMonitorSource).toContain(
      'overflow-x-auto rounded-md border border-border'
    )
    expect(executionMonitorSource).toContain('min-w-[860px]')
    expect(executionMonitorSource).toContain(
      "'absolute left-0 top-6 z-40 hidden h-9"
    )
    expect(executionMonitorSource).not.toContain(
      'opacity-0 hover:opacity-100 focus-visible:opacity-100'
    )
  })

  it('执行监控加载态与详情抽屉使用扁平表面', () => {
    expect(executionMonitorLoadingSource).not.toContain('rounded-[')
    expect(executionMonitorLoadingSource).not.toContain('rounded-full')
    expect(ingestionDetailSource).not.toContain('rounded-2xl')
    expect(ingestionDetailSource).not.toContain('rounded-xl')
    expect(ingestionDetailSource).not.toContain('shadow-strong')
    expect(ingestionDetailSource).not.toContain('shadow-inner')
    expect(ingestionDetailSource).not.toContain('shadow-sm')
  })

  it('销售预检使用可读字号、扁平面板和窄屏表格', () => {
    expect(executionMonitorSource).toContain('预检摘要')
    expect(executionMonitorSource).toContain('min-w-[720px]')
    expect(executionMonitorSource).toContain('min-w-[680px]')
    expect(executionMonitorSource).not.toContain('radial-gradient')
    expect(executionMonitorSource).not.toContain('rounded-[')
    expect(executionMonitorSource).not.toContain('shadow-[')
    expect(executionMonitorSource).not.toMatch(/text-\[(?:7|8|9|10|11)px\]/)
    expect(presentationSource).toContain("'rounded-md border border-border bg-card'")
  })

  it('销售预检面板只在操作可用时显示操作入口', () => {
    expect(salesPanelHeaderSource).toContain('actionLabel && onAction')
    expect(salesPanelHeaderSource).not.toMatch(/text-\[(?:7|8|9|10|11)px\]/)
  })
})
