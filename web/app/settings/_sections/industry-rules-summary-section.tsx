import { ArrowUpRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'

/** 提供行业规则工作台入口，避免在设置页维护第二套编辑草稿。 */
export function IndustryRulesSummarySection() {
  return (
    <div className="border-y border-border py-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">行业规则工作台</p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            维护术语、问题模式和意图分类，并在保存前预览问题改写结果。
          </p>
        </div>
        <Button asChild variant="outline" className="h-9 shrink-0 rounded-md px-3 text-xs">
          <Link href="/governance/industry-rules">
            打开行业规则
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </div>
  )
}
