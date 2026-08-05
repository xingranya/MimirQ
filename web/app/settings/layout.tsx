import type { ReactNode } from 'react'

import { AppFrame } from '@/components/app-frame'

/** 在设置及其子页面之间保留同一个应用壳层。 */
export default function SettingsLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AppFrame>{children}</AppFrame>
}
