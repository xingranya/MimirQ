'use client'

import type { ComponentType } from 'react'
import {
  Braces,
  Eye,
  GitCompare,
  Hash,
  LineChart,
  Network,
  ScrollText,
  SlidersHorizontal,
  Wand2,
} from 'lucide-react'

import { SettingsHelpTooltip } from '@/components/settings/settings-help-tooltip'
import { SettingsSwitch } from '@/components/settings/settings-switch'
import {
  type AdminControlledNavigationModule,
  normalizeNavigationModules,
} from '@/lib/navigation-visibility'
import type { NavigationConfig } from '@/lib/api'
import { cn } from '@/lib/utils'

type NavigationVisibilitySectionProps = {
  navigation: NavigationConfig
  updateNavigation: (patch: Partial<NavigationConfig>) => void
}

const MODULE_GROUPS: Array<{
  title: string
  description: string
  items: Array<{
    key: AdminControlledNavigationModule
    label: string
    description: string
    icon: ComponentType<{ className?: string }>
  }>
}> = [
  {
    title: '入库治理',
    description: '治理规则和重复内容治理入口，适合交付/数据治理人员开放',
    items: [
      {
        key: 'governanceProfiles',
        label: '治理配置',
        description: '管理清洗 Profiles、规则包和治理脚本',
        icon: Braces,
      },
      {
        key: 'commonLines',
        label: '重复内容治理',
        description: '跨文档识别页眉、页脚和重复噪声',
        icon: Hash,
      },
    ],
  },
  {
    title: '图谱与评测',
    description: '知识图谱、图谱快照、评测和消融实验入口，默认建议只给高级用户',
    items: [
      {
        key: 'knowledgeGraph',
        label: '知识图谱',
        description: '查看实体、事件和关系网络',
        icon: Network,
      },
      {
        key: 'graphSnapshots',
        label: '图谱快照',
        description: '对比图谱版本与节点变化',
        icon: GitCompare,
      },
      {
        key: 'graphDiagnostics',
        label: '图谱检索评测',
        description: '诊断图谱检索召回和 hardcase',
        icon: ScrollText,
      },
      {
        key: 'ragas',
        label: 'RAGAS 评测',
        description: '运行对话/回归质量评测',
        icon: LineChart,
      },
      {
        key: 'ablations',
        label: '检索消融',
        description: '对比召回策略和参数组合',
        icon: SlidersHorizontal,
      },
    ],
  },
  {
    title: '资产运营',
    description: '报告与提示词资产入口，适合运营或模型管理员按需开放',
    items: [
      {
        key: 'reports',
        label: '数据报告导出',
        description: '导出数据集质量和审计报告',
        icon: ScrollText,
      },
      {
        key: 'prompts',
        label: '提示词',
        description: '维护对话和 KG 使用的模板资产',
        icon: Wand2,
      },
    ],
  },
]

export function NavigationVisibilitySection({
  navigation,
  updateNavigation,
}: Readonly<NavigationVisibilitySectionProps>) {
  const visibleModules = normalizeNavigationModules(navigation.user_visible_modules)
  const visibleSet = new Set(visibleModules)

  const setModuleVisible = (key: AdminControlledNavigationModule, visible: boolean) => {
    const next = new Set(visibleModules)
    if (visible) next.add(key)
    else next.delete(key)
    updateNavigation({ user_visible_modules: normalizeNavigationModules(Array.from(next)) })
  }

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Eye className="size-4 text-primary" aria-hidden="true" />
            普通用户入口显示
            <SettingsHelpTooltip
              label="查看普通用户入口显示说明"
              side="right"
              className="size-7"
            >
              管理员始终可以访问。这里的设置会保存到系统，用于控制普通用户可见的左侧导航和页面入口。
            </SettingsHelpTooltip>
          </h2>
        </div>
      </div>

      <div className="grid overflow-hidden rounded-lg border border-border bg-background xl:grid-cols-3 xl:divide-x xl:divide-border">
        {MODULE_GROUPS.map((group) => (
          <section
            key={group.title}
            className="border-b border-border p-3 last:border-b-0 xl:border-b-0"
          >
            <div className="min-h-14 pb-2">
              <h3 className="text-sm font-semibold text-foreground">{group.title}</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {group.description}
              </p>
            </div>
            <div className="divide-y divide-border">
                {group.items.map((item) => {
                  const Icon = item.icon
                  const checked = visibleSet.has(item.key)
                  return (
                    <div
                      key={item.key}
                      className={cn(
                        'flex min-h-14 items-center justify-between gap-3 px-1 py-2 transition-colors',
                        checked
                          ? 'bg-primary/5'
                          : 'hover:bg-muted/30'
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={cn(
                            'flex size-8 shrink-0 items-center justify-center rounded-md',
                            checked ? 'bg-primary/12 text-primary' : 'bg-muted text-muted-foreground'
                          )}
                        >
                          <Icon className="size-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground">{item.label}</div>
                          <div className="mt-0.5 truncate text-xs leading-4 text-muted-foreground">
                            {item.description}
                          </div>
                        </div>
                      </div>
                      <SettingsSwitch
                        aria-label={`普通用户显示${item.label}`}
                        checked={checked}
                        onCheckedChange={(next) => setModuleVisible(item.key, next)}
                      />
                    </div>
                  )
                })}
              </div>
          </section>
        ))}
      </div>
    </section>
  )
}
