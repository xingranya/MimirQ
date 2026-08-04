import Link from 'next/link'
import { Compass } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { FullScreenFrame } from '@/components/full-screen-frame'

/** 渲染未找到页面，并提供返回首页和知识库的入口。 */
export default function NotFound() {
  const t = useTranslations('RouteBoundaries')

  return (
    <FullScreenFrame showBackground={false}>
      <section className="flex w-full max-w-md flex-col items-center px-5 py-10 text-center">
        <div className="flex size-12 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Compass className="size-6" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-xl font-semibold text-foreground">{t('notFound.title')}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('notFound.description')}</p>
        <div className="mt-6 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button className="h-10 rounded-md px-4" asChild>
            <Link href="/">{t('notFound.goHome')}</Link>
          </Button>
          <Button variant="outline" className="h-10 rounded-md px-4" asChild>
            <Link href="/knowledge">{t('notFound.goKnowledge')}</Link>
          </Button>
        </div>
      </section>
    </FullScreenFrame>
  )
}
