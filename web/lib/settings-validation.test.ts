import { describe, expect, it } from 'vitest'

import type {
  DifyExternalKnowledgeConfig,
  FeatureFlags,
  MinIOConfig,
  RAGConfig,
  SystemSettings,
} from '@/lib/api'
import {
  validateDifyExternalKnowledgeConfig,
  validateMinIOConfig,
  validateParserServicesConfig,
  validateRagConfig,
  validateSettingsChanges,
} from './settings-validation'

const validDify: DifyExternalKnowledgeConfig = {
  enabled: true,
  api_keys: 'abcd***wxyz',
  tenant_id: '00000000-0000-4000-8000-000000000001',
  account_id: 'system:dify',
  knowledge_map_json: '{"kb_policy":["00000000-0000-4000-8000-000000000001"]}',
  top_k_max: 20,
  endpoint_path: '/api/v1/integrations/dify/retrieval',
}

const validMinIO: MinIOConfig = {
  enabled: true,
  endpoint: 'mimirq-minio:9000',
  access_key: 'mini***cess',
  secret_key: 'mini***cret',
  bucket_name: 'mimirq',
  use_ssl: false,
  documents_enabled: true,
  image_max_bytes: 0,
}

const validRag: RAGConfig = {
  chunk_size: 1000,
  chunk_overlap: 200,
  chunk_min_chars: 30,
  retrieval_top_k: 5,
  similarity_threshold: 0.7,
  default_parser_backend: 'auto',
  default_chunk_strategy: 'langchain_recursive',
  bm25_index_enabled: true,
  enable_reranker: true,
  reranker_provider: 'local_bge_v2_m3',
  reranker_top_n: 20,
  show_image_in_answer: true,
  image_append_max: 3,
}

const disabledFeatureFlags: FeatureFlags = {
  kg_enabled: false,
  deepdoc_enabled: false,
  docling_enabled: false,
  etl4llm_enabled: false,
  marker_enabled: false,
  paddle_vl_enabled: false,
  textin_enabled: false,
  markitdown_enabled: false,
  llama_index_enabled: false,
  mineru_enabled: false,
  magicpdf_enabled: false,
}

describe('设置保存校验', () => {
  it('不拦截未启用的外部服务', () => {
    expect(
      validateSettingsChanges({
        dify_external_knowledge: {
          ...validDify,
          enabled: false,
          api_keys: '',
          knowledge_map_json: '{',
        },
        minio: {
          ...validMinIO,
          enabled: false,
          documents_enabled: false,
          endpoint: '',
          access_key: '',
          secret_key: '',
        },
      })
    ).toBeNull()
  })

  it('接受脱敏凭证和有效的 Dify 知识绑定', () => {
    expect(validateDifyExternalKnowledgeConfig(validDify)).toBeNull()
    expect(
      validateDifyExternalKnowledgeConfig({
        ...validDify,
        knowledge_map_json: JSON.stringify({
          kb_policy: {
            dataset_ids: [
              '00000000-0000-4000-8000-000000000001',
              '00000000-0000-4000-8000-000000000002',
            ],
          },
        }),
      })
    ).toBeNull()
  })

  it.each([
    [{ endpoint_path: 'https://example.com/retrieval' }, '接入路径'],
    [{ api_keys: '' }, 'API Key'],
    [{ tenant_id: 'not-a-uuid' }, '租户 ID'],
    [{ account_id: '' }, '服务账号'],
    [{ top_k_max: 0 }, '最大返回条数'],
    [{ knowledge_map_json: '' }, '至少一条知识绑定'],
    [{ knowledge_map_json: '{' }, '有效的 JSON'],
    [{ knowledge_map_json: '[]' }, 'JSON 对象'],
    [{ knowledge_map_json: '{"kb_policy":[]}' }, '至少一个有效的数据集 UUID'],
    [{ knowledge_map_json: '{"kb_policy":["dataset-a"]}' }, '有效的数据集 UUID'],
  ])('拦截无效的 Dify 配置 %#', (patch, message) => {
    const result = validateDifyExternalKnowledgeConfig({ ...validDify, ...patch })
    expect(result?.section).toBe('Dify 外部知识库')
    expect(result?.message).toContain(message)
  })

  it('接受脱敏凭证和有效的对象存储配置', () => {
    expect(validateMinIOConfig(validMinIO)).toBeNull()
  })

  it('不允许在关闭 MinIO 时单独启用文档对象存储', () => {
    expect(
      validateMinIOConfig({
        ...validMinIO,
        enabled: false,
        documents_enabled: true,
      })
    ).toEqual({
      section: '对象存储',
      message: '启用文档对象存储前，请先打开 MinIO 对象存储。',
    })
  })

  it.each([
    [{ endpoint: '' }, 'Endpoint'],
    [{ endpoint: 'http://minio:9000' }, '主机名和端口'],
    [{ bucket_name: '' }, 'Bucket'],
    [{ bucket_name: 'tenant/docs' }, '路径分隔符'],
    [{ access_key: '' }, 'Access Key'],
    [{ secret_key: '' }, 'Secret Key'],
    [{ image_max_bytes: -1 }, '大于或等于 0'],
    [{ image_max_bytes: 1.5 }, '整数'],
  ])('拦截无效的对象存储配置 %#', (patch, message) => {
    const result = validateMinIOConfig({ ...validMinIO, ...patch })
    expect(result?.section).toBe('对象存储')
    expect(result?.message).toContain(message)
  })

  it('接受可执行的 RAG 配置', () => {
    expect(validateRagConfig(validRag)).toBeNull()
  })

  it.each([
    [{ chunk_size: 0 }, '分块大小'],
    [{ chunk_overlap: -1 }, '分块重叠'],
    [{ chunk_size: 200, chunk_overlap: 200 }, '小于分块大小'],
    [{ retrieval_top_k: 0 }, '召回数量'],
    [{ similarity_threshold: 1.1 }, '相似度阈值'],
    [{ reranker_provider: 'none' }, '可用的重排服务'],
    [{ reranker_provider: 'weighted' }, '单独配置权重'],
  ])('拦截无效的 RAG 配置 %#', (patch, message) => {
    const result = validateRagConfig({ ...validRag, ...patch })
    expect(result?.section).toBe('检索与生成')
    expect(result?.message).toContain(message)
  })

  it.each([
    ['mineru_enabled', 'mineru', { local_server_url: '', api_token: '' }, 'MinerU'],
    ['etl4llm_enabled', 'etl4llm', { api_url: '' }, 'ETL4LLM'],
    ['marker_enabled', 'marker', { api_url: '' }, 'Marker'],
    ['paddle_vl_enabled', 'paddle_vl', { api_url: '' }, 'PaddleOCR-VL'],
    ['textin_enabled', 'textin', { api_url: '', app_id: '', secret_code: '' }, 'TextIn'],
    ['magicpdf_enabled', 'magicpdf', { api_url: '', cli: '' }, 'MagicPDF'],
  ] as const)('拦截缺少连接参数的解析服务 %s', (flag, configKey, config, serviceName) => {
    const result = validateParserServicesConfig({
      feature_flags: { ...disabledFeatureFlags, [flag]: true },
      [configKey]: config,
    })

    expect(result?.section).toBe('解析服务')
    expect(result?.message).toContain(serviceName)
  })

  it('启用解析服务时接受当前配置快照中的连接参数', () => {
    const currentSettings = {
      feature_flags: { etl4llm_enabled: false },
      etl4llm: { api_url: 'http://etl4llm:10001/predict' },
    } as SystemSettings

    expect(
      validateParserServicesConfig(
        { feature_flags: { ...disabledFeatureFlags, etl4llm_enabled: true } },
        currentSettings
      )
    ).toBeNull()
  })

  it('只修改非解析功能时不检查已有解析服务配置', () => {
    const currentSettings = {
      feature_flags: {
        ...disabledFeatureFlags,
        etl4llm_enabled: true,
      },
      etl4llm: { api_url: '' },
    } as SystemSettings

    expect(
      validateParserServicesConfig(
        {
          feature_flags: {
            ...currentSettings.feature_flags,
            kg_enabled: true,
          },
        },
        currentSettings,
        { kg_enabled: true }
      )
    ).toBeNull()
  })
})
