'use client'

import { useTheme } from 'next-themes'
import { Toaster } from 'sonner'
import { UI_LAYER_CLASS } from '@/lib/ui-layers'

export function SonnerToaster() {
  const { theme, systemTheme } = useTheme()
  const resolvedTheme = theme === 'system' ? systemTheme : theme
  const sonnerTheme = resolvedTheme === 'dark' ? 'dark' : 'light'

  return (
    <Toaster
      className={UI_LAYER_CLASS.toast}
      theme={sonnerTheme}
      position="top-right"
      richColors
      closeButton
      gap={6}
      toastOptions={{
        className: 'rounded-md border-border shadow-lg',
      }}
    />
  )
}
