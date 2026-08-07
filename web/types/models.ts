/** 模型服务配置类型。 */

export type ProviderCategory = 'model' | 'embedding' | 'reranker'

export interface ModelProvider {
  id: string
  name: string
  description: string
  icon: string
  color: string
  category: ProviderCategory
  isConfigured: boolean
  models: ModelConfig[]
  config?: ProviderConfig
}

export interface ModelConfig {
  id: string
  name: string
  displayName: string
  type: 'chat' | 'embedding' | 'reranker' | 'image' | 'audio'
  contextWindow?: number
  maxTokens?: number
  pricing?: {
    input: number
    output: number
  }
}

export interface ProviderConfig {
  apiKey?: string
  apiBase?: string
  model?: string
  organizationId?: string
  projectId?: string
  temperature?: number
  timeout?: number
}

type ProviderDefinition = Omit<ModelProvider, 'isConfigured' | 'models'>

function provider(definition: ProviderDefinition): ModelProvider {
  return {
    ...definition,
    isConfigured: false,
    models: [],
  }
}

/**
 * 模型由服务端实时发现，不在前端维护容易过期的模型版本清单。
 * 用户仍可在配置弹窗中手动填写服务未公开列出的模型名称。
 */
export const MODEL_PROVIDERS: ModelProvider[] = [
  provider({
    id: 'custom',
    name: '自定义兼容服务',
    description: '接入自建或第三方 OpenAI 兼容服务',
    icon: 'openai',
    color: 'slate',
    category: 'model',
  }),
  provider({
    id: 'openai',
    name: 'OpenAI',
    description: 'OpenAI 官方模型服务',
    icon: 'openai',
    color: 'emerald',
    category: 'model',
  }),
  provider({
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek 官方模型服务',
    icon: 'deepseek',
    color: 'blue',
    category: 'model',
  }),
  provider({
    id: 'zhipu',
    name: '智谱 AI',
    description: '智谱开放平台模型服务',
    icon: 'zhipu',
    color: 'purple',
    category: 'model',
  }),
  provider({
    id: 'qwen',
    name: '通义千问',
    description: '阿里云百炼模型服务',
    icon: 'qwen',
    color: 'sky',
    category: 'model',
  }),
  provider({
    id: 'moonshot',
    name: 'Moonshot AI',
    description: 'Moonshot 官方模型服务',
    icon: 'moonshot',
    color: 'violet',
    category: 'model',
  }),
  provider({
    id: 'ollama',
    name: 'Ollama',
    description: '本地模型服务与已安装模型',
    icon: 'ollama',
    color: 'gray',
    category: 'model',
  }),
  provider({
    id: 'ark',
    name: '火山引擎',
    description: '火山方舟模型服务',
    icon: 'ark',
    color: 'blue',
    category: 'model',
  }),
  provider({
    id: 'lingyiwanwu',
    name: '零一万物',
    description: '零一万物模型服务',
    icon: 'lingyiwanwu',
    color: 'purple',
    category: 'model',
  }),
  provider({
    id: 'qianfan',
    name: '百度千帆',
    description: '百度千帆模型服务',
    icon: 'qianfan',
    color: 'blue',
    category: 'model',
  }),
  provider({
    id: 'siliconflow',
    name: '硅基流动',
    description: '硅基流动模型服务',
    icon: 'siliconflow',
    color: 'indigo',
    category: 'model',
  }),
  provider({
    id: 'openrouter',
    name: 'OpenRouter',
    description: '多供应商统一模型网关',
    icon: 'openrouter',
    color: 'slate',
    category: 'model',
  }),
  provider({
    id: 'together',
    name: 'Together AI',
    description: '开源模型云端推理服务',
    icon: 'together',
    color: 'orange',
    category: 'model',
  }),
  provider({
    id: 'custom-embedding',
    name: '自定义向量服务',
    description: '接入自建或第三方 OpenAI 兼容向量服务',
    icon: 'openai',
    color: 'slate',
    category: 'embedding',
  }),
  provider({
    id: 'openai-embedding',
    name: 'OpenAI Embedding',
    description: 'OpenAI 官方向量模型服务',
    icon: 'openai',
    color: 'emerald',
    category: 'embedding',
  }),
  provider({
    id: 'qwen-embedding',
    name: 'Qwen Embedding',
    description: '阿里云百炼向量模型服务',
    icon: 'qwen',
    color: 'sky',
    category: 'embedding',
  }),
  provider({
    id: 'local-embedding',
    name: '本地 Embedding',
    description: '本地向量模型与 OpenAI 兼容服务',
    icon: 'local-embedding',
    color: 'green',
    category: 'embedding',
  }),
  provider({
    id: 'local-reranker',
    name: '本地 Reranker',
    description: '本地 BGE 重排序服务',
    icon: 'reranker',
    color: 'amber',
    category: 'reranker',
  }),
  provider({
    id: 'cohere-reranker',
    name: 'Cohere Reranker',
    description: 'Cohere 云端重排序服务',
    icon: 'cohere-reranker',
    color: 'violet',
    category: 'reranker',
  }),
  provider({
    id: 'jina-reranker',
    name: 'Jina Reranker',
    description: 'Jina AI 云端重排序服务',
    icon: 'jina-reranker',
    color: 'blue',
    category: 'reranker',
  }),
]
