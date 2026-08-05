'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  BarChart3,
  FileUp,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Scissors,
  Settings2,
  Sparkles,
  Trash2,
} from 'lucide-react'

import { AppFrame } from '@/components/app-frame'
import { DatasetDetailShell } from '@/components/datasets/dataset-detail-shell'
import { Panel } from '@/components/ui/panel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { QueryErrorState } from '@/components/ui/query-error-state'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

import { datasetApi, pipelineApi } from '@/lib/api'
import { INGESTION_FALLBACK_CHUNK_STRATEGY_VALUES } from '@/lib/chunk-strategies'
import { reportClientError } from '@/lib/client-logging'
import { PARSER_BACKEND_REGISTRY_OPTIONS } from '@/lib/parser-options'
import { queryKeys } from '@/lib/query-keys'
import { randomBase36Id } from '@/lib/secure-random'
import { cn, detachPromise } from '@/lib/utils'
import { useRouter } from '@/i18n/navigation'
import { usePipelineCapabilities } from '@/contexts/pipeline-capabilities-context'
import { useUnsavedNavigationGuard } from '@/hooks/use-unsaved-navigation-guard'
import type { IngestionPolicy, IngestionRule, IngestionPreviewResponse } from '@/types'

const NONE = '__none__'
const INGESTION_PROFILE_PARAMS = { include_builtin: true, limit: 200 } as const
const EMPTY_POLICY_JSON = JSON.stringify(null)

const PREPROCESS_STEP_CATALOG: Array<{ id: string; label: string; desc: string }> = [
  {
    id: 'text.reencode_utf8',
    label: '文本编码修复 → UTF-8',
    desc: '修复乱码/编码不一致（GBK/Windows-1252 等）',
  },
  { id: 'text.strip_bom', label: '移除 BOM', desc: '修复 UTF-8 BOM 导致的首行异常' },
  { id: 'text.normalize_newlines', label: '统一换行符', desc: 'CRLF/CR → LF，减少解析噪声' },
  {
    id: 'text.collapse_blank_lines',
    label: '压缩连续空行',
    desc: '把 3+ 连续空行压缩为最多 2 行，降低噪声',
  },
  {
    id: 'text.trim_trailing_whitespace',
    label: '去掉行尾空格',
    desc: '减少 diff 抖动与无意义字符',
  },
  {
    id: 'text.remove_zero_width',
    label: '移除零宽字符/软连字符',
    desc: '修复网页/扫描/OCR/PDF 文本中常见的隐藏字符',
  },
  {
    id: 'text.remove_control_chars',
    label: '移除控制字符',
    desc: String.raw`去掉 \x00 等控制字符（保留 TAB/LF/CR）`,
  },
  {
    id: 'text.normalize_unicode_nfc',
    label: 'Unicode 规范化（NFC）',
    desc: '更保守的 Unicode 归一（比 NFKC 更少语义风险）',
  },
  {
    id: 'text.normalize_unicode_nfkc',
    label: 'Unicode 规范化（NFKC）',
    desc: '全角/半角与兼容字符归一（谨慎启用）',
  },
  {
    id: 'html.strip_scripts_styles',
    label: 'HTML：移除 script/style',
    desc: '减少网页样板/脚本注入噪声',
  },
  { id: 'html.strip_comments', label: 'HTML：移除注释', desc: '减少抓取页面的注释噪声' },
  {
    id: 'html.strip_boilerplate_tags',
    label: 'HTML：移除导航/页眉页脚',
    desc: '移除 nav/header/footer/aside/noscript 等常见样板区块',
  },
]

type IngestionPolicyTemplate = {
  key: string
  name: string
  description: string
  tags: string[]
  // 应用模板时生成唯一规则 ID。
  rules: Array<Omit<IngestionRule, 'id'>>
}

const INGESTION_POLICY_TEMPLATES: IngestionPolicyTemplate[] = [
  {
    key: 'recommended:kb_general',
    name: '推荐：通用知识库（HTML / PDF / Office / Text）',
    description: '覆盖最常见入库来源，默认搭配内置治理预设；规则可再按需微调与调序。',
    tags: ['HTML', 'PDF', 'Office', 'MD/TXT', '内置治理'],
    rules: [
      {
        name: '网页 HTML（去样板/去导航）',
        enabled: true,
        match: { extensions: ['.html', '.htm'], filename_regex: null },
        preprocess: {
          enabled: true,
          steps: [
            { id: 'html.strip_scripts_styles', params: {} },
            { id: 'html.strip_comments', params: {} },
            { id: 'html.strip_boilerplate_tags', params: {} },
            { id: 'text.normalize_newlines', params: {} },
            { id: 'text.collapse_blank_lines', params: {} },
            { id: 'text.trim_trailing_whitespace', params: {} },
            { id: 'text.remove_zero_width', params: {} },
            { id: 'text.remove_control_chars', params: {} },
          ],
        },
        parser_backend: 'auto',
        chunk_strategy: null,
        governance_profile_ref: 'builtin:html_web',
        pipeline_patch: {},
      },
      {
        name: 'PDF 文本版（修复断行/页眉页脚）',
        enabled: true,
        match: { extensions: ['.pdf'], filename_regex: null },
        preprocess: { enabled: false, steps: [] },
        parser_backend: 'auto',
        chunk_strategy: null,
        governance_profile_ref: 'builtin:pdf_text',
        pipeline_patch: {},
      },
      {
        name: 'Office（DOCX/PPTX/XLSX）',
        enabled: true,
        match: { extensions: ['.docx', '.pptx', '.xls', '.xlsx'], filename_regex: null },
        preprocess: { enabled: false, steps: [] },
        parser_backend: 'markitdown',
        chunk_strategy: null,
        governance_profile_ref: 'builtin:kb_default',
        pipeline_patch: {},
      },
      {
        name: 'Markdown / 纯文本（保守清洗）',
        enabled: true,
        match: { extensions: ['.md', '.txt', '.log'], filename_regex: null },
        preprocess: {
          enabled: true,
          steps: [
            { id: 'text.reencode_utf8', params: {} },
            { id: 'text.strip_bom', params: {} },
            { id: 'text.normalize_newlines', params: {} },
            { id: 'text.trim_trailing_whitespace', params: {} },
            { id: 'text.remove_zero_width', params: {} },
            { id: 'text.remove_control_chars', params: {} },
          ],
        },
        parser_backend: 'auto',
        chunk_strategy: null,
        governance_profile_ref: 'builtin:kb_default',
        pipeline_patch: {},
      },
    ],
  },
  {
    key: 'recommended:pdf_ocr_first',
    name: 'PDF：扫描/OCR 优先（文件名命中 scan/ocr/扫描）',
    description: '先匹配可能是扫描/OCR 的 PDF（更强容错），否则走文本版 PDF 规则。',
    tags: ['PDF', 'OCR', '两段匹配'],
    rules: [
      {
        name: 'PDF 扫描/OCR（优先）',
        enabled: true,
        match: { extensions: ['.pdf'], filename_regex: '(?i)(scan|ocr|扫描|影印|图片)' },
        preprocess: { enabled: false, steps: [] },
        parser_backend: 'deepdoc',
        chunk_strategy: null,
        governance_profile_ref: 'builtin:pdf_scanned_ocr',
        pipeline_patch: {},
      },
      {
        name: 'PDF 文本（默认）',
        enabled: true,
        match: { extensions: ['.pdf'], filename_regex: null },
        preprocess: { enabled: false, steps: [] },
        parser_backend: 'auto',
        chunk_strategy: null,
        governance_profile_ref: 'builtin:pdf_text',
        pipeline_patch: {},
      },
    ],
  },
  {
    key: 'recommended:web_scrape',
    name: '网页抓取（HTML）',
    description: '适用于抓取/复制网页：去样板/去导航/去追踪参，保留正文信息密度。',
    tags: ['HTML', '页面去噪'],
    rules: [
      {
        name: '网页 HTML（抓取）',
        enabled: true,
        match: { extensions: ['.html', '.htm'], filename_regex: null },
        preprocess: {
          enabled: true,
          steps: [
            { id: 'html.strip_scripts_styles', params: {} },
            { id: 'html.strip_comments', params: {} },
            { id: 'text.normalize_newlines', params: {} },
          ],
        },
        parser_backend: 'auto',
        chunk_strategy: null,
        governance_profile_ref: 'builtin:html_web',
        pipeline_patch: {},
      },
    ],
  },
  {
    key: 'recommended:wiki_longform',
    name: '长文/Wiki/手册（去重+参考文献）',
    description: '适用于 Wiki/手册类长文：去重重复段落、保守裁剪 References、修复断行。',
    tags: ['Markdown', '长文'],
    rules: [
      {
        name: '长文/Wiki（Markdown）',
        enabled: true,
        match: { extensions: ['.md'], filename_regex: null },
        preprocess: {
          enabled: true,
          steps: [
            { id: 'text.strip_bom', params: {} },
            { id: 'text.normalize_newlines', params: {} },
            { id: 'text.trim_trailing_whitespace', params: {} },
          ],
        },
        parser_backend: 'markdown',
        chunk_strategy: null,
        governance_profile_ref: 'builtin:wiki_longform',
        pipeline_patch: {},
      },
    ],
  },
  {
    key: 'recommended:pii_compliance',
    name: '合规脱敏（PII/密钥）',
    description: '适用于可能包含邮箱、电话或访问令牌的文档：启用匿名化与密钥掩码。',
    tags: ['个人信息', '密钥'],
    rules: [
      {
        name: '合规脱敏（文本类）',
        enabled: true,
        match: {
          extensions: ['.md', '.txt', '.log', '.html', '.htm', '.csv', '.json'],
          filename_regex: null,
        },
        preprocess: {
          enabled: true,
          steps: [
            { id: 'text.reencode_utf8', params: {} },
            { id: 'text.strip_bom', params: {} },
            { id: 'text.normalize_newlines', params: {} },
          ],
        },
        parser_backend: 'auto',
        chunk_strategy: null,
        governance_profile_ref: 'builtin:legal_compliance',
        pipeline_patch: {},
      },
    ],
  },
  {
    key: 'recommended:code_repo',
    name: '代码仓库（源码/配置/README）',
    description: '适用于源码、配置和 README：保留换行与缩进，去掉代码块行号，并对密钥脱敏。',
    tags: ['代码', '配置', '密钥'],
    rules: [
      {
        name: '代码仓库（源码/配置）',
        enabled: true,
        match: {
          extensions: [
            '.md',
            '.txt',
            '.py',
            '.js',
            '.ts',
            '.tsx',
            '.java',
            '.go',
            '.rs',
            '.c',
            '.cpp',
            '.h',
            '.hpp',
            '.cs',
            '.php',
            '.rb',
            '.sh',
            '.yml',
            '.yaml',
            '.toml',
            '.ini',
            '.cfg',
            '.conf',
            '.env',
            '.sql',
          ],
          filename_regex: null,
        },
        preprocess: {
          enabled: true,
          steps: [
            { id: 'text.reencode_utf8', params: {} },
            { id: 'text.strip_bom', params: {} },
            { id: 'text.normalize_newlines', params: {} },
            { id: 'text.trim_trailing_whitespace', params: {} },
            { id: 'text.remove_control_chars', params: {} },
            { id: 'text.remove_zero_width', params: {} },
          ],
        },
        parser_backend: 'auto',
        chunk_strategy: null,
        governance_profile_ref: 'builtin:code_repo',
        pipeline_patch: {},
      },
    ],
  },
  {
    key: 'recommended:structured_data',
    name: '结构化数据（CSV / JSON）',
    description: '适用于 CSV/JSON：保留行边界，轻量去噪；解析后更适合检索。',
    tags: ['CSV', 'JSON'],
    rules: [
      {
        name: 'CSV（行式）',
        enabled: true,
        match: { extensions: ['.csv'], filename_regex: null },
        preprocess: {
          enabled: true,
          steps: [
            { id: 'text.reencode_utf8', params: {} },
            { id: 'text.strip_bom', params: {} },
            { id: 'text.normalize_newlines', params: {} },
            { id: 'text.remove_control_chars', params: {} },
          ],
        },
        parser_backend: 'csv',
        chunk_strategy: null,
        governance_profile_ref: 'builtin:structured_data',
        pipeline_patch: {},
      },
      {
        name: 'JSON / JSONL（pretty-print）',
        enabled: true,
        match: { extensions: ['.json'], filename_regex: null },
        preprocess: {
          enabled: true,
          steps: [
            { id: 'text.reencode_utf8', params: {} },
            { id: 'text.strip_bom', params: {} },
            { id: 'text.normalize_newlines', params: {} },
            { id: 'text.remove_control_chars', params: {} },
          ],
        },
        parser_backend: 'json',
        chunk_strategy: null,
        governance_profile_ref: 'builtin:structured_data',
        pipeline_patch: {},
      },
    ],
  },
  {
    key: 'recommended:tables_tag_auto',
    name: '表格（CSV / XLSX）：TAG 自动分流（大表→SQL，小表→RAG）',
    description:
      '适用于既有小表也有大表：小表按文本解析入库；大表走 Table Store（SQLite）用于 SQL/NL→SQL。',
    tags: ['CSV', 'XLSX', 'TAG', '自动分流'],
    rules: [
      {
        name: '表格 CSV（自动分流）',
        enabled: true,
        match: { extensions: ['.csv'], filename_regex: null },
        preprocess: {
          enabled: true,
          steps: [
            { id: 'text.reencode_utf8', params: {} },
            { id: 'text.strip_bom', params: {} },
            { id: 'text.normalize_newlines', params: {} },
          ],
        },
        parser_backend: 'auto',
        chunk_strategy: null,
        governance_profile_ref: 'builtin:structured_data',
        pipeline_patch: {
          table_store_enabled: true,
          table_store_auto_route: true,
          table_store_auto_row_threshold: 5000,
          table_store_auto_col_threshold: 80,
          table_store_auto_sheet_threshold: 5,
          table_store_auto_file_bytes_threshold: 5000000,
        },
      },
      {
        name: '表格 XLS/XLSX（自动分流）',
        enabled: true,
        match: { extensions: ['.xls', '.xlsx'], filename_regex: null },
        preprocess: { enabled: false, steps: [] },
        parser_backend: 'auto',
        chunk_strategy: null,
        governance_profile_ref: 'builtin:structured_data',
        pipeline_patch: {
          table_store_enabled: true,
          table_store_auto_route: true,
          table_store_auto_row_threshold: 5000,
          table_store_auto_col_threshold: 80,
          table_store_auto_sheet_threshold: 5,
          table_store_auto_file_bytes_threshold: 5000000,
        },
      },
    ],
  },
  {
    key: 'recommended:metadata_enrich',
    name: '元数据增强（frontmatter/语言/关键词）',
    description: '适用于需要加强检索和筛选的文档：抽取关键词、检测语言并读取文档头元数据。',
    tags: ['关键词', '语言', '文档头'],
    rules: [
      {
        name: 'Markdown / 文本（元数据增强）',
        enabled: true,
        match: { extensions: ['.md', '.txt'], filename_regex: null },
        preprocess: {
          enabled: true,
          steps: [
            { id: 'text.reencode_utf8', params: {} },
            { id: 'text.strip_bom', params: {} },
            { id: 'text.normalize_newlines', params: {} },
            { id: 'text.trim_trailing_whitespace', params: {} },
          ],
        },
        parser_backend: 'auto',
        chunk_strategy: null,
        governance_profile_ref: 'builtin:metadata_enrich',
        pipeline_patch: {},
      },
    ],
  },
  {
    key: 'recommended:quality_gate',
    name: '质量门禁（低质量 → 隔离）',
    description: '适用于批量入库：对疑似无正文/低密度文档进行过滤并进入隔离队列，减少污染知识库。',
    tags: ['质量门禁', '隔离'],
    rules: [
      {
        name: '质量门禁（PDF/HTML/文本）',
        enabled: true,
        match: { extensions: ['.pdf', '.html', '.htm', '.md', '.txt'], filename_regex: null },
        preprocess: { enabled: false, steps: [] },
        parser_backend: 'auto',
        chunk_strategy: null,
        governance_profile_ref: 'builtin:quality_gate_quarantine',
        pipeline_patch: {},
      },
    ],
  },
  {
    key: 'recommended:html_xpath',
    name: '网页 XPath 定位正文（默认 //main）',
    description: '适用于结构稳定的网站：优先用 XPath 抽正文；可在规则里改成 //article 等。',
    tags: ['HTML', 'XPath'],
    rules: [
      {
        name: '网页 HTML（XPath）',
        enabled: true,
        match: { extensions: ['.html', '.htm'], filename_regex: null },
        preprocess: {
          enabled: true,
          steps: [
            { id: 'html.strip_scripts_styles', params: {} },
            { id: 'html.strip_comments', params: {} },
            { id: 'text.normalize_newlines', params: {} },
          ],
        },
        parser_backend: 'auto',
        chunk_strategy: null,
        governance_profile_ref: 'builtin:html_xpath_main',
        pipeline_patch: {},
      },
    ],
  },
  {
    key: 'recommended:pdf_layout_tables',
    name: 'PDF（表格/版式优先）',
    description: '适用于表格/排版复杂 PDF：使用 docling 解析 + 表格规范化清洗。',
    tags: ['PDF', '表格', '版式'],
    rules: [
      {
        name: 'PDF（docling）',
        enabled: true,
        match: { extensions: ['.pdf'], filename_regex: null },
        preprocess: { enabled: false, steps: [] },
        parser_backend: 'docling',
        chunk_strategy: 'pdf_layout',
        governance_profile_ref: 'builtin:pdf_text',
        pipeline_patch: {},
      },
    ],
  },
  {
    key: 'recommended:legal_docs',
    name: '法律/合同（integrated_laws + 合规脱敏）',
    description:
      '适用于合同/法规：切块策略选择 integrated_laws，并启用 PII/密钥脱敏（可按需关闭）。',
    tags: ['法律', '法规库', '个人信息'],
    rules: [
      {
        name: '法律 PDF（integrated_laws）',
        enabled: true,
        match: { extensions: ['.pdf'], filename_regex: null },
        preprocess: { enabled: false, steps: [] },
        parser_backend: 'auto',
        chunk_strategy: 'integrated_laws',
        governance_profile_ref: 'builtin:pdf_text',
        pipeline_patch: {
          governance_pii_anonymize: true,
          governance_pii_mode: 'mask',
          governance_pii_mask: '[REDACTED]',
          governance_secrets_redact: true,
          governance_secrets_mode: 'mask',
          governance_secrets_mask: '[SECRET]',
        },
      },
      {
        name: '法律 DOCX（integrated_laws）',
        enabled: true,
        match: { extensions: ['.docx'], filename_regex: null },
        preprocess: { enabled: false, steps: [] },
        parser_backend: 'markitdown',
        chunk_strategy: 'integrated_laws',
        governance_profile_ref: 'builtin:kb_default',
        pipeline_patch: {
          governance_pii_anonymize: true,
          governance_pii_mode: 'mask',
          governance_pii_mask: '[REDACTED]',
          governance_secrets_redact: true,
          governance_secrets_mode: 'mask',
          governance_secrets_mask: '[SECRET]',
        },
      },
    ],
  },
]

function safeIdFromNow() {
  return `rule-${Date.now().toString(36)}`
}

function generateTemplateRuleIds(count: number) {
  const base = `tpl-${Date.now().toString(36)}-${randomBase36Id(4)}`
  return Array.from({ length: count }).map((_, i) => `${base}-${(i + 1).toString(36)}`)
}

function parseExtensions(text: string): string[] {
  return (text || '')
    .split(/[,\s]+/g)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((s) => (s.startsWith('.') ? s : `.${s}`))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  if (error instanceof SyntaxError) return '高级策略参数不是有效的 JSON'
  if (error instanceof Error && error.message === '高级策略参数必须是 JSON 对象') {
    return error.message
  }
  return '请检查规则内容后重试'
}

type RuleDraft = {
  id: string
  name: string
  enabled: boolean
  extensionsText: string
  filenameRegex: string
  preprocessEnabled: boolean
  preprocessStepIds: string[]
  parserBackend: string
  chunkStrategy: string
  governanceProfileRef: string
  pipelinePatchJson: string
}

function ruleToDraft(rule: IngestionRule): RuleDraft {
  const extensions = Array.isArray(rule.match?.extensions) ? rule.match.extensions : []
  const steps = Array.isArray(rule.preprocess?.steps) ? rule.preprocess.steps : []
  return {
    id: rule.id || safeIdFromNow(),
    name: rule.name || '新规则',
    enabled: !!rule.enabled,
    extensionsText: extensions.join(', '),
    filenameRegex: String(rule.match?.filename_regex || ''),
    preprocessEnabled: !!rule.preprocess?.enabled,
    preprocessStepIds: steps.map((s) => String(s.id || '')).filter(Boolean),
    parserBackend: rule.parser_backend || '',
    chunkStrategy: rule.chunk_strategy || '',
    governanceProfileRef: rule.governance_profile_ref || '',
    pipelinePatchJson: rule.pipeline_patch ? JSON.stringify(rule.pipeline_patch, null, 2) : '',
  }
}

function draftToRule(d: RuleDraft): IngestionRule {
  let patch: Record<string, unknown> | undefined
  const raw = (d.pipelinePatchJson || '').trim()
  if (raw) {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) {
      throw new Error('高级策略参数必须是 JSON 对象')
    }
    patch = parsed
  }
  return {
    id: d.id.trim(),
    name: d.name.trim(),
    enabled: !!d.enabled,
    match: {
      extensions: parseExtensions(d.extensionsText),
      filename_regex: d.filenameRegex.trim() ? d.filenameRegex.trim() : null,
    },
    preprocess: {
      enabled: !!d.preprocessEnabled,
      steps: d.preprocessEnabled ? d.preprocessStepIds.map((id) => ({ id, params: {} })) : [],
    },
    parser_backend: d.parserBackend.trim() ? d.parserBackend.trim() : null,
    chunk_strategy: d.chunkStrategy.trim() ? d.chunkStrategy.trim() : null,
    governance_profile_ref: d.governanceProfileRef.trim() ? d.governanceProfileRef.trim() : null,
    pipeline_patch: patch,
  }
}

export default function DatasetIngestionPolicyPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const datasetId = String(params?.id || '')
  const { capabilities } = usePipelineCapabilities()
  const policyRef = useRef<IngestionPolicy | null>(null)
  const savedPolicyJsonRef = useRef(EMPTY_POLICY_JSON)
  const previewFileRef = useRef<File | null>(null)
  const previewRequestIdRef = useRef(0)
  const previewAbortRef = useRef<AbortController | null>(null)

  const [policy, setPolicy] = useState<IngestionPolicy | null>(null)
  const [savedPolicyJson, setSavedPolicyJson] = useState(EMPTY_POLICY_JSON)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const [editorOpen, setEditorOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [draft, setDraft] = useState<RuleDraft>({
    id: safeIdFromNow(),
    name: '新规则',
    enabled: true,
    extensionsText: '.pdf',
    filenameRegex: '',
    preprocessEnabled: true,
    preprocessStepIds: ['text.reencode_utf8', 'text.strip_bom', 'text.normalize_newlines'],
    parserBackend: 'auto',
    chunkStrategy: '',
    governanceProfileRef: '',
    pipelinePatchJson: '',
  })

  const [previewFile, setPreviewFile] = useState<File | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState<IngestionPreviewResponse | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const invalidatePreview = useCallback(() => {
    previewRequestIdRef.current += 1
    previewAbortRef.current?.abort()
    previewAbortRef.current = null
    setPreview(null)
    setPreviewError(null)
    setPreviewing(false)
  }, [])

  useEffect(
    () => () => {
      previewRequestIdRef.current += 1
      previewAbortRef.current?.abort()
    },
    []
  )

  const chunkStrategyOptions = useMemo(() => {
    const items = (capabilities?.chunk_strategies || [])
      .map((s) => String(s.name || '').trim())
      .filter(Boolean)
    const uniq = Array.from(new Set(items))
    return uniq.length ? uniq : INGESTION_FALLBACK_CHUNK_STRATEGY_VALUES
  }, [capabilities])

  const profilesQuery = useQuery({
    queryKey: queryKeys.governance.profiles(INGESTION_PROFILE_PARAMS),
    queryFn: () => pipelineApi.listGovernanceProfiles(INGESTION_PROFILE_PARAMS),
  })
  const profiles = useMemo(() => profilesQuery.data?.items || [], [profilesQuery.data?.items])

  const datasetQuery = useQuery({
    queryKey: queryKeys.datasets.detail(datasetId),
    queryFn: () => datasetApi.get(datasetId),
    enabled: Boolean(datasetId),
  })

  const policyQuery = useQuery({
    queryKey: queryKeys.datasets.ingestionPolicy(datasetId),
    queryFn: () => datasetApi.getIngestionPolicy(datasetId),
    enabled: Boolean(datasetId),
    refetchOnWindowFocus: false,
  })

  const ingestionStatsQuery = useQuery({
    queryKey: queryKeys.datasets.ingestionStats(datasetId),
    queryFn: () => datasetApi.getIngestionStats(datasetId),
    enabled: Boolean(datasetId),
  })

  const dataset = datasetQuery.data ?? null
  const ingestionStats = ingestionStatsQuery.data ?? null
  const datasetUnavailable = datasetQuery.isError && datasetQuery.data === undefined
  const datasetRefreshFailed = datasetQuery.isError && datasetQuery.data !== undefined
  const policyUnavailable = policyQuery.isError && policyQuery.data === undefined
  const policyRefreshFailed = policyQuery.isError && policyQuery.data !== undefined
  const statsUnavailable = ingestionStatsQuery.isError && ingestionStatsQuery.data === undefined
  const statsRefreshFailed = ingestionStatsQuery.isError && ingestionStatsQuery.data !== undefined
  const profilesUnavailable = profilesQuery.isError && profilesQuery.data === undefined
  const profilesRefreshFailed = profilesQuery.isError && profilesQuery.data !== undefined

  useEffect(() => {
    policyRef.current = policy
  }, [policy])

  useEffect(() => {
    const nextPolicy = policyQuery.data
    if (!nextPolicy) return
    const nextPolicyJson = JSON.stringify(nextPolicy)
    const currentPolicy = policyRef.current
    const shouldAdoptSnapshot =
      currentPolicy === null || JSON.stringify(currentPolicy) === savedPolicyJsonRef.current

    savedPolicyJsonRef.current = nextPolicyJson
    setSavedPolicyJson(nextPolicyJson)
    if (shouldAdoptSnapshot) {
      if (JSON.stringify(currentPolicy) !== nextPolicyJson) invalidatePreview()
      policyRef.current = nextPolicy
      setPolicy(nextPolicy)
    }
  }, [invalidatePreview, policyQuery.data])

  useEffect(() => {
    if (profilesQuery.error) {
      reportClientError('Failed to load ingestion governance profiles', profilesQuery.error)
    }
  }, [profilesQuery.error])

  useEffect(() => {
    if (datasetQuery.error) {
      reportClientError('Failed to load dataset for ingestion policy', datasetQuery.error)
    }
  }, [datasetQuery.error])

  useEffect(() => {
    if (policyQuery.error) {
      reportClientError('Failed to load dataset ingestion policy', policyQuery.error)
    }
  }, [policyQuery.error])

  useEffect(() => {
    if (ingestionStatsQuery.error) {
      reportClientError('Failed to load dataset ingestion stats', ingestionStatsQuery.error)
    }
  }, [ingestionStatsQuery.error])

  const { refetch: refetchDataset } = datasetQuery
  const { refetch: refetchPolicy } = policyQuery
  const { refetch: refetchIngestionStats } = ingestionStatsQuery

  const refreshIngestionPolicy = useCallback(async () => {
    await Promise.all([refetchDataset(), refetchPolicy(), refetchIngestionStats()])
  }, [refetchDataset, refetchIngestionStats, refetchPolicy])

  const applyLocalPolicy = useCallback(
    (nextPolicy: IngestionPolicy) => {
      invalidatePreview()
      policyRef.current = nextPolicy
      setPolicy(nextPolicy)
    },
    [invalidatePreview]
  )
  const activePolicy = policy ?? policyQuery.data ?? null
  const canEditPolicy = policyQuery.data?.writable === true
  const rules = useMemo(() => activePolicy?.rules || [], [activePolicy])
  const isDirty = useMemo(() => {
    if (!policy) return false
    return JSON.stringify(policy) !== savedPolicyJson
  }, [policy, savedPolicyJson])
  const navigateAfterConfirm = useCallback((href: string) => router.push(href), [router])
  const navigationGuard = useUnsavedNavigationGuard({
    enabled: isDirty || saving,
    onNavigate: navigateAfterConfirm,
  })

  const openCreate = useCallback(() => {
    if (!activePolicy || !canEditPolicy) return
    setEditingIndex(null)
    setDraft({
      id: safeIdFromNow(),
      name: '新规则',
      enabled: true,
      extensionsText: '.pdf',
      filenameRegex: '',
      preprocessEnabled: true,
      preprocessStepIds: ['text.reencode_utf8', 'text.strip_bom', 'text.normalize_newlines'],
      parserBackend: 'auto',
      chunkStrategy: '',
      governanceProfileRef: '',
      pipelinePatchJson: '',
    })
    setEditorOpen(true)
  }, [activePolicy, canEditPolicy])

  const openEdit = useCallback(
    (idx: number) => {
      const r = rules[idx]
      if (!r || !canEditPolicy) return
      setEditingIndex(idx)
      setDraft(ruleToDraft(r))
      setEditorOpen(true)
    },
    [canEditPolicy, rules]
  )

  const applyDraft = useCallback(() => {
    if (!canEditPolicy) return
    try {
      const rule = draftToRule(draft)
      const next: IngestionPolicy = activePolicy || { version: '1', rules: [] }
      const newRules = [...(next.rules || [])]
      if (editingIndex == null) newRules.unshift(rule)
      else newRules.splice(editingIndex, 1, rule)
      applyLocalPolicy({ version: '1', rules: newRules })
      setEditorOpen(false)
    } catch (e: unknown) {
      toast.error(`规则保存失败：${errorMessage(e)}`)
    }
  }, [activePolicy, applyLocalPolicy, canEditPolicy, draft, editingIndex])

  const removeRule = useCallback(
    (idx: number) => {
      if (!canEditPolicy) return
      const next: IngestionPolicy = activePolicy || { version: '1', rules: [] }
      const newRules = [...(next.rules || [])]
      newRules.splice(idx, 1)
      applyLocalPolicy({ version: '1', rules: newRules })
    },
    [activePolicy, applyLocalPolicy, canEditPolicy]
  )

  const moveRule = useCallback(
    (idx: number, dir: -1 | 1) => {
      if (!canEditPolicy) return
      const next: IngestionPolicy = activePolicy || { version: '1', rules: [] }
      const newRules = [...(next.rules || [])]
      const j = idx + dir
      if (j < 0 || j >= newRules.length) return
      const tmp = newRules[idx]
      newRules[idx] = newRules[j]
      newRules[j] = tmp
      applyLocalPolicy({ version: '1', rules: newRules })
    },
    [activePolicy, applyLocalPolicy, canEditPolicy]
  )

  const applyTemplate = useCallback(
    (tpl: IngestionPolicyTemplate, mode: 'prepend' | 'append' | 'replace') => {
      if (!canEditPolicy) return
      const next: IngestionPolicy = activePolicy || { version: '1', rules: [] }
      const existing = [...(next.rules || [])]
      const ids = generateTemplateRuleIds(tpl.rules.length)
      const newRules: IngestionRule[] = tpl.rules.map((r, i) => ({ ...r, id: ids[i] }))

      let merged: IngestionRule[]
      if (mode === 'replace') {
        merged = newRules
      } else if (mode === 'append') {
        merged = [...existing, ...newRules]
      } else {
        merged = [...newRules, ...existing]
      }

      applyLocalPolicy({ version: '1', rules: merged })
      setTemplatesOpen(false)
      toast.success(`已应用模板：${tpl.name}（${newRules.length} 条规则）`)

      // 应用模板后回到顶部，便于立即检查新增规则。
      globalThis.window.requestAnimationFrame(() => {
        const sc = document.querySelector<HTMLElement>('[data-page-scroll-container="true"]')
        sc?.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
      })
    },
    [activePolicy, applyLocalPolicy, canEditPolicy]
  )

  const savePolicy = useCallback(async () => {
    if (!datasetId || !policy || !canEditPolicy) return
    const submittedPolicy = policy
    const submittedPolicyJson = JSON.stringify(submittedPolicy)
    setActionError(null)
    setSaving(true)
    try {
      await datasetApi.updateIngestionPolicy(datasetId, submittedPolicy)
      savedPolicyJsonRef.current = submittedPolicyJson
      setSavedPolicyJson(submittedPolicyJson)
      toast.success('已保存入库策略')
      await refreshIngestionPolicy()
    } catch (e: unknown) {
      reportClientError('Failed to save ingestion policy', e)
      setActionError('保存入库策略失败，请检查规则内容和操作权限后重试')
    } finally {
      setSaving(false)
    }
  }, [canEditPolicy, datasetId, policy, refreshIngestionPolicy])

  const onPreviewFileChange = useCallback(
    (file: File | null) => {
      invalidatePreview()
      previewFileRef.current = file
      setPreviewFile(file)
    },
    [invalidatePreview]
  )

  const runPreview = useCallback(async () => {
    if (!previewFile || !datasetId || !activePolicy) return
    const file = previewFile
    const requestPolicyJson = JSON.stringify(activePolicy)
    const requestId = previewRequestIdRef.current + 1
    previewAbortRef.current?.abort()
    const controller = new AbortController()
    previewAbortRef.current = controller
    previewRequestIdRef.current = requestId
    setPreviewing(true)
    setPreviewError(null)
    try {
      const res = await pipelineApi.ingestionPreview(
        file,
        {
          dataset_id: datasetId,
          diff_max_lines: 2000,
          policy: isDirty ? activePolicy : undefined,
        },
        { signal: controller.signal }
      )
      if (
        requestId !== previewRequestIdRef.current ||
        previewFileRef.current !== file ||
        JSON.stringify(policyRef.current) !== requestPolicyJson
      ) {
        return
      }
      setPreview(res)
      toast.success('预览已生成')
    } catch (e: unknown) {
      if (
        controller.signal.aborted ||
        requestId !== previewRequestIdRef.current ||
        previewFileRef.current !== file ||
        JSON.stringify(policyRef.current) !== requestPolicyJson
      )
        return
      reportClientError('Failed to run ingestion preview', e)
      setPreviewError('生成预览失败，请检查文件和解析服务后重试')
    } finally {
      if (requestId === previewRequestIdRef.current) {
        previewAbortRef.current = null
        setPreviewing(false)
      }
    }
  }, [activePolicy, datasetId, isDirty, previewFile])

  const ingestionPanelClass = 'rounded-md border-border bg-card shadow-none'
  const ingestionPanelHeaderClass = 'shrink-0 border-b border-border bg-background px-5 py-4'
  const ingestionIconPillClass =
    'flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground'
  const ingestionActionButtonClass =
    'h-9 rounded-md px-3 text-sm font-semibold shadow-none [&_svg]:size-4'
  const ingestionMetricCardClass =
    'overflow-hidden rounded-md border border-border bg-card px-4 py-3 shadow-none'
  return (
    <AppFrame>
      <DatasetDetailShell
        activeSection="ingestion"
        datasetId={datasetId}
        datasetName={dataset?.name}
        title="入库策略"
        description="按文件类型配置预处理、解析、治理与切片规则。"
        icon={Settings2}
        onSectionNavigate={navigationGuard.requestNavigation}
        bodyClassName="h-full overflow-hidden bg-background pb-3"
        bodyContainerClassName="h-full min-h-0 overflow-hidden"
        actions={
          <>
            {isDirty ? (
              <Badge variant="soft" className="h-7 rounded-md px-2 text-xs">
                有未保存更改
              </Badge>
            ) : null}
            <Button
              size="sm"
              onClick={savePolicy}
              disabled={saving || !activePolicy || !canEditPolicy || !isDirty}
              className="h-9 rounded-md"
            >
              {saving ? (
                <Loader2
                  className="size-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <Save className="size-4" aria-hidden="true" />
              )}
              {saving ? '正在保存' : '保存策略'}
            </Button>
          </>
        }
      >
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto pr-1 no-scrollbar">
          {datasetUnavailable || datasetRefreshFailed ? (
            <QueryErrorState
              title={datasetUnavailable ? '无法加载数据集信息' : '刷新数据集信息失败'}
              description={
                datasetUnavailable
                  ? '入库策略仍可单独加载；数据集名称暂时无法获取。'
                  : '当前仍显示上次成功加载的数据集信息。'
              }
              onRetry={() => datasetQuery.refetch()}
              retrying={datasetQuery.isFetching}
            />
          ) : null}

          {profilesUnavailable || profilesRefreshFailed ? (
            <QueryErrorState
              title={profilesUnavailable ? '治理预设加载失败' : '刷新治理预设失败'}
              description={
                profilesUnavailable
                  ? '其他策略仍可编辑；治理预设暂时无法选择。'
                  : '当前仍使用上次成功加载的治理预设。'
              }
              onRetry={() => profilesQuery.refetch()}
              retrying={profilesQuery.isFetching}
            />
          ) : null}

          {actionError ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              {actionError}
            </div>
          ) : null}

          {policyQuery.data && !canEditPolicy ? (
            <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              当前为只读模式。你可以查看已保存策略并生成预览，但不能修改规则。
            </div>
          ) : null}

          {statsUnavailable || statsRefreshFailed ? (
            <QueryErrorState
              title={statsUnavailable ? '入库统计加载失败' : '刷新入库统计失败'}
              description={
                statsUnavailable
                  ? '策略编辑不受影响；暂时无法获取文档和切片统计。'
                  : '当前仍显示上次成功加载的入库统计。'
              }
              onRetry={() => ingestionStatsQuery.refetch()}
              retrying={ingestionStatsQuery.isFetching}
            />
          ) : null}

          {ingestionStatsQuery.isLoading ? (
            <div
              className="grid shrink-0 grid-cols-2 gap-3 md:grid-cols-4"
              aria-label="正在加载入库统计"
            >
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-[86px] rounded-md" />
              ))}
            </div>
          ) : null}

          {ingestionStats ? (
            <div className="grid shrink-0 grid-cols-2 gap-3 md:grid-cols-4">
              {[
                {
                  icon: FileUp,
                  label: '文档数',
                  value: ingestionStats.total_documents,
                  subValue: `已完成 ${ingestionStats.by_status?.completed || 0} · 失败 ${ingestionStats.by_status?.failed || 0}`,
                  tone: 'text-info bg-info/10 border-info/20',
                },
                {
                  icon: Scissors,
                  label: '切片数',
                  value: ingestionStats.total_chunks,
                  subValue: '所有文档切片总数',
                  tone: 'text-success bg-success/10 border-success/20',
                },
                {
                  icon: BarChart3,
                  label: '总字符数',
                  value: ingestionStats.total_characters,
                  subValue: '所有文档字符总数',
                  tone: 'text-warning bg-warning/10 border-warning/20',
                },
                {
                  icon: RefreshCw,
                  label: '最近入库',
                  value: ingestionStats.last_processed_at
                    ? new Date(ingestionStats.last_processed_at).toLocaleString()
                    : '—',
                  subValue: '最近完成处理时间',
                  tone: 'text-success bg-success/10 border-success/20',
                },
              ].map((item) => (
                <div key={item.label} className={ingestionMetricCardClass}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-muted-foreground">{item.label}</div>
                      <div className="mt-1 truncate font-mono text-base font-semibold leading-none text-foreground tabular-nums">
                        {item.value}
                      </div>
                      <div className="mt-1.5 truncate text-xs text-muted-foreground">
                        {item.subValue}
                      </div>
                    </div>
                    <div
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-md border',
                        item.tone
                      )}
                    >
                      <item.icon className="size-4" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_440px]">
            <Panel
              className={cn(
                ingestionPanelClass,
                'flex min-h-[520px] flex-col overflow-hidden xl:min-h-0'
              )}
            >
              <div
                className={cn(ingestionPanelHeaderClass, 'flex items-center justify-between gap-4')}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className={ingestionIconPillClass}>
                    <Settings2 className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-base font-semibold text-foreground">规则列表</div>
                      <Badge
                        variant="outline"
                        className="h-5 rounded-md px-2 text-xs text-muted-foreground"
                      >
                        {rules.length} 条规则
                      </Badge>
                    </div>
                    <div className="mt-1 max-w-3xl text-sm leading-5 text-muted-foreground">
                      从上到下匹配，命中后依次应用预处理、解析后端、切片策略和治理预设。
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setTemplatesOpen(true)}
                    disabled={!activePolicy || !canEditPolicy}
                    className={cn(
                      ingestionActionButtonClass,
                      'border-border bg-card/90 hover:bg-muted/50'
                    )}
                  >
                    <Sparkles className="size-4" />
                    从模板添加
                  </Button>
                  <Button
                    onClick={openCreate}
                    disabled={!activePolicy || !canEditPolicy}
                    className={cn(
                      ingestionActionButtonClass,
                      'bg-primary text-primary-foreground hover:bg-primary/90'
                    )}
                  >
                    <Plus className="size-4" />
                    新增规则
                  </Button>
                </div>
              </div>

              <div className="bg-background p-4 xl:min-h-0 xl:flex-1 xl:overflow-y-auto no-scrollbar">
                {policyRefreshFailed ? (
                  <QueryErrorState
                    title="刷新入库策略失败"
                    description="当前仍显示本地草稿和上次成功加载的策略。"
                    onRetry={() => policyQuery.refetch()}
                    retrying={policyQuery.isFetching}
                    className="mb-3"
                  />
                ) : null}
                {policyUnavailable ? (
                  <QueryErrorState
                    title="无法加载入库策略"
                    description="为避免覆盖现有规则，加载成功前不能编辑或保存。"
                    onRetry={() => policyQuery.refetch()}
                    retrying={policyQuery.isFetching}
                  />
                ) : policyQuery.isLoading || !activePolicy ? (
                  <div className="space-y-3" aria-label="正在加载入库策略">
                    <Skeleton className="h-28 rounded-md" />
                    <Skeleton className="h-28 rounded-md" />
                    <Skeleton className="h-28 rounded-md" />
                  </div>
                ) : rules.length === 0 ? (
                  <div className="flex min-h-[260px] flex-col justify-center rounded-md border border-dashed border-border bg-muted/30 px-6 py-8 text-muted-foreground">
                    <div className="flex items-start gap-4">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Sparkles className="size-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-foreground">
                          还没有入库规则
                        </div>
                        <div className="mt-1 max-w-xl text-sm leading-6">
                          建议先从模板生成 PDF、HTML
                          或纯文本规则，再按数据集情况调整解析后端、治理预设和切片策略。
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-md bg-card text-sm font-semibold"
                            onClick={() => setTemplatesOpen(true)}
                            disabled={!canEditPolicy}
                          >
                            <Sparkles className="size-3.5" />
                            从模板开始
                          </Button>
                          <Button
                            size="sm"
                            className="rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                            onClick={openCreate}
                            disabled={!canEditPolicy}
                          >
                            <Plus className="size-3.5" />
                            手动新增
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  (rules || []).map((r, idx) => (
                    <div
                      key={r.id}
                      className="mb-3 overflow-hidden rounded-md border border-border bg-card p-4 transition-colors last:mb-0 hover:border-primary/30"
                    >
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-semibold text-foreground">
                                {r.name}
                              </span>
                              <Badge
                                variant={r.enabled ? 'soft' : 'outline'}
                                className="h-5 rounded-md px-2 text-xs"
                              >
                                {r.enabled ? '已启用' : '已停用'}
                              </Badge>
                              <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-muted-foreground">
                                #{idx + 1}
                              </span>
                            </div>
                            <div className="mt-1.5 text-[12px] font-medium text-muted-foreground dark:text-muted-foreground">
                              扩展名：{(r.match?.extensions || []).join(', ') || '任意'}
                              {r.match?.filename_regex
                                ? ` · 文件名正则：${r.match.filename_regex}`
                                : ''}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="size-8 rounded-md px-0 text-sm"
                              onClick={() => moveRule(idx, -1)}
                              disabled={!canEditPolicy || idx === 0}
                              aria-label="上移规则"
                            >
                              ↑
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="size-8 rounded-md px-0 text-sm"
                              onClick={() => moveRule(idx, 1)}
                              disabled={!canEditPolicy || idx === rules.length - 1}
                              aria-label="下移规则"
                            >
                              ↓
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-md px-3 text-sm font-semibold"
                              onClick={() => openEdit(idx)}
                              disabled={!canEditPolicy}
                            >
                              编辑
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-8 gap-1.5 rounded-md px-3 text-sm font-semibold"
                              onClick={() => removeRule(idx)}
                              disabled={!canEditPolicy}
                            >
                              <Trash2 className="size-3.5" />
                              删除
                            </Button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-3">
                          <div className="rounded-md bg-muted px-3 py-2">
                            <div className="text-xs font-medium text-muted-foreground">
                              匹配范围
                            </div>
                            <div className="mt-1 truncate font-semibold text-foreground/85">
                              {(r.match?.extensions || []).join(', ') || '任意文件'}
                            </div>
                          </div>
                          <div className="rounded-md bg-muted px-3 py-2">
                            <div className="text-xs font-medium text-muted-foreground">
                              解析方式
                            </div>
                            <div className="mt-1 truncate font-semibold text-foreground/85">
                              {r.parser_backend || '默认'} · 预处理{' '}
                              {r.preprocess?.enabled ? (r.preprocess?.steps || []).length : 0}
                            </div>
                          </div>
                          <div className="rounded-md bg-muted px-3 py-2">
                            <div className="text-xs font-medium text-muted-foreground">
                              切片方式
                            </div>
                            <div className="mt-1 truncate font-semibold text-foreground/85">
                              {r.chunk_strategy || r.governance_profile_ref || '数据集默认'}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge
                            variant="outline"
                            className="rounded-md border-border bg-muted/40 text-muted-foreground"
                          >
                            预处理：{r.preprocess?.enabled ? (r.preprocess?.steps || []).length : 0}{' '}
                            步
                          </Badge>
                          {r.parser_backend ? (
                            <Badge
                              variant="outline"
                              className="rounded-md border-border bg-muted/40 text-muted-foreground"
                            >
                              解析器：{r.parser_backend}
                            </Badge>
                          ) : null}
                          {r.chunk_strategy ? (
                            <Badge
                              variant="outline"
                              className="rounded-md border-border bg-muted/40 text-muted-foreground"
                            >
                              切片：{r.chunk_strategy}
                            </Badge>
                          ) : null}
                          {r.governance_profile_ref ? (
                            <Badge
                              variant="outline"
                              className="rounded-md border-border bg-muted/40 text-muted-foreground"
                            >
                              治理预设：{r.governance_profile_ref}
                            </Badge>
                          ) : null}
                          {r.pipeline_patch && Object.keys(r.pipeline_patch || {}).length > 0 ? (
                            <Badge
                              variant="outline"
                              className="rounded-md border-border bg-muted/40 text-muted-foreground"
                            >
                              高级参数：{Object.keys(r.pipeline_patch || {}).length} 项
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Panel>

            <Panel
              className={cn(
                ingestionPanelClass,
                'flex min-h-[520px] flex-col overflow-hidden xl:min-h-0'
              )}
            >
              <div className={cn(ingestionPanelHeaderClass, 'space-y-3')}>
                <div className="flex items-start gap-3">
                  <div className={ingestionIconPillClass}>
                    <Sparkles className="size-4 text-info" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-foreground">入库预览</div>
                    <div className="mt-1 text-sm leading-5 text-muted-foreground">
                      上传样例文件，按当前策略执行匹配、预处理、解析和治理检查。
                    </div>
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">样例文件</span>
                    {previewFile ? (
                      <span className="truncate font-mono text-xs text-muted-foreground">
                        {previewFile.name}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Input
                      type="file"
                      className="h-10 w-full min-w-0 rounded-md border-border bg-card text-sm shadow-none"
                      onChange={(e) => onPreviewFileChange(e.target.files?.[0] || null)}
                    />
                    <Button
                      onClick={runPreview}
                      disabled={!previewFile || previewing || !activePolicy}
                      className="h-10 w-full shrink-0 gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-none hover:bg-primary/90"
                    >
                      {previewing ? (
                        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                      ) : (
                        <Sparkles className="size-4" />
                      )}
                      生成预览
                    </Button>
                  </div>
                  {previewError ? (
                    <div
                      role="alert"
                      className="mt-3 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                    >
                      {previewError}
                    </div>
                  ) : null}
                </div>
              </div>

              {preview ? (
                <div className="flex-1 space-y-3 bg-background p-4 xl:min-h-0 xl:overflow-y-auto no-scrollbar">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge
                      variant={preview.rule?.matched ? 'soft' : 'outline'}
                      className="rounded-md"
                    >
                      规则命中：{preview.rule?.matched ? '是' : '否'}
                    </Badge>
                    {preview.rule?.rule_name ? (
                      <Badge variant="outline" className="rounded-md">
                        {preview.rule.rule_name}
                      </Badge>
                    ) : null}
                    <Badge variant="outline" className="rounded-md font-mono">
                      解析器：{preview.rule?.parser_backend}
                    </Badge>
                    {preview.rule?.chunk_strategy ? (
                      <Badge variant="outline" className="rounded-md font-mono">
                        切片：{preview.rule.chunk_strategy}
                      </Badge>
                    ) : null}
                    {preview.rule?.governance_profile_ref ? (
                      <Badge variant="outline" className="rounded-md font-mono">
                        治理预设：{preview.rule.governance_profile_ref}
                      </Badge>
                    ) : null}
                    <Badge variant="outline" className="rounded-md font-mono">
                      预处理有变化：{preview.preprocess?.changed ? '是' : '否'}
                    </Badge>
                  </div>

                  {Array.isArray(preview.clean?.issues) && preview.clean.issues.length > 0 ? (
                    <Panel
                      variant="muted"
                      className="rounded-md border-warning/30 bg-warning/5 p-4 shadow-none"
                    >
                      <div className="mb-2 text-sm font-semibold text-foreground">检测到的问题</div>
                      <div className="space-y-2">
                        {preview.clean.issues.slice(0, 8).map((it) => (
                          <div
                            key={`${it.code}-${it.message}`}
                            className="text-xs leading-5 text-foreground/85 dark:text-muted-foreground"
                          >
                            <span className="font-mono text-muted-foreground">{it.severity}</span>{' '}
                            <span className="font-mono">{it.code}</span> · {it.message}
                            {it.count ? (
                              <span className="text-muted-foreground"> ×{it.count}</span>
                            ) : null}
                          </div>
                        ))}
                        {preview.clean.issues.length > 8 ? (
                          <div className="text-xs text-muted-foreground">
                            … 还有 {preview.clean.issues.length - 8} 条
                          </div>
                        ) : null}
                      </div>
                    </Panel>
                  ) : null}

                  <div className="grid grid-cols-1 gap-3">
                    <Panel
                      variant="muted"
                      className="overflow-hidden rounded-md border-border bg-card p-0 shadow-none"
                    >
                      <div className="border-b border-border px-4 py-3 text-sm font-semibold">
                        解析后 Markdown
                      </div>
                      <pre className="max-h-[260px] overflow-y-auto whitespace-pre-wrap p-4 text-xs leading-relaxed no-scrollbar">
                        {preview.parse?.markdown || ''}
                      </pre>
                    </Panel>
                    <Panel
                      variant="muted"
                      className="overflow-hidden rounded-md border-border bg-card p-0 shadow-none"
                    >
                      <div className="border-b border-border px-4 py-3 text-sm font-semibold">
                        治理后 Markdown
                      </div>
                      <pre className="max-h-[260px] overflow-y-auto whitespace-pre-wrap p-4 text-xs leading-relaxed no-scrollbar">
                        {preview.clean?.markdown || ''}
                      </pre>
                    </Panel>
                  </div>

                  {preview.clean?.diff_unified ? (
                    <Panel
                      variant="muted"
                      className="overflow-hidden rounded-md border-border bg-foreground p-0 text-muted-foreground/30 shadow-none"
                    >
                      <div className="border-b border-border/20 px-4 py-3 text-sm font-semibold">
                        治理差异
                      </div>
                      <pre className="max-h-[320px] overflow-y-auto whitespace-pre p-4 font-mono text-xs leading-relaxed no-scrollbar">
                        {preview.clean.diff_unified}
                      </pre>
                    </Panel>
                  ) : null}
                </div>
              ) : (
                <div className="flex flex-1 flex-col justify-between bg-background p-4">
                  <div className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-5 text-sm leading-6 text-muted-foreground">
                    选择 HTML、PDF、DOCX 或 CSV 样例后生成预览，用于检查策略命中和治理差异。
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
                    <div className="rounded-md bg-muted px-3 py-2">1. 确认命中规则是否符合预期</div>
                    <div className="rounded-md bg-muted px-3 py-2">
                      2. 检查解析结果与治理结果差异
                    </div>
                    <div className="rounded-md bg-muted px-3 py-2">3. 保存策略并重建相关索引</div>
                  </div>
                </div>
              )}
            </Panel>
          </div>
        </div>

        <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
          <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-3xl overflow-y-auto rounded-md border-border bg-background shadow-lg">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-foreground">
                {editingIndex == null ? '新增规则' : '编辑规则'}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                规则按从上到下的顺序匹配。扩展名支持 .pdf 或 pdf 两种写法，文件名正则可以留空。
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>规则 ID（唯一）</Label>
                  <Input
                    value={draft.id}
                    onChange={(e) => setDraft({ ...draft, id: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>规则名称</Label>
                  <Input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border border-border p-3">
                  <div>
                    <div className="text-sm font-semibold">启用规则</div>
                    <div className="text-xs text-muted-foreground">禁用后不会被匹配</div>
                  </div>
                  <Switch
                    checked={draft.enabled}
                    onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>匹配扩展名（逗号分隔，空=任意）</Label>
                  <Input
                    value={draft.extensionsText}
                    onChange={(e) => setDraft({ ...draft, extensionsText: e.target.value })}
                    placeholder=".pdf, .docx, .html"
                  />
                </div>
                <div className="space-y-2">
                  <Label>文件名正则（可选）</Label>
                  <Input
                    value={draft.filenameRegex}
                    onChange={(e) => setDraft({ ...draft, filenameRegex: e.target.value })}
                    placeholder="例如：(?i)invoice|发票"
                  />
                </div>

                <Panel variant="muted" className="rounded-md p-4 shadow-none">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">解析前预处理</div>
                      <div className="text-xs text-muted-foreground">
                        在解析前对原始文件做修复/清洗
                      </div>
                    </div>
                    <Switch
                      checked={draft.preprocessEnabled}
                      onCheckedChange={(v) => setDraft({ ...draft, preprocessEnabled: v })}
                    />
                  </div>
                  <div
                    className={cn(
                      'mt-3 space-y-2',
                      !draft.preprocessEnabled && 'opacity-50 pointer-events-none'
                    )}
                  >
                    {PREPROCESS_STEP_CATALOG.map((s) => {
                      const checked = draft.preprocessStepIds.includes(s.id)
                      return (
                        <div
                          key={s.id}
                          className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 transition-colors hover:bg-muted/30"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              const next = new Set(draft.preprocessStepIds)
                              if (v) next.add(s.id)
                              else next.delete(s.id)
                              setDraft({ ...draft, preprocessStepIds: Array.from(next) })
                            }}
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-medium">{s.label}</div>
                            <div className="text-xs text-muted-foreground">{s.desc}</div>
                            <div className="mt-1 font-mono text-xs text-muted-foreground">
                              {s.id}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </Panel>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>解析后端（可选覆盖）</Label>
                  <Select
                    value={draft.parserBackend || NONE}
                    onValueChange={(v) =>
                      setDraft({ ...draft, parserBackend: v === NONE ? '' : v })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="不覆盖（使用默认/手动选择）" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>不覆盖</SelectItem>
                      {PARSER_BACKEND_REGISTRY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-muted-foreground">
                    PDF 可保持自动选择；网页和 Office 文档可根据当前服务状态选择 pandoc 或
                    markitdown。
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>切片策略（可选覆盖）</Label>
                  <Select
                    value={draft.chunkStrategy || NONE}
                    onValueChange={(v) =>
                      setDraft({ ...draft, chunkStrategy: v === NONE ? '' : v })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="不覆盖" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>不覆盖</SelectItem>
                      {chunkStrategyOptions.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>治理预设（可选）</Label>
                  <Select
                    value={draft.governanceProfileRef || NONE}
                    onValueChange={(v) =>
                      setDraft({ ...draft, governanceProfileRef: v === NONE ? '' : v })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="不使用预设" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>不使用预设</SelectItem>
                      {profiles.map((p) => (
                        <SelectItem key={p.key || p.id || p.name} value={p.key || p.id || p.name}>
                          {p.is_system ? '内置' : '自定义'} · {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-muted-foreground">
                    预设会自动应用治理参数和正则规则，保存时仍会进行安全校验。
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>高级策略参数（JSON，可选）</Label>
                  <Textarea
                    value={draft.pipelinePatchJson}
                    onChange={(e) => setDraft({ ...draft, pipelinePatchJson: e.target.value })}
                    placeholder={`{\n  "governance_enabled": true,\n  "governance_remove_boilerplate": true\n}`}
                    className="min-h-[220px] rounded-md font-mono text-xs"
                  />
                  <div className="text-xs text-muted-foreground">
                    仅支持系统允许的处理参数，未知字段无法保存。
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button variant="ghost" onClick={() => setEditorOpen(false)}>
                取消
              </Button>
              <Button onClick={applyDraft}>保存规则</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
          <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-3xl overflow-y-auto rounded-md border-border bg-background shadow-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                入库策略模板
              </DialogTitle>
              <DialogDescription>
                一键生成常用规则组合（可追加/替换）。注意：规则按从上到下命中，必要时请调整顺序。
              </DialogDescription>
            </DialogHeader>

            <div className="divide-y divide-border">
              {INGESTION_POLICY_TEMPLATES.map((tpl) => (
                <div key={tpl.key} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="font-semibold">{tpl.name}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{tpl.description}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {tpl.tags.map((t) => (
                          <Badge key={t} variant="outline" className="rounded-md font-mono text-xs">
                            {t}
                          </Badge>
                        ))}
                        <Badge variant="soft" className="rounded-md text-xs">
                          {tpl.rules.length} 条规则
                        </Badge>
                      </div>
                    </div>
                    <div className="grid shrink-0 grid-cols-1 gap-2 sm:w-32">
                      <Button
                        size="sm"
                        className="rounded-md"
                        onClick={() => applyTemplate(tpl, 'prepend')}
                      >
                        追加到顶部
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-md"
                        onClick={() => applyTemplate(tpl, 'append')}
                      >
                        追加到底部
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="rounded-md"
                        onClick={() => applyTemplate(tpl, 'replace')}
                      >
                        替换当前策略
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter className="mt-2">
              <Button variant="ghost" onClick={() => setTemplatesOpen(false)}>
                关闭
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={navigationGuard.navigationPending}
          onOpenChange={(open) => {
            if (!open) navigationGuard.cancelNavigation()
          }}
        >
          <DialogContent className="rounded-md">
            <DialogHeader>
              <DialogTitle>{saving ? '保存尚未完成' : '离开入库策略？'}</DialogTitle>
              <DialogDescription>
                {saving
                  ? '请等待当前保存完成，再离开此页面。'
                  : '当前更改尚未保存，离开后这些更改会丢失。'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={navigationGuard.cancelNavigation}>
                继续编辑
              </Button>
              <Button
                variant="destructive"
                onClick={navigationGuard.confirmNavigation}
                disabled={saving}
              >
                放弃更改并离开
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DatasetDetailShell>
    </AppFrame>
  )
}
