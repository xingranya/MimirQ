/** 设置页二级配置区定义。 */
export type SettingsSubsectionDefinition = {
  id: string
  label: string
  keywords: readonly string[]
  advanced?: boolean
}

/** 设置页一级任务分组定义。 */
export type SettingsSectionDefinition = {
  id: string
  label: string
  hint: string
  keywords: readonly string[]
  subsections: readonly SettingsSubsectionDefinition[]
}

export type SettingsSectionMatch = {
  section: SettingsSectionDefinition
  matchedSubsectionIds: readonly string[]
}

/** 设置页固定使用的五个任务分组。 */
export const SETTINGS_SECTIONS: readonly SettingsSectionDefinition[] = [
  {
    id: 'settings-runtime',
    label: '运行状态',
    hint: '服务状态与运行控制',
    keywords: ['运行', '服务', '后端', '健康检查'],
    subsections: [
      {
        id: 'system-status',
        label: '系统状态',
        keywords: ['数据库', '向量库', 'Milvus', '大语言模型', 'Embedding', '解析器', '版本'],
      },
      {
        id: 'runtime-controls',
        label: '运行控制',
        keywords: [
          '聊天',
          '超时',
          '流式',
          'SSE',
          '心跳',
          '缓存',
          'TTL',
          '安全',
          'LangGraph',
          '流程编排',
        ],
        advanced: true,
      },
    ],
  },
  {
    id: 'settings-models',
    label: '模型与服务',
    hint: '模型供应商与外部服务',
    keywords: ['模型', '供应商', '外部服务'],
    subsections: [
      {
        id: 'model-providers',
        label: '模型接入',
        keywords: [
          'LLM',
          '大语言模型',
          'Embedding',
          '嵌入模型',
          'Ollama',
          'OpenAI',
          'API Base',
          'API Key',
          '温度',
          '重试',
          'Reranker',
          '重排序',
        ],
      },
      {
        id: 'object-storage',
        label: '对象存储',
        keywords: ['MinIO', 'S3', '存储桶', 'Access Key', 'Secret Key', '文档存储', '图片大小'],
        advanced: true,
      },
      {
        id: 'dify-integration',
        label: 'Dify 接入',
        keywords: ['外部知识库', '知识绑定', '租户', '账号', 'API 密钥', '检索上限'],
        advanced: true,
      },
    ],
  },
  {
    id: 'settings-knowledge',
    label: '知识处理',
    hint: '解析、采集、治理与行业规则',
    keywords: ['解析', '采集', '治理', '知识加工'],
    subsections: [
      {
        id: 'parser-services',
        label: '高级解析',
        keywords: [
          '解析器',
          'MinerU',
          'MagicPDF',
          'ETL4LLM',
          'Marker',
          'PaddleOCR-VL',
          'TextIn',
          '本地服务',
          '云端 API',
        ],
        advanced: true,
      },
      {
        id: 'feature-flags',
        label: '功能开关',
        keywords: ['知识图谱', 'DeepDoc', 'Docling', 'MarkItDown', 'LlamaIndex', '解析能力'],
        advanced: true,
      },
      {
        id: 'governance',
        label: '数据治理',
        keywords: ['PII', '个人信息', '密钥脱敏', '隔离区', '删除请求', '保留期限'],
      },
      {
        id: 'url-ingest',
        label: 'URL 采集',
        keywords: ['网页采集', '域名', '并发', '抓取', '正文提取'],
        advanced: true,
      },
      {
        id: 'industry-rules',
        label: '行业规则',
        keywords: ['规则集', 'JSON', '规则预览', '分类', '模板'],
        advanced: true,
      },
    ],
  },
  {
    id: 'settings-retrieval',
    label: '检索与生成',
    hint: '检索、排序与生成策略',
    keywords: ['检索', '排序', '生成', 'RAG'],
    subsections: [
      {
        id: 'rag',
        label: 'RAG 配置',
        keywords: [
          '召回数量',
          '相似度阈值',
          '混合检索',
          '重排序',
          '上下文',
          '分块参数',
          'HyDE',
          'GraphRAG',
        ],
      },
      {
        id: 'ltr-models',
        label: 'LTR 模型',
        keywords: ['Learning to Rank', '排序模型', '注册模型', '激活模型', '模型清单', '回滚'],
        advanced: true,
      },
    ],
  },
  {
    id: 'settings-platform',
    label: '平台、权限与可观测性',
    hint: '界面、权限、监控与审计',
    keywords: ['平台', '权限', '监控', '界面'],
    subsections: [
      {
        id: 'frontend-preferences',
        label: '前端偏好',
        keywords: ['解析方式', '切块策略', '入库管线', '浏览器设置'],
      },
      {
        id: 'navigation-visibility',
        label: '导航权限',
        keywords: ['用户入口', '菜单可见性', '普通成员', '高级功能'],
        advanced: true,
      },
      {
        id: 'observability',
        label: '可观测性',
        keywords: ['监控', '审计', '诊断', 'Trace', '指标', '工具调用', '任务追踪', '采样'],
        advanced: true,
      },
    ],
  },
] as const

function includesSettingsSearchTerm(values: readonly string[], query: string): boolean {
  return values.some((value) => value.toLocaleLowerCase('zh-CN').includes(query))
}

/** 按一级任务和二级配置词查找设置分组。 */
export function findSettingsSectionMatches(query: string): SettingsSectionMatch[] {
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  if (!normalizedQuery) {
    return SETTINGS_SECTIONS.map((section) => ({ section, matchedSubsectionIds: [] }))
  }

  const matches: SettingsSectionMatch[] = []
  for (const section of SETTINGS_SECTIONS) {
    const sectionMatches = includesSettingsSearchTerm(
      [section.label, section.hint, ...section.keywords],
      normalizedQuery
    )
    const matchedSubsectionIds = section.subsections
      .filter((subsection) =>
        includesSettingsSearchTerm([subsection.label, ...subsection.keywords], normalizedQuery)
      )
      .map((subsection) => subsection.id)

    if (sectionMatches || matchedSubsectionIds.length > 0) {
      matches.push({ section, matchedSubsectionIds })
    }
  }
  return matches
}
