import type {
  DifyExternalKnowledgeConfig,
  MinIOConfig,
  RAGConfig,
  SystemSettings,
} from '@/lib/api'

export type SettingsValidationIssue = {
  section: 'Dify 外部知识库' | '对象存储' | '检索与生成'
  message: string
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function issue(
  section: SettingsValidationIssue['section'],
  message: string
): SettingsValidationIssue {
  return { section, message }
}

function configuredSecret(value: string): boolean {
  return Boolean(String(value || '').trim())
}

function datasetIdsFromBinding(value: unknown): string[] | null {
  if (typeof value === 'string') {
    const datasetId = value.trim()
    return datasetId ? [datasetId] : null
  }

  if (Array.isArray(value)) {
    if (value.length === 0 || value.some((item) => typeof item !== 'string' || !item.trim())) {
      return null
    }
    return value.map((item) => item.trim())
  }

  if (!value || typeof value !== 'object') return null
  const binding = value as Record<string, unknown>
  return datasetIdsFromBinding(
    binding.dataset_ids ?? binding.datasets ?? binding.dataset_id
  )
}

function hasValidDatasetBinding(value: unknown): boolean {
  const datasetIds = datasetIdsFromBinding(value)
  return Boolean(
    datasetIds?.length && datasetIds.every((datasetId) => UUID_PATTERN.test(datasetId))
  )
}

export function validateDifyExternalKnowledgeConfig(
  config: DifyExternalKnowledgeConfig
): SettingsValidationIssue | null {
  if (!config.enabled) return null

  const endpointPath = String(config.endpoint_path || '').trim()
  if (
    !endpointPath.startsWith('/') ||
    endpointPath.startsWith('//') ||
    /\s|[?#]/.test(endpointPath)
  ) {
    return issue(
      'Dify 外部知识库',
      '接入路径必须是以 / 开头的站内路径，不能包含域名、空格、查询参数或锚点。'
    )
  }
  if (!configuredSecret(config.api_keys)) {
    return issue('Dify 外部知识库', '请填写 API Key 后再启用接入。')
  }
  if (config.tenant_id && !UUID_PATTERN.test(config.tenant_id.trim())) {
    return issue('Dify 外部知识库', '租户 ID 格式不正确，请填写完整的 UUID。')
  }
  if (!String(config.account_id || '').trim()) {
    return issue('Dify 外部知识库', '请填写用于执行检索的服务账号。')
  }
  if (!Number.isInteger(config.top_k_max) || config.top_k_max < 1 || config.top_k_max > 200) {
    return issue('Dify 外部知识库', '最大返回条数必须是 1 到 200 之间的整数。')
  }

  const rawMap = String(config.knowledge_map_json || '').trim()
  if (!rawMap) {
    return issue('Dify 外部知识库', '请先选择数据集并生成至少一条知识绑定。')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawMap)
  } catch {
    return issue('Dify 外部知识库', '知识绑定不是有效的 JSON，请重新生成绑定。')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return issue('Dify 外部知识库', '知识绑定必须是 knowledge_id 到数据集的 JSON 对象。')
  }

  const bindings = Object.entries(parsed as Record<string, unknown>)
  if (bindings.length === 0) {
    return issue('Dify 外部知识库', '请先选择数据集并生成至少一条知识绑定。')
  }
  if (
    bindings.some(
      ([knowledgeId, value]) =>
        !knowledgeId.trim() || !hasValidDatasetBinding(value)
    )
  ) {
    return issue(
      'Dify 外部知识库',
      '每条知识绑定都要包含 knowledge_id 和至少一个有效的数据集 UUID。'
    )
  }

  return null
}

export function validateMinIOConfig(config: MinIOConfig): SettingsValidationIssue | null {
  if (!config.enabled) {
    return config.documents_enabled
      ? issue('对象存储', '启用文档对象存储前，请先打开 MinIO 对象存储。')
      : null
  }

  const endpoint = String(config.endpoint || '').trim()
  if (!endpoint) {
    return issue('对象存储', '请填写 MinIO Endpoint。')
  }
  if (/\s|:\/\/|[/?#]/.test(endpoint)) {
    return issue(
      '对象存储',
      'Endpoint 只填写主机名和端口，例如 minio:9000，不要包含协议、路径或空格。'
    )
  }

  const bucketName = String(config.bucket_name || '').trim()
  if (!bucketName) {
    return issue('对象存储', '请填写 Bucket 名称。')
  }
  if (/\s|\//.test(bucketName)) {
    return issue('对象存储', 'Bucket 名称不能包含空格或路径分隔符。')
  }
  if (!configuredSecret(config.access_key) || !configuredSecret(config.secret_key)) {
    return issue('对象存储', '请同时填写 Access Key 和 Secret Key。')
  }
  if (
    !Number.isFinite(config.image_max_bytes) ||
    !Number.isInteger(config.image_max_bytes) ||
    config.image_max_bytes < 0
  ) {
    return issue('对象存储', '图片读取上限必须是大于或等于 0 的整数。')
  }

  return null
}

export function validateRagConfig(config: RAGConfig): SettingsValidationIssue | null {
  if (!Number.isInteger(config.chunk_size) || config.chunk_size < 1) {
    return issue('检索与生成', '分块大小必须是大于 0 的整数。')
  }
  if (!Number.isInteger(config.chunk_overlap) || config.chunk_overlap < 0) {
    return issue('检索与生成', '分块重叠必须是大于或等于 0 的整数。')
  }
  if (config.chunk_overlap >= config.chunk_size) {
    return issue('检索与生成', '分块重叠必须小于分块大小。')
  }
  if (!Number.isInteger(config.chunk_min_chars) || config.chunk_min_chars < 0) {
    return issue('检索与生成', '最小分块长度必须是大于或等于 0 的整数。')
  }
  if (!Number.isInteger(config.retrieval_top_k) || config.retrieval_top_k < 1) {
    return issue('检索与生成', '召回数量必须是大于 0 的整数。')
  }
  if (
    !Number.isFinite(config.similarity_threshold) ||
    config.similarity_threshold < 0 ||
    config.similarity_threshold > 1
  ) {
    return issue('检索与生成', '相似度阈值必须在 0 到 1 之间。')
  }
  if (config.enable_reranker && config.reranker_provider === 'none') {
    return issue('检索与生成', '启用重排序时请选择可用的重排服务。')
  }
  if (config.enable_reranker && config.reranker_provider === 'weighted') {
    return issue('检索与生成', '加权重排需要单独配置权重，不能作为系统默认服务。')
  }
  return null
}

export function validateSettingsChanges(
  settings: Partial<SystemSettings>
): SettingsValidationIssue | null {
  if (settings.rag) {
    const ragIssue = validateRagConfig(settings.rag)
    if (ragIssue) return ragIssue
  }

  if (settings.dify_external_knowledge) {
    const difyIssue = validateDifyExternalKnowledgeConfig(
      settings.dify_external_knowledge
    )
    if (difyIssue) return difyIssue
  }

  if (settings.minio) {
    const minioIssue = validateMinIOConfig(settings.minio)
    if (minioIssue) return minioIssue
  }

  return null
}
