'use client'

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Braces, FileText, Loader2, Play, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from '@/i18n/navigation'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { UnsavedChangesDialog } from '@/components/ui/unsaved-changes-dialog'
import { useUnsavedNavigationGuard } from '@/hooks/use-unsaved-navigation-guard'
import { governanceApi, pipelineApi } from '@/lib/api'
import { formatApiError } from '@/lib/api-errors'
import { reportClientWarning } from '@/lib/client-logging'
import { coerceOneOf } from '@/lib/one-of'
import { cn, detachPromise } from '@/lib/utils'
import type {
  CleanPreviewResponse,
  DocumentPipelineOptions,
  GovernanceProfileCreate,
  GovernanceProfileOut,
  GovernanceProfilePayload,
  RegexRuleModel,
} from '@/types'
import {
  buildCleanPreviewRequestFromGovernanceProfile,
  buildGovernanceProfilePayload,
  governanceProfileDraftFingerprint,
  parseGovernancePipelinePatchJson,
} from '@/lib/governance-profile-utils'
import { CleanPreviewRuleStatsPanel } from '@/components/governance-profiles/clean-preview-rule-stats-panel'

type Mode = 'create' | 'edit' | 'view'

type Props = {
  open: boolean
  mode: Mode
  profileRef?: string | null
  seedCreate?: GovernanceProfileCreate | null
  onOpenChange: (open: boolean) => void
  onSaved?: (profile: GovernanceProfileOut) => void
  onCreated?: (profile: GovernanceProfileOut) => void
}

const PROFILE_EDITOR_TABS = ['edit', 'test'] as const
const PROFILE_INPUT_FORMAT_VALUES = ['markdown', 'html'] as const

const GOVERNANCE_SWITCHES: Array<{
  key: keyof DocumentPipelineOptions
  label: string
  description: string
  effect: string
  defaultChecked: boolean
}> = [
  {
    key: 'governance_enabled',
    label: '启用治理清洗',
    description: '打开后才会执行下面这些清洗步骤。',
    effect: '关闭时只保留原始解析结果，不做清洗。',
    defaultChecked: true,
  },
  {
    key: 'governance_unwrap_lines',
    label: '合并异常换行',
    description: '修复 PDF/网页复制导致的一句话被拆成多行。',
    effect: '检索片段更连贯，减少短碎句。',
    defaultChecked: true,
  },
  {
    key: 'governance_remove_common_lines',
    label: '去重复页眉页脚',
    description: '删除多页文档里反复出现的公司名、页码、版权行。',
    effect: '降低噪声分块和重复召回。',
    defaultChecked: true,
  },
  {
    key: 'governance_remove_toc_lines',
    label: '移除目录行',
    description: '识别“1.2 标题 ...... 12”这类目录/索引行。',
    effect: '避免目录页被当成正文入库。',
    defaultChecked: true,
  },
  {
    key: 'governance_remove_noise_lines',
    label: '清理低价值噪声',
    description: '过滤孤立符号、过短碎片、明显导航残留。',
    effect: '让 Markdown 更像可读正文。',
    defaultChecked: true,
  },
  {
    key: 'governance_remove_boilerplate',
    label: '去模板化废话',
    description: '删除网页横幅、cookie 提示、固定免责声明等样板文本。',
    effect: '适合网页导入、知识库导出和聊天记录。',
    defaultChecked: false,
  },
  {
    key: 'governance_normalize_tables',
    label: '整理 Markdown 表格',
    description: '规范表格空格、列宽和分隔符。',
    effect: '让表格更稳定地进入切块和检索。',
    defaultChecked: false,
  },
  {
    key: 'governance_normalize_urls',
    label: '规范链接',
    description: '统一 URL 表达，可配合去掉 utm 等跟踪参数。',
    effect: '减少同一链接的重复写入。',
    defaultChecked: false,
  },
]

const RULE_PACK_COPY: Record<string, { label: string; description: string }> = {
  chat_export_noise: {
    label: '聊天导出噪声',
    description: '清理会话导出里的时间戳、系统提示和重复分隔符。',
  },
  cn_finance_report_artifacts: {
    label: '金融报告噪声',
    description: '清理年报、公告、招股书中常见披露声明和证券标识行。',
  },
  cn_gov_redhead_artifacts: {
    label: '政府公文尾部',
    description: '清理红头公文中的抄送、签发、印发和主题词等低价值行。',
  },
  cn_medical_record_artifacts: {
    label: '医疗记录表头',
    description: '清理病案号、床号、医生、科室等医疗文档展示性字段。',
  },
  confluence_jira_noise: {
    label: 'Confluence / Jira 残留',
    description: '清理企业知识库导出的导航、面包屑和页面脚注。',
  },
  email_disclaimer: {
    label: '邮件免责声明',
    description: '删除邮件尾部的保密声明、转发脚注和冗余签名。',
  },
  feishu_lark_noise: {
    label: '飞书 / Lark 导出',
    description: '清理飞书知识库导出的元信息、协作者和导出标识。',
  },
  markdown_export_noise: {
    label: 'Markdown 导出噪声',
    description: '清理导出工具生成的锚点、空标题和重复标记。',
  },
  notion_export_noise: {
    label: 'Notion 导出噪声',
    description: '处理 Notion 导出中的创建时间、编辑时间和导出标识。',
  },
  pdf_header_footer_cn: {
    label: '中文 PDF 页眉页脚',
    description: '针对中文 PDF 的页码、页眉、页脚重复行。',
  },
  pdf_watermark: {
    label: 'PDF 水印',
    description: '删除扫描件或导出 PDF 中常见水印文本。',
  },
  web_cookie_banners: {
    label: '网页 Cookie 横幅',
    description: '过滤 cookie 同意、隐私提示等网页固定横幅。',
  },
  web_navigation: {
    label: '网页导航菜单',
    description: '清理网页导入里的导航栏、侧栏和页脚链接。',
  },
  wechat_mp_noise: {
    label: '微信公众号噪声',
    description: '清理公众号转载、来源、二维码和阅读提示类文本。',
  },
}

const INPUT_FORMAT_COPY: Record<
  'markdown' | 'html',
  { label: string; description: string }
> = {
  markdown: {
    label: 'Markdown / 纯文本',
    description: '适合 PDF、Office、TXT 解析后的正文。',
  },
  html: {
    label: 'HTML / 网页',
    description: '适合网页、知识库导出和富文本源。',
  },
}

function defaultPayload(): GovernanceProfilePayload {
  return {
    version: '1',
    input_formats: ['markdown'],
    pipeline_patch: {
      governance_enabled: true,
      governance_remove_toc_lines: true,
      governance_remove_noise_lines: true,
      governance_unwrap_lines: true,
      governance_remove_common_lines: true,
      governance_max_blank_lines: 1,
    },
    regex_rules: [],
  }
}

function applyPipelinePatchUpdate(
  key: keyof DocumentPipelineOptions,
  value: DocumentPipelineOptions[keyof DocumentPipelineOptions],
  setPipelinePatch: Dispatch<SetStateAction<DocumentPipelineOptions>>,
  setPatchJsonError: Dispatch<SetStateAction<string | null>>,
  setPatchJsonDirty: Dispatch<SetStateAction<boolean>>,
) {
  setPipelinePatch((prev) => ({ ...prev, [key]: value }))
  setPatchJsonError(null)
  setPatchJsonDirty(false)
}

function pythonReFlagsToJs(flags: number): string {
  // 将常用 Python 正则选项映射到浏览器可校验的选项。
  let out = ''
  const n = Number(flags || 0)
  if (n & 2) out += 'i'
  if (n & 8) out += 'm'
  if (n & 16) out += 's'
  return out
}

function stripLeadingInlineFlags(pattern: string): { pattern: string; inlineJsFlags: string } {
  const raw = String(pattern || '')
  const match = /^\(\?([A-Za-z]+)\)/.exec(raw)
  if (!match) return { pattern: raw, inlineJsFlags: '' }
  const flags = match[1] || ''
  let js = ''
  for (const ch of flags) {
    if (ch === 'i' && !js.includes('i')) js += 'i'
    if (ch === 'm' && !js.includes('m')) js += 'm'
    if (ch === 's' && !js.includes('s')) js += 's'
  }
  return { pattern: raw.slice(match[0].length), inlineJsFlags: js }
}

function validateRegexRuleBestEffort(pattern: string, flags: number): string | null {
  const raw = String(pattern || '').trim()
  if (!raw) return '请输入匹配表达式'

  // 替换 Python 常用边界写法后，仅做前端格式预检。
  const stripped = stripLeadingInlineFlags(raw)
  const jsFlags = Array.from(new Set((pythonReFlagsToJs(flags) + stripped.inlineJsFlags).split(''))).join('')
  const jsPattern = stripped.pattern
    .replaceAll(String.raw`\A`, '^')
    .replaceAll(String.raw`\Z`, '$')

  try {
    new RegExp(jsPattern, jsFlags)
    return null
  } catch {
    return '表达式格式有误，请检查括号和转义符'
  }
}

export function ProfileEditorDrawer({
  open,
  mode,
  profileRef,
  seedCreate,
  onOpenChange,
  onSaved,
  onCreated,
}: Readonly<Props>) {
  const isReadOnly = mode === 'view'
  const isCreate = mode === 'create'
  const router = useRouter()

  const [activeTab, setActiveTab] = useState<'edit' | 'test'>('edit')
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [saving, setSaving] = useState(false)

  const [loadedProfile, setLoadedProfile] = useState<GovernanceProfileOut | null>(null)
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [description, setDescription] = useState('')
  const [inputFormats, setInputFormats] = useState<Array<'markdown' | 'html'>>(['markdown'])
  const [pipelinePatch, setPipelinePatch] = useState<DocumentPipelineOptions>({})
  const [regexRules, setRegexRules] = useState<RegexRuleModel[]>([])
  const [availableRulePacks, setAvailableRulePacks] = useState<string[]>([])
  const [loadingRulePacks, setLoadingRulePacks] = useState(false)

  const [patchJson, setPatchJson] = useState('')
  const [patchJsonError, setPatchJsonError] = useState<string | null>(null)
  const [patchJsonDirty, setPatchJsonDirty] = useState(false)
  const [savedDraftFingerprint, setSavedDraftFingerprint] = useState('')
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false)

  // 模板效果测试状态。
  const [testInputFormat, setTestInputFormat] = useState<'markdown' | 'html'>('markdown')
  const [testHtmlXPath, setTestHtmlXPath] = useState('')
  const [testInput, setTestInput] = useState<string>('# Sample\n\nfoo')
  const [testRunning, setTestRunning] = useState(false)
  const [testResp, setTestResp] = useState<CleanPreviewResponse | null>(null)

  const payload: GovernanceProfilePayload = useMemo(
    () =>
      buildGovernanceProfilePayload(
        isCreate ? seedCreate?.payload : loadedProfile?.payload,
        inputFormats,
        pipelinePatch,
        regexRules
      ),
    [inputFormats, isCreate, loadedProfile, pipelinePatch, regexRules, seedCreate]
  )
  const currentDraftFingerprint = useMemo(
    () =>
      governanceProfileDraftFingerprint({
        name,
        key,
        description,
        payload,
      }),
    [description, key, name, payload]
  )
  const hasUnsavedChanges =
    open &&
    !isReadOnly &&
    Boolean(savedDraftFingerprint) &&
    (patchJsonDirty || currentDraftFingerprint !== savedDraftFingerprint)
  const navigate = useCallback((href: string) => router.push(href), [router])
  const navigationGuard = useUnsavedNavigationGuard({
    enabled: hasUnsavedChanges,
    onNavigate: navigate,
  })

  const selectedRulePacks = useMemo(
    () => (Array.isArray(pipelinePatch?.governance_rule_packs) ? pipelinePatch.governance_rule_packs : []),
    [pipelinePatch]
  )

  const resetDraft = useCallback(() => {
    setLoadedProfile(null)
    setName('')
    setKey('')
    setDescription('')
    setInputFormats(['markdown'])
    setPipelinePatch(defaultPayload().pipeline_patch)
    setRegexRules([])
    setPatchJson(JSON.stringify(defaultPayload().pipeline_patch, null, 2))
    setPatchJsonError(null)
    setPatchJsonDirty(false)
    setSavedDraftFingerprint('')
    setDiscardConfirmOpen(false)
    setActiveTab('edit')
    setTestResp(null)
    setTestInput('# Sample\n\nfoo')
    setTestInputFormat('markdown')
    setTestHtmlXPath('')
  }, [])

  const closeDrawer = useCallback(() => {
    resetDraft()
    onOpenChange(false)
  }, [onOpenChange, resetDraft])

  const handleDrawerOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        onOpenChange(true)
        return
      }
      if (hasUnsavedChanges) {
        setDiscardConfirmOpen(true)
        return
      }
      closeDrawer()
    },
    [closeDrawer, hasUnsavedChanges, onOpenChange]
  )

  // Load profile when opening (edit/view).
  useEffect(() => {
    if (!open) return

    if (isCreate) {
      const seeded = seedCreate
      const p = seeded?.payload || defaultPayload()
      setLoadedProfile(null)
      setName(seeded ? String(seeded.name || '') : '')
      setKey(seeded && typeof seeded.key === 'string' ? String(seeded.key || '') : '')
      setDescription(seeded ? String(seeded.description || '') : '')
      setInputFormats(p.input_formats)
      setPipelinePatch(p.pipeline_patch)
      setRegexRules(p.regex_rules)
      setPatchJson(JSON.stringify(p.pipeline_patch, null, 2))
      setPatchJsonError(null)
      setPatchJsonDirty(false)
      setSavedDraftFingerprint(
        governanceProfileDraftFingerprint({
          name: seeded ? String(seeded.name || '') : '',
          key:
            seeded && typeof seeded.key === 'string'
              ? String(seeded.key || '')
              : '',
          description: seeded ? String(seeded.description || '') : '',
          payload: buildGovernanceProfilePayload(
            p,
            p.input_formats,
            p.pipeline_patch,
            p.regex_rules
          ),
        })
      )
      setActiveTab('edit')
      setTestResp(null)
      return
    }

    const ref = (profileRef || '').trim()
    if (!ref) return

    let cancelled = false
    setLoadingProfile(true)
    detachPromise((async () => {
      try {
        const prof = await pipelineApi.getGovernanceProfile(ref)
        if (cancelled) return
        setLoadedProfile(prof)
        setName(String(prof.name || ''))
        setKey(String(prof.key || ''))
        setDescription(String(prof.description || ''))
        setInputFormats(prof.payload?.input_formats || ['markdown'])
        setPipelinePatch(prof.payload?.pipeline_patch ?? {})
        setRegexRules(prof.payload?.regex_rules ?? [])
        setPatchJson(JSON.stringify(prof.payload?.pipeline_patch ?? {}, null, 2))
        setPatchJsonError(null)
        setPatchJsonDirty(false)
        setSavedDraftFingerprint(
          governanceProfileDraftFingerprint({
            name: String(prof.name || ''),
            key: String(prof.key || ''),
            description: String(prof.description || ''),
            payload: buildGovernanceProfilePayload(
              prof.payload,
              prof.payload?.input_formats || ['markdown'],
              prof.payload?.pipeline_patch ?? {},
              prof.payload?.regex_rules ?? []
            ),
          })
        )
        setActiveTab('edit')
        setTestResp(null)
      } catch (err: unknown) {
        toast.error(formatApiError(err, '加载治理模板失败'))
      } finally {
        if (!cancelled) setLoadingProfile(false)
      }
    })())

    return () => {
      cancelled = true
    }
  }, [open, isCreate, profileRef, seedCreate])

  // 加载服务端提供的场景清洗规则。
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingRulePacks(true)
    detachPromise((async () => {
      try {
        const resp = await governanceApi.listRulePacks()
        if (cancelled) return
        setAvailableRulePacks(Array.isArray(resp.items) ? resp.items : [])
      } catch (err) {
        reportClientWarning('Load governance rule packs failed', err)
        if (!cancelled) setAvailableRulePacks([])
      } finally {
        if (!cancelled) setLoadingRulePacks(false)
      }
    })())
    return () => {
      cancelled = true
    }
  }, [open])

  // 保持高级 JSON 与常用设置同步。
  useEffect(() => {
    if (!open) return
    // 用户正在修正 JSON 时，不覆盖当前输入。
    if (patchJsonError) return
    if (patchJsonDirty) return
    setPatchJson(JSON.stringify(pipelinePatch, null, 2))
  }, [pipelinePatch, open, patchJsonError, patchJsonDirty])

  const toggleInputFormat = (fmt: 'markdown' | 'html') => {
    setInputFormats((prev) => {
      const set = new Set(prev)
      if (set.has(fmt)) set.delete(fmt)
      else set.add(fmt)
      const next = Array.from(set)
      return next.length ? next : ['markdown']
    })
  }

  const updatePatchValue = <K extends keyof DocumentPipelineOptions>(
    key: K,
    value: DocumentPipelineOptions[K],
  ) => {
    applyPipelinePatchUpdate(key, value, setPipelinePatch, setPatchJsonError, setPatchJsonDirty)
  }

  const updatePatchBoolean = (key: keyof DocumentPipelineOptions, value: boolean) => {
    applyPipelinePatchUpdate(
      key,
      value,
      setPipelinePatch,
      setPatchJsonError,
      setPatchJsonDirty
    )
  }

  const toggleRulePack = (pack: string) => {
    const key = pack.trim()
    if (!key) return
    setPipelinePatch((prev) => {
      const current = Array.isArray(prev?.governance_rule_packs) ? prev.governance_rule_packs : []
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return {
        ...prev,
        governance_rule_packs: Array.from(next).sort((a, b) => a.localeCompare(b)),
      }
    })
    setPatchJsonError(null)
    setPatchJsonDirty(false)
  }

  const applyPatchJson = () => {
    const parsed = parseGovernancePipelinePatchJson(patchJson)
    if (!parsed.ok) {
      setPatchJsonError(parsed.error)
      return
    }
    setPatchJsonError(null)
    setPatchJsonDirty(false)
    setPipelinePatch(parsed.value)
  }

  const addRule = () => {
    setRegexRules((prev) => [...(prev || []), { pattern: '', repl: '', flags: 0 }])
  }

  const updateRule = (idx: number, patch: Partial<RegexRuleModel>) => {
    setRegexRules((prev) => {
      const next = [...(prev || [])]
      const cur = next[idx] || {}
      next[idx] = { ...cur, ...patch }
      return next
    })
  }

  const removeRule = (idx: number) => {
    setRegexRules((prev) => (prev || []).filter((_, i) => i !== idx))
  }

  const canSave = !isReadOnly && !saving && !loadingProfile
  const enabledGovernanceSwitchCount = GOVERNANCE_SWITCHES.filter((item) =>
    Boolean(pipelinePatch?.[item.key] ?? item.defaultChecked)
  ).length
  const imageRemovalMode = String(pipelinePatch?.governance_remove_images ?? 'none')
  const maxBlankLines = Number(pipelinePatch?.governance_max_blank_lines ?? 1)
  const drawerTitle = isCreate
    ? '新建治理模板'
    : isReadOnly
      ? '查看治理模板'
      : '编辑治理模板'
  const drawerDescription = isCreate
    ? '保存常用的文档清洗和入库规则。'
    : loadedProfile?.is_system
      ? '系统模板只能查看，可以复制后再调整。'
      : '修改只会用于后续入库或重新处理，不会改动历史版本。'

  const save = async () => {
    if (!canSave) return
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error('请输入模板名称')
      return
    }

    let payloadToSave = payload
    if (patchJsonDirty) {
      const parsed = parseGovernancePipelinePatchJson(patchJson)
      if (!parsed.ok) {
        setPatchJsonError(parsed.error)
        toast.error(`无法保存：${parsed.error}`)
        return
      }
      setPatchJsonError(null)
      setPatchJsonDirty(false)
      setPipelinePatch(parsed.value)
      payloadToSave = buildGovernanceProfilePayload(
        isCreate ? seedCreate?.payload : loadedProfile?.payload,
        inputFormats,
        parsed.value,
        regexRules
      )
    }

    setSaving(true)
    try {
      if (isCreate) {
        const payloadCreate: GovernanceProfileCreate = {
          name: trimmedName,
          description: description.trim() || undefined,
          payload: payloadToSave,
        }
        const k = key.trim()
        if (k) payloadCreate.key = k
        const created = await pipelineApi.createGovernanceProfile(payloadCreate)
        toast.success('治理模板已创建')
        onCreated?.(created)
        closeDrawer()
      } else {
        const ref = (profileRef || '').trim()
        if (!ref) {
          toast.error('未找到要保存的治理模板')
          return
        }
        const updated = await pipelineApi.updateGovernanceProfile(ref, {
          name: trimmedName,
          description: description.trim() || '',
          payload: payloadToSave,
          expected_updated_at: loadedProfile?.updated_at || undefined,
        })
        toast.success('治理模板已保存')
        onSaved?.(updated)
        closeDrawer()
      }
    } catch (err: unknown) {
      toast.error(formatApiError(err, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  const runTest = async () => {
    setTestRunning(true)
    setTestResp(null)
    try {
      const req = buildCleanPreviewRequestFromGovernanceProfile(payload, testInput, {
        inputFormat: testInputFormat,
        htmlXPath: testHtmlXPath.trim() || undefined,
        includeDiff: true,
        diffMaxLines: 2000,
      })
      const resp = await pipelineApi.cleanPreview(req)
      setTestResp(resp)
      toast.success('清洗预览完成')
    } catch (err: unknown) {
      setTestResp(null)
      toast.error(formatApiError(err, '清洗预览失败'))
    } finally {
      setTestRunning(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleDrawerOpenChange}>
        <DialogContent
          className={cn(
            'fixed bottom-0 left-auto right-0 top-0 h-dvh w-full max-w-3xl translate-x-0 translate-y-0 rounded-none',
            'grid grid-rows-[auto,1fr] gap-0 overflow-hidden border-l border-border bg-background p-0 shadow-none'
          )}
        >
          <div className="border-b border-border bg-card px-4 py-4 pr-12 sm:px-5 sm:pr-12">
            <DialogHeader className="space-y-1">
              <DialogTitle className="flex items-center gap-2 text-base">
                <Braces className="size-5 text-primary" />
                {drawerTitle}
              </DialogTitle>
              <DialogDescription className="text-sm leading-5">
                {drawerDescription}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <Tabs
                value={activeTab}
                onValueChange={(value) =>
                  setActiveTab(
                    coerceOneOf(PROFILE_EDITOR_TABS, value, 'edit')
                  )
                }
              >
                <TabsList className="h-9 rounded-md">
                  <TabsTrigger value="edit" className="rounded-md px-3">
                    模板设置
                  </TabsTrigger>
                  <TabsTrigger value="test" className="rounded-md px-3">
                    效果测试
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {activeTab === 'test' ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-9 rounded-md"
                  onClick={() => detachPromise(runTest())}
                  disabled={testRunning}
                >
                  {testRunning ? (
                    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <Play className="size-4" />
                  )}
                  运行测试
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  className="h-9 rounded-md"
                  onClick={() => detachPromise(save())}
                  disabled={!canSave}
                >
                  {saving ? (
                    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  保存模板
                </Button>
              )}
            </div>
          </div>

          <div className="min-h-0 overflow-auto bg-background p-4 sm:p-5">
          {loadingProfile ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              加载中…
            </div>
          ) : (
            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(coerceOneOf(PROFILE_EDITOR_TABS, value, 'edit'))}
            >
              <TabsContent value="edit" className="mt-0">
                <div className="space-y-4">
                  <section className="rounded-md border border-border bg-card p-4">
                    <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border pb-3 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        当前设置
                      </span>
                      <span>启用 {enabledGovernanceSwitchCount} 项清洗</span>
                      <span>·</span>
                      <span>场景规则 {selectedRulePacks.length} 个</span>
                      <span>·</span>
                      <span>自定义规则 {regexRules.length} 条</span>
                      <span>·</span>
                      <span>空行最多 {maxBlankLines} 行</span>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="gp-name">模板名称</Label>
                        <Input
                          id="gp-name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          disabled={isReadOnly}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="gp-key">唯一标识（可选）</Label>
                        <Input
                          id="gp-key"
                          value={key}
                          onChange={(e) => setKey(e.target.value)}
                          disabled={!isCreate || isReadOnly}
                          placeholder={isCreate ? '例如：team:pdf_text' : undefined}
                        />
                        {isCreate ? null : (
                          <div className="text-xs text-muted-foreground">
                            模板标识创建后不能修改，入库规则可通过它调用此模板。
                          </div>
                        )}
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <Label htmlFor="gp-desc">用途说明</Label>
                        <Textarea
                          id="gp-desc"
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          disabled={isReadOnly}
                          className="min-h-[84px]"
                        />
                      </div>
                    </div>
                  </section>

                  <section className="rounded-md border border-border bg-card p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h2 className="text-sm font-semibold text-foreground">
                          适用内容类型
                        </h2>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          用于入库时提示应当选择哪套模板，不会阻止其他类型的内容。
                        </p>
                      </div>
                      <div className="grid w-full grid-cols-1 gap-2 sm:w-[360px] sm:grid-cols-2">
                        {PROFILE_INPUT_FORMAT_VALUES.map((fmt) => {
                          const selected = inputFormats.includes(fmt)
                          const copy = INPUT_FORMAT_COPY[fmt]
                          return (
                            <label
                              key={fmt}
                              className={cn(
                                'flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 transition-colors',
                                selected
                                  ? 'border-primary/40 bg-primary/10 text-foreground'
                                  : 'border-border bg-background text-muted-foreground hover:bg-muted/40',
                                isReadOnly && 'cursor-default'
                              )}
                            >
                              <Checkbox
                                className="mt-0.5"
                                checked={selected}
                                onCheckedChange={() => toggleInputFormat(fmt)}
                                disabled={isReadOnly}
                              />
                              <span className="min-w-0">
                                <span className="block text-xs font-semibold">
                                  {copy.label}
                                </span>
                                <span className="block text-xs leading-5 text-muted-foreground">
                                  {copy.description}
                                </span>
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  </section>

                  <section className="rounded-md border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-semibold text-foreground">
                          常用清洗步骤
                        </h2>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          选择文档入库前需要执行的处理步骤。
                        </p>
                      </div>
                      <span className="shrink-0 rounded-md border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">
                        已启用 {enabledGovernanceSwitchCount} / {GOVERNANCE_SWITCHES.length}
                      </span>
                    </div>
                    <div
                      data-profile-governance-switch-grid
                      className="mt-4 divide-y divide-border border-y border-border"
                    >
                      {GOVERNANCE_SWITCHES.map((item) => {
                        const checked = Boolean(pipelinePatch?.[item.key] ?? item.defaultChecked)
                        return (
                          <label
                            key={String(item.key)}
                            className={cn(
                              'flex cursor-pointer gap-3 px-1 py-3 transition-colors',
                              checked
                                ? 'bg-primary/5'
                                : 'hover:bg-muted/30',
                              isReadOnly && 'cursor-default'
                            )}
                          >
                            <Checkbox
                              className="mt-0.5"
                              checked={checked}
                              onCheckedChange={(v) => updatePatchBoolean(item.key, Boolean(v))}
                              disabled={isReadOnly}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="text-sm font-medium text-foreground">
                                {item.label}
                              </span>
                              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                                {item.description}
                              </span>
                              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                                {item.effect}
                              </span>
                            </span>
                          </label>
                        )
                      })}
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="border-t border-border pt-3">
                        <Label className="text-sm font-semibold text-foreground">
                          图片处理
                        </Label>
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">
                          只在确实影响检索时删除图片占位；默认建议保留。
                        </div>
                        <Select
                          value={imageRemovalMode}
                          onValueChange={(v) => updatePatchValue('governance_remove_images', v)}
                          disabled={isReadOnly}
                        >
                          <SelectTrigger className="mt-3 h-9 rounded-md border-border bg-card">
                            <SelectValue placeholder="保留图片" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">保留图片标记</SelectItem>
                            <SelectItem value="decorative">只移除装饰图片</SelectItem>
                            <SelectItem value="all">移除全部图片标记</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="border-t border-border pt-3">
                        <Label className="text-sm font-semibold text-foreground">
                          最大连续空行
                        </Label>
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">
                          控制清洗后 Markdown 的留白密度，通常 1 行最适合入库。
                        </div>
                        <Input
                          type="number"
                          min={0}
                          className="mt-3 h-9 rounded-md border-border bg-card"
                          value={String(maxBlankLines)}
                          onChange={(e) => updatePatchValue('governance_max_blank_lines', Number(e.target.value || 1))}
                          disabled={isReadOnly}
                        />
                      </div>
                    </div>
                  </section>

                  <section className="rounded-md border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-semibold text-foreground">
                          场景清洗规则
                        </h2>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          按文档来源选择即可，不必全部启用。
                        </p>
                      </div>
                      {loadingRulePacks ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                          加载中
                        </div>
                      ) : (
                        <span className="shrink-0 rounded-md border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">
                          已选 {selectedRulePacks.length} 个
                        </span>
                      )}
                    </div>

                    {availableRulePacks.length ? (
                      <div
                        data-profile-rule-pack-grid
                        className="mt-4 divide-y divide-border border-y border-border"
                      >
                        {availableRulePacks.map((pack) => {
                          const selected = selectedRulePacks.includes(pack)
                          const copy = RULE_PACK_COPY[pack] || {
                            label: pack.replaceAll('_', ' '),
                            description: '适用于当前来源的文档清洗规则。',
                          }
                          return (
                            <label
                              key={pack}
                              className={cn(
                                'flex cursor-pointer items-start gap-2 px-2 py-3 transition-colors',
                                selected
                                  ? 'bg-primary/5'
                                  : 'hover:bg-muted/30',
                                isReadOnly && 'cursor-default'
                              )}
                            >
                              <Checkbox
                                className="mt-0.5"
                                checked={selected}
                                onCheckedChange={() => toggleRulePack(pack)}
                                disabled={isReadOnly}
                              />
                              <span className="min-w-0">
                                <span className="block text-sm font-medium text-foreground">
                                  {copy.label}
                                </span>
                                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                                  {copy.description}
                                </span>
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="mt-3 text-sm text-muted-foreground">
                        {loadingRulePacks ? '正在加载规则' : '暂无可用场景规则'}
                      </div>
                    )}
                  </section>

                  <details
                    data-profile-advanced-json
                    className="group rounded-md border border-border bg-card"
                    open={Boolean(patchJsonError || patchJsonDirty)}
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                      <span>
                        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <Braces className="size-4 text-muted-foreground" />
                          高级配置 JSON
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                          仅供熟悉配置字段的管理员使用，常用设置会自动同步到这里。
                        </span>
                      </span>
                      <span className="shrink-0 rounded-md border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">
                        高级
                      </span>
                    </summary>
                    <div className="border-t border-border px-4 pb-4 pt-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-xs leading-5 text-muted-foreground">
                          修改后先应用配置。格式有误时不会覆盖当前设置。
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-9 rounded-md"
                          onClick={applyPatchJson}
                          disabled={isReadOnly}
                        >
                          应用 JSON
                        </Button>
                      </div>
                      <Textarea
                        value={patchJson}
                        onChange={(e) => {
                          setPatchJson(e.target.value)
                          setPatchJsonError(null)
                          setPatchJsonDirty(true)
                        }}
                        disabled={isReadOnly}
                        className={cn(
                          'mt-3 min-h-[180px] font-mono text-xs',
                          patchJsonError && 'aria-[invalid=true]'
                        )}
                        aria-invalid={patchJsonError ? 'true' : 'false'}
                      />
                      {patchJsonError ? (
                        <div className="mt-2 text-xs text-destructive">
                          JSON 格式有误：{patchJsonError}
                        </div>
                      ) : null}
                    </div>
                  </details>

                  <details
                    data-profile-regex-rules
                    className="group rounded-md border border-border bg-card"
                    open={regexRules.length > 0}
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                      <span>
                        <span className="text-sm font-semibold text-foreground">
                          自定义文本规则
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                          内置规则无法处理固定噪声时再添加。系统会检查表达式安全性和长度。
                        </span>
                      </span>
                      <span className="shrink-0 rounded-md border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">
                        {regexRules.length} 条
                      </span>
                    </summary>

                    <div className="border-t border-border px-4 pb-4 pt-3">
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-9 rounded-md"
                          onClick={addRule}
                          disabled={isReadOnly}
                        >
                          新增规则
                        </Button>
                      </div>
                      {regexRules.length ? (
                        <div className="mt-4 divide-y divide-border border-y border-border">
                        {regexRules.map((r, idx) => (
                          <div key={`regex-rule-${idx}`} className="py-3">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                              <div className="space-y-1 md:col-span-2">
                                <Label className="text-xs text-muted-foreground">
                                  匹配表达式
                                </Label>
                                <Input
                                  value={r.pattern || ''}
                                  onChange={(e) => updateRule(idx, { pattern: e.target.value })}
                                  disabled={isReadOnly}
                                  placeholder="(?mi)^..."
                                />
                                {(() => {
                                  const err = validateRegexRuleBestEffort(r.pattern || '', Number(r.flags ?? 0))
                                  return err ? <div className="text-xs text-destructive">{err}</div> : null
                                })()}
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">
                                  匹配选项
                                </Label>
                                <Input
                                  type="number"
                                  value={String(r.flags ?? 0)}
                                  onChange={(e) => updateRule(idx, { flags: Number(e.target.value || 0) })}
                                  disabled={isReadOnly}
                                />
                              </div>
                              <div className="space-y-1 md:col-span-3">
                                <Label className="text-xs text-muted-foreground">
                                  替换内容
                                </Label>
                                <Input
                                  value={r.repl || ''}
                                  onChange={(e) => updateRule(idx, { repl: e.target.value })}
                                  disabled={isReadOnly}
                                  placeholder=""
                                />
                              </div>
                            </div>
                            <div className="mt-3 flex justify-end">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-9 rounded-md text-destructive hover:text-destructive"
                                onClick={() => removeRule(idx)}
                                disabled={isReadOnly}
                              >
                                删除
                              </Button>
                            </div>
                          </div>
                        ))}
                        </div>
                      ) : (
                        <div className="mt-3 border-y border-dashed border-border px-1 py-4 text-sm text-muted-foreground">
                          暂无自定义规则。先使用上方的场景清洗规则，遇到固定噪声格式时再添加。
                        </div>
                      )}
                    </div>
                  </details>
                </div>
              </TabsContent>

              <TabsContent value="test" className="mt-0">
                <div className="space-y-4">
                  <section className="rounded-md border border-border bg-card p-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label>样例内容类型</Label>
                        <Select
                          value={testInputFormat}
                          onValueChange={(value) => setTestInputFormat(coerceOneOf(PROFILE_INPUT_FORMAT_VALUES, value, 'markdown'))}
                        >
                          <SelectTrigger className="h-10 rounded-md">
                            <SelectValue placeholder="选择内容类型" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="markdown">
                              Markdown / 纯文本
                            </SelectItem>
                            <SelectItem value="html">HTML / 网页</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label>网页正文定位规则（可选）</Label>
                        <Input
                          value={testHtmlXPath}
                          onChange={(e) => setTestHtmlXPath(e.target.value)}
                          disabled={testInputFormat !== 'html'}
                          placeholder="//article | //main"
                        />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <Label>粘贴一段样例内容</Label>
                        <Textarea
                          value={testInput}
                          onChange={(e) => setTestInput(e.target.value)}
                          className="min-h-[180px] font-mono text-xs"
                        />
                        <div className="text-xs leading-5 text-muted-foreground">
                          建议使用真实内容测试，结果会显示清洗后的正文、命中规则和改动对比。
                        </div>
                      </div>
                    </div>
                  </section>

                  {testResp ? (
                    <div className="grid grid-cols-1 gap-4">
                      <section className="rounded-md border border-border bg-card p-4">
                        <div className="flex items-center gap-2">
                          <FileText className="size-4 text-muted-foreground" />
                          <h2 className="text-sm font-semibold text-foreground">
                            清洗后的正文
                          </h2>
                        </div>
                        <Textarea
                          value={String(testResp.markdown || '')}
                          readOnly
                          className="mt-3 min-h-[220px] bg-muted/20 font-mono text-xs"
                        />
                      </section>

                      <CleanPreviewRuleStatsPanel ruleStats={testResp.rule_stats} />

                      {testResp.diff_unified ? (
                        <section className="rounded-md border border-border bg-card p-4">
                          <div className="flex items-center gap-2">
                            <Braces className="size-4 text-muted-foreground" />
                            <h2 className="text-sm font-semibold text-foreground">
                              改动对比
                            </h2>
                          </div>
                          <Textarea
                            value={String(testResp.diff_unified || '')}
                            readOnly
                            className="mt-3 min-h-[220px] bg-muted/20 font-mono text-xs"
                          />
                          {testResp.diff_truncated ? (
                            <div className="mt-2 text-xs text-muted-foreground">
                              改动内容较长，仅显示前一部分。
                            </div>
                          ) : null}
                        </section>
                      ) : null}
                    </div>
                  ) : (
                    <section className="rounded-md border border-dashed border-border bg-card p-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Play className="size-4" />
                        点击“运行测试”查看清洗结果和改动内容。
                      </div>
                    </section>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
      </Dialog>
      <UnsavedChangesDialog
        open={discardConfirmOpen || navigationGuard.navigationPending}
        onOpenChange={(next) => {
          if (next) return
          setDiscardConfirmOpen(false)
          navigationGuard.cancelNavigation()
        }}
        onDiscard={() => {
          setDiscardConfirmOpen(false)
          if (navigationGuard.navigationPending) {
            resetDraft()
            onOpenChange(false)
            navigationGuard.confirmNavigation()
            return
          }
          closeDrawer()
        }}
        title="放弃未保存的模板修改？"
        description="治理模板尚未保存。继续后，本次修改将丢失。"
      />
    </>
  )
}
