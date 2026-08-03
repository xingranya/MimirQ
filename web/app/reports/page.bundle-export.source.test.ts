// 这里只检查源码契约，不替代行为测试。
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('报告页完整数据包导出', () => {
  it('提供完整数据包导出入口', () => {
    // 页面客户端负责调用报告导出接口。
    const pageClientSrc = fs.readFileSync(
      path.resolve(__dirname, 'page-client.tsx'),
      'utf8'
    )
    // 控制面板负责展示导出入口和无障碍名称。
    const controlPanelSrc = fs.readFileSync(
      path.resolve(__dirname, 'components/reports-control-panel.tsx'),
      'utf8'
    )

    expect(pageClientSrc).toContain('reportApi.exportDatasetReportBundleZip')
    expect(controlPanelSrc).toContain('导出数据包 ZIP')
  })
})
