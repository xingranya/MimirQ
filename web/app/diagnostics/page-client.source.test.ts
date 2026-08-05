import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.resolve(__dirname, 'page-client.tsx'), 'utf8')

describe('诊断中心页面源码契约', () => {
  it('保留服务状态和依赖诊断链路', () => {
    expect(source).toContain('useBackendHealth')
    expect(source).toContain('useBackendMetaDetails')
    expect(source).toContain('observabilityApi.getDepsDiagnosticsSnapshot')
    expect(source).toContain("fetch(`${API_V1_BASE_URL}/health/ready`")
    expect(source).toContain('onlineQualityQuery.refetch()')
  })

  it('保留三类手动诊断及其独立状态', () => {
    expect(source).toContain('ragApi.promptPreview')
    expect(source).toContain('observabilityApi.getEmbeddingDriftSnapshot')
    expect(source).toContain('observabilityApi.runPerfSuite')
    expect(source).toContain('probeRunning')
    expect(source).toContain('driftRunning')
    expect(source).toContain('perfSuiteRunning')
    expect(source).toContain('probeError')
    expect(source).toContain('driftError')
    expect(source).toContain('perfSuiteError')
    expect(source).not.toContain('setProbeResult(null)\n    try')
    expect(source).not.toContain('setDriftSnapshot(null)\n    try')
    expect(source).not.toContain('setPerfSuiteResult(null)\n    try')
  })

  it('区分请求失败与空数据，并提供局部重试', () => {
    expect(source).toContain('failedStatusLabels')
    expect(source).toContain('title="部分诊断状态加载失败"')
    expect(source).toContain('datasetsLoadError')
    expect(source).toContain('documentsLoadError')
    expect(source).toContain('datasetsQuery.refetch()')
    expect(source).toContain('documentsQuery.refetch()')
    expect(source).not.toContain('return await observabilityApi.getDepsDiagnosticsSnapshot()')
  })

  it('按后端契约限制漂移和性能参数', () => {
    expect(source).toContain('DIAGNOSTIC_PARAMETER_LIMITS.driftSample')
    expect(source).toContain('DIAGNOSTIC_PARAMETER_LIMITS.driftThreshold')
    expect(source).toContain('DIAGNOSTIC_PARAMETER_LIMITS.perfIterations')
    expect(source).toContain('DIAGNOSTIC_PARAMETER_LIMITS.perfTimeout')
    expect(source).toContain('valueAsNumber')
  })

  it('保留数据集、文档和诊断维度选择', () => {
    expect(source).toContain('datasetApi.listAll')
    expect(source).toContain('documentApi.list')
    expect(source).toContain('toggleDocument')
    expect(source).toContain('toggleDimension')
    expect(source).toContain('aria-pressed={selected}')
  })

  it('使用清晰中文并收起技术明细', () => {
    expect(source).toContain('运行检索预览')
    expect(source).toContain('提示词令牌')
    expect(source).toContain('对象存储')
    expect(source).toContain('缓存服务')
    expect(source).toContain('查看原始诊断数据')
    expect(source).not.toContain('RAG 预览')
    expect(source).not.toContain('提示词 token')
    expect(source).not.toContain('后端建议')
  })

  it('移除教程卡片和旧式装饰', () => {
    expect(source).not.toContain('DiagnosticUseGuide')
    expect(source).not.toContain('backdrop-blur')
    expect(source).not.toContain('linear-gradient')
    expect(source).not.toContain('rounded-[')
    expect(source).not.toMatch(/rounded-(?:xl|2xl|3xl|full)/)
    expect(source).not.toContain('shadow-[')
    expect(source).not.toMatch(/text-\[(?:9|10|11)px\]/)
  })
})
