/** 切块预览的工作流、参数、策略和快捷键指南。 */
'use client'

import { Keyboard, Scissors, Settings2, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'

export function ChunkingHelpDialog({
  open,
  onOpenChange,
}: Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
}>) {
  const t = useTranslations('ChunkPreview')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90dvh,800px)] w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden rounded-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="w-5 h-5 text-primary" />
            {t("help.title")}
          </DialogTitle>
          <DialogDescription>{t("help.description")}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1 pr-4">
          <div className="divide-y divide-border text-sm">
            <section className="pb-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Sparkles className="w-3.5 h-3.5" />
                {t("help.workflow.title")}
              </div>
              <div className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground">
                <div>{t("help.workflow.steps.parsing")}</div>
                <div>{t("help.workflow.steps.governance")}</div>
                <div>{t("help.workflow.steps.preview")}</div>
                <div>{t("help.workflow.steps.afterIngest")}</div>
              </div>
            </section>

            <section className="py-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Settings2 className="w-3.5 h-3.5" />
                {t("help.parameters.title")}
              </div>
              <div className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground">
                <div>
                  <span className="font-mono text-foreground/90">chunk_size</span>：{t("help.parameters.chunkSize")}
                </div>
                <div>
                  <span className="font-mono text-foreground/90">chunk_overlap</span>：{t("help.parameters.chunkOverlap")}
                </div>
                <div>{t("help.parameters.tip")}</div>
              </div>
            </section>

            <section className="py-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Scissors className="w-3.5 h-3.5" />
                {t("help.strategies.title")}
              </div>
              <div className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground">
                <div>
                  <span className="font-mono text-foreground/90">auto / langchain_recursive</span>：{t("help.strategies.auto")}
                </div>
                <div>
                  <span className="font-mono text-foreground/90">qa_pairs / qa_markdown</span>：{t("help.strategies.qa")}
                </div>
                <div>
                  <span className="font-mono text-foreground/90">laws_structured</span>：{t("help.strategies.laws")}
                </div>
                <div>
                  <span className="font-mono text-foreground/90">smart_code / diff_patch</span>：{t("help.strategies.code")}
                </div>
                <div>
                  <span className="font-mono text-foreground/90">separator</span>：{t("help.strategies.separator")}
                </div>
                <div>
                  <span className="font-mono text-foreground/90">langchain_token</span>：{t("help.strategies.token")}
                </div>
              </div>

            </section>

            <section className="pt-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Keyboard className="w-3.5 h-3.5" />
                {t("help.shortcuts.title")}
              </div>
              <div className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground">
                <div>
                  <span className="font-mono text-foreground/90">Ctrl/Cmd + Enter</span>：{t("help.shortcuts.forceRegenerate")}
                </div>
                <div>
                  <span className="font-mono text-foreground/90">Ctrl/Cmd + S</span>：{t("help.shortcuts.confirmIngest")}
                </div>
                <div>
                  <span className="font-mono text-foreground/90">↑/↓ 或 J/K</span>：{t("help.shortcuts.navigateList")}
                </div>
                <div>
                  <span className="font-mono text-foreground/90">/</span>：{t("help.shortcuts.focusSearch")}
                </div>
                <div>
                  <span className="font-mono text-foreground/90">Esc</span>：{t("help.shortcuts.clearLock")}
                </div>
                <div>
                  <span className="font-mono text-foreground/90">G / Shift+G（或 Home/End）</span>：{t("help.shortcuts.jumpEdges")}
                </div>
              </div>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
