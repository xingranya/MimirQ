/** 设置页一级任务分组定义。 */
export type SettingsSectionDefinition = {
  id: string
  label: string
  hint: string
  keywords: readonly string[]
}

/** 设置页固定使用的五个任务分组。 */
export const SETTINGS_SECTIONS: readonly SettingsSectionDefinition[] = [
  {
    id: 'settings-runtime',
    label: '运行状态',
    hint: '服务状态与运行控制',
    keywords: ['系统状态', '后端', '运行控制', '聊天', '缓存', '安全', '流程编排'],
  },
  {
    id: 'settings-models',
    label: '模型与服务',
    hint: '模型供应商与外部服务',
    keywords: ['模型', 'LLM', 'Embedding', 'Rerank', '对象存储', 'MinIO', 'S3', 'Dify'],
  },
  {
    id: 'settings-knowledge',
    label: '知识处理',
    hint: '解析、采集、治理与行业规则',
    keywords: ['解析器', 'MinerU', 'Marker', 'URL', '网页采集', '数据治理', 'PII', '行业规则'],
  },
  {
    id: 'settings-retrieval',
    label: '检索与生成',
    hint: '检索、排序与生成策略',
    keywords: ['RAG', '检索', '召回', '生成', '功能开关', '知识图谱', 'LTR', '排序模型'],
  },
  {
    id: 'settings-platform',
    label: '平台、权限与可观测性',
    hint: '界面、权限、监控与审计',
    keywords: ['前端偏好', '导航权限', '用户入口', '可观测性', '监控', '审计', '诊断'],
  },
] as const
