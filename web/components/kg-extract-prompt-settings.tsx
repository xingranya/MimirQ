'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ChevronDown, RefreshCw, Save } from 'lucide-react'

import { settingsApi, type KGConfig, type PromptTemplate } from '@/lib/api'
import { formatApiError } from '@/lib/api-errors'
import { queryKeys } from '@/lib/query-keys'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

const DEFAULT_KG_CONFIG: KGConfig = {
  chat_enabled: false,
  extract_prompt_template_id: '',
  extract_prompt_template_key: '',
  extract_prompt_ab_experiment_key: '',
  extract_replace_existing: true,
  extract_prune_orphan_entities: true,
}

const SELECT_DEFAULT_VALUE = '__mimirq_default__'

export function KgExtractPromptSettings({
  templates,
}: Readonly<{ templates: PromptTemplate[] }>) {
  const queryClient = useQueryClient()
  const [showAdvanced, setShowAdvanced] = useState(false)

  const [draftOverride, setDraftOverride] = useState<KGConfig | null>(null)

  const settingsQuery = useQuery({
    queryKey: queryKeys.settings.snapshot,
    queryFn: settingsApi.get,
  })

  const original = settingsQuery.data?.kg || DEFAULT_KG_CONFIG
  const draft = draftOverride || original
  const loading = settingsQuery.isPending

  const saveMutation = useMutation({
    mutationFn: (next: KGConfig) => settingsApi.update({ kg: next }),
    onSuccess: async (res) => {
      toast.success(res.message || '已保存')
      setDraftOverride(null)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.settings.snapshot,
      })
    },
    onError: (err) => {
      toast.error(formatApiError(err, '保存失败'))
    },
  })
  const saving = saveMutation.isPending

  const updateDraft = (updater: (current: KGConfig) => KGConfig) => {
    setDraftOverride((current) => updater(current || original))
  }

  const hasChanges = useMemo(() => {
    return JSON.stringify(original) !== JSON.stringify(draft)
  }, [original, draft])

  const save = () => saveMutation.mutate(draft)

  const reset = () => setDraftOverride(null)

  const onPickTemplate = (templateId: string) => {
    updateDraft((prev) => ({
      ...prev,
      extract_prompt_template_id: templateId,
      // If a template is pinned by id, clear other selectors to avoid confusion.
      extract_prompt_template_key: templateId
        ? ''
        : prev.extract_prompt_template_key,
      extract_prompt_ab_experiment_key: templateId
        ? ''
        : prev.extract_prompt_ab_experiment_key,
    }))
  }

  const templatesById = useMemo(() => {
    const map = new Map<string, PromptTemplate>()
    for (const t of templates || []) map.set(t.id, t)
    return map
  }, [templates])

  const pinnedName = useMemo(() => {
    if (!draft.extract_prompt_template_id) return ''
    return (
      templatesById.get(draft.extract_prompt_template_id)?.name ||
      draft.extract_prompt_template_id
    )
  }, [draft.extract_prompt_template_id, templatesById])

  return (
    <section
      className={cn(
        'overflow-hidden rounded-md border border-border bg-background',
        loading ? 'opacity-60' : ''
      )}
    >
      <div className="space-y-1 border-b border-border bg-muted/30 p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">
            图谱抽取
          </h3>
          <span className="text-xs font-medium text-primary">
            抽取策略
          </span>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          为图谱抽取和对话召回选择模板。未指定时使用系统默认模板。
        </p>
      </div>
      <div className="space-y-3 p-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 border-b border-border px-1 py-2.5">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">
                对话图谱召回
              </div>
              <div className="mt-0.5 text-xs leading-5 text-muted-foreground">
                回答前补充事件摘要，提升跨文档线索覆盖。
              </div>
            </div>
            <Switch
              checked={draft.chat_enabled}
              onCheckedChange={(checked) =>
                updateDraft((prev) => ({ ...prev, chat_enabled: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between gap-3 border-b border-border px-1 py-2.5">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">
                重复抽取覆盖旧事件
              </div>
              <div className="mt-0.5 text-xs leading-5 text-muted-foreground">
                同一文档重新处理时，避免产生重复事件。
              </div>
            </div>
            <Switch
              checked={draft.extract_replace_existing}
              onCheckedChange={(checked) =>
                updateDraft((prev) => ({
                  ...prev,
                  extract_replace_existing: checked,
                }))
              }
            />
          </div>

          <div className="flex items-center justify-between gap-3 px-1 py-2.5">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">
                自动清理孤立实体
              </div>
              <div className="mt-0.5 text-xs leading-5 text-muted-foreground">
                事件变更后移除没有关联关系的实体。
              </div>
            </div>
            <Switch
              checked={draft.extract_prune_orphan_entities}
              onCheckedChange={(checked) =>
                updateDraft((prev) => ({
                  ...prev,
                  extract_prune_orphan_entities: checked,
                }))
              }
            />
          </div>
        </div>

        <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
          <div>
            <Label className="text-xs font-semibold text-foreground">
              抽取模板
            </Label>
            <div className="mt-0.5 text-xs text-muted-foreground">
              固定一个已启用模板，或使用系统默认模板。
            </div>
          </div>
          <Select
            value={draft.extract_prompt_template_id || SELECT_DEFAULT_VALUE}
            onValueChange={(v) =>
              onPickTemplate(v === SELECT_DEFAULT_VALUE ? '' : v)
            }
          >
            <SelectTrigger className="h-9 rounded-md border-border bg-background text-sm">
              <SelectValue placeholder="默认（内置提示词）" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_DEFAULT_VALUE}>
                默认（内置提示词）
              </SelectItem>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id} disabled={!t.is_active}>
                  {t.name}
                  {t.is_active ? '' : '（已停用）'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {pinnedName ? (
            <div className="text-xs text-muted-foreground">
              当前模板：{pinnedName}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="flex min-h-9 w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-left text-xs font-semibold text-foreground transition-colors hover:bg-muted"
          onClick={() => setShowAdvanced((value) => !value)}
        >
          <span>高级参数</span>
          <ChevronDown
            className={cn(
              'size-3.5 text-muted-foreground/70 transition-transform',
              showAdvanced && 'rotate-180'
            )}
          />
        </button>

        {showAdvanced ? (
          <div className="grid grid-cols-1 gap-3 rounded-md border border-border bg-muted/30 p-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground">
                模板标识
              </Label>
              <Input
                value={draft.extract_prompt_template_key}
                placeholder="例如：kg_extract_v1"
                onChange={(e) => {
                  const value = e.target.value
                  updateDraft((prev) => ({
                    ...prev,
                    extract_prompt_template_key: value,
                    extract_prompt_template_id: value
                      ? ''
                      : prev.extract_prompt_template_id,
                    extract_prompt_ab_experiment_key: value
                      ? ''
                      : prev.extract_prompt_ab_experiment_key,
                  }))
                }}
                className="h-9 rounded-md bg-background text-sm"
              />
              <div className="text-xs text-muted-foreground">
                按标识自动选择最新启用版本。
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground">
                A/B 实验标识
              </Label>
              <Input
                value={draft.extract_prompt_ab_experiment_key}
                placeholder="例如：exp_kg_extract_2025w01"
                onChange={(e) => {
                  const value = e.target.value
                  updateDraft((prev) => ({
                    ...prev,
                    extract_prompt_ab_experiment_key: value,
                    extract_prompt_template_id: value
                      ? ''
                      : prev.extract_prompt_template_id,
                    extract_prompt_template_key: value
                      ? ''
                      : prev.extract_prompt_template_key,
                  }))
                }}
                className="h-9 rounded-md bg-background text-sm"
              />
              <div className="text-xs text-muted-foreground">
                用于灰度或实验分流。
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2 border-t border-border/50 pt-3">
          <Button
            variant="outline"
            onClick={reset}
            disabled={!hasChanges || saving || loading}
            className="h-8 rounded-md px-3 text-xs"
          >
            <RefreshCw className="mr-1 size-3" />
            重置
          </Button>
          <Button
            onClick={save}
            disabled={!hasChanges || saving || loading}
            className="h-8 rounded-md px-3 text-xs"
          >
            <Save className="mr-1 size-3" />
            保存
          </Button>
        </div>
      </div>
    </section>
  )
}
