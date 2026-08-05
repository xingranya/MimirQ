import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const singleSource = readFileSync(resolve(__dirname, 'knowledge-url-import-dialog.tsx'), 'utf8')
const batchSource = readFileSync(resolve(__dirname, 'knowledge-url-batch-dialog.tsx'), 'utf8')
const menuSource = readFileSync(resolve(__dirname, 'knowledge-import-menu.tsx'), 'utf8')
const actionsSource = readFileSync(resolve(__dirname, '../knowledge-workbench-actions.tsx'), 'utf8')

describe('网址导入弹窗与菜单视觉契约', () => {
  it('两个弹窗使用中文三段式布局和固定操作栏', () => {
    expect(singleSource).toContain('<DialogTitle>导入网页文档</DialogTitle>')
    expect(batchSource).toContain('<DialogTitle>批量导入网址</DialogTitle>')
    for (const source of [singleSource, batchSource]) {
      expect(source).toContain('grid-rows-[auto,1fr,auto]')
      expect(source).toContain('min-h-0 overflow-y-auto')
      expect(source).toContain('flex flex-col-reverse')
      expect(source).not.toMatch(/URL_INGEST_ENABLED|URL 批量导入（Connector）|rounded-(?:xl|2xl|3xl)|backdrop-blur|shadow-(?:sm|lg|xl|soft|strong)/)
    }
  })

  it('低频权限和解析设置默认折叠', () => {
    expect(singleSource.match(/<details/g)).toHaveLength(1)
    expect(batchSource.match(/<details/g)).toHaveLength(2)
    expect(batchSource).toContain('访问权限')
    expect(singleSource).toContain('解析与入库')
    expect(batchSource).toContain('解析与入库')
    expect(singleSource).toContain('<PipelineOptionsPanel compact />')
    expect(batchSource).toContain('<PipelineOptionsPanel compact />')
  })

  it('导入菜单使用中文任务名称并移除装饰动画', () => {
    expect(menuSource).toContain('导入网页文档')
    expect(menuSource).toContain('批量导入网址')
    expect(menuSource).toContain('抓取网站内容')
    expect(menuSource).toContain('同步 Jira 项目')
    expect(menuSource).toContain('导入设置')
    expect(menuSource).not.toMatch(/Website Crawl|URL 批量|Jira Project|管线配置/)
    expect(actionsSource).not.toMatch(/group\/action|group-hover\/action|before:blur|shadow-sm/)
  })
})
