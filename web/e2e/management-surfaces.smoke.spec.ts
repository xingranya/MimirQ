import path from 'node:path'

import { expect, test, type Page, type Route } from '@playwright/test'

import { installCommonApiMocks, installDeterministicRandom, type EnterpriseTelemetryMockState } from './enterprise-quality-telemetry.helpers'

const TARGET_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
] as const

async function fulfillJson(route: Route, payload: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  })
}

async function documentHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement
    const body = document.body
    return Math.max(root.scrollWidth, body.scrollWidth) - window.innerWidth
  })
}

async function visibleInteractiveLayoutIssues(page: Page) {
  return page.evaluate(() => {
    const selector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[role="button"]:not([aria-disabled="true"])',
      '[role="link"]',
      '[role="tab"]',
      '[role="menuitem"]',
      '[role="combobox"]',
    ].join(',')
    const elements = Array.from(new Set(document.querySelectorAll<HTMLElement>(selector)))
      .filter((element) => {
        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        const centerX = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2))
        const centerY = Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2))
        const hitTarget = document.elementFromPoint(centerX, centerY)
        return (
          rect.width >= 8 &&
          rect.height >= 8 &&
          rect.right > 0 &&
          rect.bottom > 0 &&
          rect.left < window.innerWidth &&
          rect.top < window.innerHeight &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number.parseFloat(style.opacity || '1') > 0.01 &&
          Boolean(hitTarget && (hitTarget === element || element.contains(hitTarget)))
        )
      })
      .map((element) => {
        const rect = element.getBoundingClientRect()
        const label =
          element.getAttribute('aria-label') ||
          element.getAttribute('title') ||
          element.textContent?.replaceAll(/\s+/g, ' ').trim().slice(0, 48) ||
          element.tagName.toLowerCase()
        return { element, label, rect }
      })

    const issues: string[] = []
    for (const item of elements) {
      if (item.rect.left < -1 || item.rect.right > window.innerWidth + 1) {
        issues.push(`横向裁切: ${item.label}`)
      }
    }

    for (let leftIndex = 0; leftIndex < elements.length; leftIndex += 1) {
      const left = elements[leftIndex]
      for (let rightIndex = leftIndex + 1; rightIndex < elements.length; rightIndex += 1) {
        const right = elements[rightIndex]
        if (left.element.contains(right.element) || right.element.contains(left.element)) continue

        const overlapWidth =
          Math.min(left.rect.right, right.rect.right) - Math.max(left.rect.left, right.rect.left)
        const overlapHeight =
          Math.min(left.rect.bottom, right.rect.bottom) - Math.max(left.rect.top, right.rect.top)
        if (overlapWidth > 2 && overlapHeight > 2) {
          issues.push(`控件重叠: ${left.label} / ${right.label}`)
        }
      }
    }

    return issues
  })
}

async function scrollContainerMetrics(page: Page, selector: string) {
  return page.locator(selector).evaluate((element) => {
    const target = element as HTMLElement
    const before = target.scrollTop
    target.scrollTop = target.scrollHeight
    return {
      clientHeight: target.clientHeight,
      scrollHeight: target.scrollHeight,
      scrollTop: target.scrollTop,
      scrolled: target.scrollTop > before,
      overflowY: window.getComputedStyle(target).overflowY,
    }
  })
}

async function captureGuideScreenshot(page: Page, filename: string) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        caret-color: transparent !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }
    `,
  })
  await page.evaluate(async () => {
    await document.fonts.ready
    document.querySelectorAll('nextjs-portal').forEach((portal) => portal.remove())
  })
  await page.screenshot({
    path: path.resolve(__dirname, '../../docs/images/screenshots', filename),
    fullPage: false,
  })
}

const LEGACY_DARK_SURFACE_CLASS =
  /^(?:text-slate-(?:400|500|600|700|800|900|950)|border-slate-(?:100|200|300)(?:\/\d+)?|bg-(?:white|slate-(?:50|100|200))(?:\/\d+)?)$/

async function visibleLegacyDarkSurfaceClasses(page: Page) {
  return page.evaluate((patternSource) => {
    const pattern = new RegExp(patternSource)
    const matches = new Set<string>()

    for (const element of document.querySelectorAll('body *')) {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      const isVisible =
        rect.width > 2 &&
        rect.height > 2 &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight &&
        rect.right > 0 &&
        rect.left < window.innerWidth &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      if (!isVisible) continue

      for (const className of element.classList) {
        if (pattern.test(className)) matches.add(className)
      }
    }

    return Array.from(matches).sort()
  }, LEGACY_DARK_SURFACE_CLASS.source)
}

async function textAndSemanticForeground(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((element) => {
    const probe = document.createElement('span')
    probe.style.color = 'hsl(var(--foreground))'
    document.body.appendChild(probe)
    const result = {
      actual: window.getComputedStyle(element).color,
      expected: window.getComputedStyle(probe).color,
    }
    probe.remove()
    return result
  })
}

async function installManagementSurfaceMocks(page: Page) {
  const state: EnterpriseTelemetryMockState = { uploaded: false, parsingDocuments: [] }

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const pathname = url.pathname
    const method = request.method()

    if (method === 'GET') {
      if (pathname.includes('/kg/ontology/predicates')) {
        return fulfillJson(route, { predicates: [] })
      }
      if (pathname.includes('/usage/tenant/quotas')) {
        return fulfillJson(route, { datasets: [] })
      }
      return fulfillJson(route, { items: [], total: 0 })
    }

    if (method === 'DELETE') {
      await route.fulfill({ status: 204, body: '' })
      return
    }

    return fulfillJson(route, { success: true })
  })

  await installDeterministicRandom(page)
  await installCommonApiMocks(page, state)

  await page.route('**/api/v1/datasets**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return fulfillJson(route, {
      items: [
        {
          id: 'ds-smoke',
          name: 'Smoke Dataset',
          description: 'management smoke fixture',
          created_at: '2026-04-09T00:00:00Z',
          updated_at: '2026-04-09T00:00:00Z',
        },
      ],
      total: 1,
    })
  })

  await page.route('**/api/v1/datasets/ds-smoke', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return fulfillJson(route, {
      id: 'ds-smoke',
      name: 'Smoke Dataset',
      description: 'management smoke fixture',
      created_at: '2026-04-09T00:00:00Z',
      updated_at: '2026-04-09T00:00:00Z',
    })
  })

  await page.route('**/api/v1/dataset-categories/**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return fulfillJson(route, { items: [] })
  })

  await page.route('**/api/v1/reports/datasets/ds-smoke**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return fulfillJson(route, {
      dataset_id: 'ds-smoke',
      pipeline_versions: [{ pipeline_hash: 'abc12345', created_at: '2026-04-09T00:00:00Z' }],
      connectors: [],
      profile: {
        total_documents: 3,
        total_size_bytes: 2048,
      },
      compliance: {
        quarantined_documents: 0,
        failed_documents: 0,
      },
      governance_metrics: {
        category_coverage_pct: 1,
      },
      governance_audit: {
        heading_ratio_pct_histogram: [],
      },
      folder_tree: {
        name: 'root',
        children: [],
      },
    })
  })

  await page.route('**/api/v1/chat/conversations**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return fulfillJson(route, {
      items: [
        {
          id: 'conv-smoke',
          title: 'Smoke Conversation',
          created_at: '2026-04-09T00:00:00Z',
          updated_at: '2026-04-09T00:00:00Z',
        },
      ],
      total: 1,
    })
  })

  await page.route('**/api/v1/evaluations/ragas/runs**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return fulfillJson(route, {
      items: [
        {
          id: 'run-smoke',
          conversation_id: 'conv-smoke',
          status: 'completed',
          metrics: ['faithfulness', 'response_relevancy'],
          params: {},
          summary: { faithfulness: 0.92 },
          created_at: '2026-04-09T00:00:00Z',
        },
      ],
      total: 1,
    })
  })

  await page.route('**/api/v1/evaluations/ragas/conversation-readiness', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    return fulfillJson(route, {
      items: [
        {
          conversation_id: 'conv-smoke',
          is_known: true,
          is_evaluable: true,
          citations_count: 2,
        },
      ],
    })
  })

  await page.route('**/api/v1/evaluations/ragas/runs/run-smoke**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return fulfillJson(route, {
      run: {
        id: 'run-smoke',
        conversation_id: 'conv-smoke',
        status: 'completed',
        metrics: ['faithfulness', 'response_relevancy'],
        params: {},
        summary: { faithfulness: 0.92 },
        created_at: '2026-04-09T00:00:00Z',
      },
      items: [],
    })
  })

  await page.route('**/api/v1/usage/chat/tokens/summary**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return fulfillJson(route, {
      total_assistant_tokens: 128,
      by_dataset: [
        {
          dataset_id: 'ds-smoke',
          assistant_tokens: 128,
        },
      ],
    })
  })

  await page.route('**/api/v1/usage/chat/cost/summary**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return fulfillJson(route, {
      total_llm_total_tokens: 256,
      total_llm_prompt_tokens: 160,
      total_llm_completion_tokens: 96,
      total_embedding_query_tokens: 48,
      total_embedding_query_chars: 600,
      total_retrieval_elapsed_sec: 2.4,
      total_rerank_elapsed_sec: 0.8,
      total_assistant_messages: 4,
      by_dataset: [
        {
          dataset_id: 'ds-smoke',
          llm_total_tokens: 256,
          llm_prompt_tokens: 160,
          llm_completion_tokens: 96,
          embedding_query_tokens: 48,
          embedding_query_chars: 600,
          retrieval_elapsed_sec: 2.4,
          rerank_elapsed_sec: 0.8,
        },
      ],
    })
  })

  await page.route('**/api/v1/usage/chat/tokens/quota**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return fulfillJson(route, {
      enabled: true,
      exceeded: false,
      used_tokens: 128,
      max_tokens: 1000,
    })
  })

  await page.route('**/api/v1/audit/logs**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return fulfillJson(route, {
      items: [
        {
          id: 'audit-smoke',
          action: 'smoke.audit.view',
          actor_id: 'demo',
          resource_type: 'dataset',
          resource_id: 'ds-smoke',
          created_at: '2026-04-09T00:00:00Z',
          request_id: 'req-smoke',
        },
      ],
      total: 1,
    })
  })

  await page.route('**/api/v1/audit/access-graph/summary**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return fulfillJson(route, {
      group_count: 4,
      group_member_count: 9,
      dataset_count: 3,
      dataset_permission_counts: {
        all_team_members: 1,
        partial_members: 1,
        only_me: 1,
      },
      document_count: 12,
      document_access_mode_counts: {
        inherit: 8,
        partial_members: 2,
        only_me: 1,
        all_team_members: 1,
        unknown: 0,
      },
      dataset_member_allowlist_count: 2,
      dataset_group_allowlist_count: 1,
      document_member_allowlist_count: 3,
      document_group_allowlist_count: 2,
    })
  })

  await page.route('**/api/v1/rbac/members**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return fulfillJson(route, {
      items: [
        {
          id: 'member-owner',
          tenant_id: 'tenant-smoke',
          user_id: 'avery.long.member.identifier.for.viewport.regression@example.com',
          role: 'owner',
          is_current: true,
          created_at: '2026-04-09T00:00:00Z',
          updated_at: '2026-04-09T00:00:00Z',
        },
        {
          id: 'member-auditor',
          tenant_id: 'tenant-smoke',
          user_id: 'audit.operator@example.com',
          role: 'auditor',
          is_current: false,
          created_at: '2026-04-09T00:00:00Z',
          updated_at: '2026-04-09T00:00:00Z',
        },
      ],
      total: 2,
    })
  })

  await page.route('**/api/v1/evidence/suites/suite-smoke/items**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return fulfillJson(route, {
      items: [
        {
          id: 'item-smoke',
          suite_id: 'suite-smoke',
          query: 'How does the smoke evidence item behave at laptop widths?',
          expected_answer: 'It should stay readable and selectable.',
          notes: 'Smoke evidence item note',
          status: 'reviewed',
          tags: ['smoke', 'viewport'],
          reference_sources: [
            {
              document_id: 'doc-smoke',
              chunk_id: 'chunk-smoke',
              label: 'Smoke reference label',
              quote: 'Smoke reference quote',
              page_number: 3,
              chunk_index: 1,
            },
          ],
          source_metadata: {
            source: 'smoke',
          },
          updated_at: '2026-04-09T00:00:00Z',
        },
      ],
      total: 1,
    })
  })

  await page.route('**/api/v1/evidence/suites**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    if (new URL(route.request().url()).pathname !== '/api/v1/evidence/suites') {
      return route.fallback()
    }
    return fulfillJson(route, {
      items: [
        {
          id: 'suite-smoke',
          dataset_id: 'ds-smoke',
          name: 'Smoke Evidence Suite',
          description: 'Evidence smoke fixture',
          tags: ['smoke', 'evidence'],
          item_counts: {
            total: 1,
            draft: 0,
            reviewed: 1,
            approved: 0,
            archived: 0,
          },
        },
      ],
      total: 1,
    })
  })
}

test.describe('management surfaces smoke', () => {
  test.beforeEach(async ({ page }) => {
    await installManagementSurfaceMocks(page)
  })

  test('loads prompts page with the managed prompt shell', async ({ page }) => {
    await page.goto('/prompts')
    await expect(
      page.getByTestId('page-title-shell').getByText('提示词模板', { exact: true })
    ).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText('创建模板')).toBeVisible()
  })

  test('loads reports page with mocked dataset data', async ({ page }) => {
    await page.goto('/reports')
    await expect(page.getByRole('heading', { name: '数据报告' })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('combobox', { name: '数据集' })).toContainText('Smoke Dataset')
  })

  test('loads evaluations page with conversation and run data', async ({ page }) => {
    await page.goto('/evaluations')
    await expect(page.getByRole('heading', { name: '实时会话评分' })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('combobox').first()).toContainText('Smoke Conversation')
  })

  test('uses flat semantic headers on custom management surfaces', async ({ page }) => {
    test.setTimeout(240_000)

    for (const surface of [
      { route: '/datasets', heading: '数据集' },
      { route: '/knowledge', heading: '知识库管理' },
      { route: '/evaluations', heading: '实时会话评分' },
      { route: '/knowledge/quarantine', heading: '隔离审核中心' },
      { route: '/knowledge/feedback', heading: '反馈分析' },
    ] as const) {
      await page.goto(surface.route, { waitUntil: 'domcontentloaded' })
      const heading = page.getByRole('heading', { name: surface.heading }).first()
      await expect(heading, `${surface.route} heading`).toBeVisible({ timeout: 60_000 })

      const header = page
        .locator('[data-management-header="true"]')
        .filter({ has: heading })
        .first()
      await expect(header, `${surface.route} management header`).toBeVisible()

      const visual = await header.evaluate((element) => {
        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return {
          backgroundImage: style.backgroundImage,
          backdropFilter: style.backdropFilter,
          borderRadius: Number.parseFloat(style.borderTopLeftRadius),
          boxShadow: style.boxShadow,
          height: rect.height,
        }
      })
      const titleStyle = await heading.evaluate((element) => {
        const style = window.getComputedStyle(element)
        return {
          backgroundImage: style.backgroundImage,
          backgroundClip: style.backgroundClip,
          color: style.color,
        }
      })

      expect(visual.backgroundImage, `${surface.route} header gradient`).toBe('none')
      expect(visual.backdropFilter, `${surface.route} header blur`).toBe('none')
      expect(visual.boxShadow, `${surface.route} header shadow`).toBe('none')
      expect(visual.borderRadius, `${surface.route} header radius`).toBeLessThanOrEqual(8)
      expect(visual.height, `${surface.route} header height`).toBeLessThanOrEqual(128)
      expect(titleStyle.backgroundImage, `${surface.route} title gradient`).toBe('none')
      expect(titleStyle.backgroundClip, `${surface.route} title clipping`).not.toBe('text')
      expect(titleStyle.color, `${surface.route} title ink`).not.toBe('rgba(0, 0, 0, 0)')
    }
  })

  test('aligns management headers with one stable content grid', async ({ page }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 1440, height: 900 })

    for (const surface of [
      { route: '/evaluations', heading: '实时会话评分' },
      { route: '/prompts', heading: '提示词模板' },
      { route: '/diagnostics', heading: '诊断中心' },
      { route: '/usage', heading: '用量与配额' },
      { route: '/audit', heading: '审计日志' },
      { route: '/settings/rbac', heading: '成员权限' },
      { route: '/settings/groups', heading: '成员组' },
      { route: '/settings', heading: '设置' },
    ]) {
      await page.goto(surface.route, { waitUntil: 'domcontentloaded' })
      const heading = page.getByRole('heading', { name: surface.heading }).last()
      await expect(heading, `${surface.route} heading`).toBeVisible({ timeout: 15_000 })

      const header = page
        .locator('[data-management-header="true"]')
        .filter({ has: heading })
        .first()
      await expect(header, `${surface.route} shared header`).toBeVisible({ timeout: 10_000 })

      const geometry = await header.evaluate((element) => {
        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          padding: style.padding,
          borderRadius: style.borderRadius,
        }
      })
      expect(geometry.x, `${surface.route} x`).toBeGreaterThanOrEqual(224)
      expect(geometry.x + geometry.width, `${surface.route} right edge`).toBeLessThanOrEqual(1440)
      expect(geometry.y, `${surface.route} y`).toBeGreaterThanOrEqual(0)
      expect(geometry.height, `${surface.route} height`).toBeLessThanOrEqual(128)
      expect(Number.parseFloat(geometry.borderRadius), `${surface.route} radius`).toBeLessThanOrEqual(8)
    }

    await page.setViewportSize({ width: 1280, height: 768 })
    await page.goto('/evaluations', { waitUntil: 'domcontentloaded' })
    const evaluationHeading = page.getByRole('heading', { name: '实时会话评分' }).last()
    await expect(evaluationHeading).toBeVisible({ timeout: 15_000 })
    const evaluationHero = page
      .locator('[data-management-header="true"]')
      .filter({ has: evaluationHeading })
      .first()
    const evaluationGeometry = await evaluationHero.evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      pageOverflow:
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
        window.innerWidth,
    }))
    expect(evaluationGeometry.height).toBeLessThanOrEqual(100)
    expect(evaluationGeometry.pageOverflow).toBeLessThanOrEqual(1)
  })

  test('keeps core workflows usable across all target viewports', async ({ page }) => {
    test.setTimeout(600_000)

    for (const viewport of TARGET_VIEWPORTS) {
      await test.step(`${viewport.width}x${viewport.height}`, async () => {
        await page.setViewportSize(viewport)

        for (const surface of [
          { route: '/', heading: null },
          { route: '/knowledge', heading: '知识库管理' },
          { route: '/settings', heading: '设置' },
        ] as const) {
          await page.goto(surface.route, { waitUntil: 'domcontentloaded' })
          await expect(page.locator('#main-content')).toBeVisible({ timeout: 60_000 })
          if (surface.heading) {
            await expect(page.getByRole('heading', { name: surface.heading }).first()).toBeVisible({
              timeout: 60_000,
            })
          }
          await page.evaluate(async () => document.fonts.ready)

          expect(
            await documentHorizontalOverflow(page),
            `${surface.route} overflows at ${viewport.width}x${viewport.height}`
          ).toBeLessThanOrEqual(1)
          expect(
            await visibleInteractiveLayoutIssues(page),
            `${surface.route} interactive layout issues at ${viewport.width}x${viewport.height}`
          ).toEqual([])

          if (surface.route === '/') {
            const mobileAppBar = page.locator('[data-mobile-app-bar="true"]')
            if (viewport.width < 768) await expect(mobileAppBar).toBeVisible()
            else await expect(mobileAppBar).toBeHidden()
          }

          if (surface.route === '/settings') {
            const mobileGroupSelect = page.getByTestId('settings-mobile-group-select')
            if (viewport.width < 1024) await expect(mobileGroupSelect).toBeVisible()
            else await expect(mobileGroupSelect).toBeHidden()

            const saveBar = page.getByTestId('settings-save-bar')
            await expect(saveBar).toBeVisible()
            const saveBarBox = await saveBar.boundingBox()
            expect(saveBarBox?.x ?? -1).toBeGreaterThanOrEqual(0)
            expect((saveBarBox?.x ?? 0) + (saveBarBox?.width ?? 0)).toBeLessThanOrEqual(
              viewport.width
            )
          }
        }
      })
    }
  })

  test('preserves sidebar scroll without document navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 520 })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => {
      window.localStorage.setItem('mimirq_app_sidebar_open_v1', 'true')
      window.localStorage.setItem(
        'mimirq_navbar_open_sections_v3',
        JSON.stringify({ conversation: true, knowledge: true, analysis: true, system: true })
      )
    })
    await page.reload({ waitUntil: 'domcontentloaded' })

    const sidebar = page.locator('#mimirq-sidebar')
    const sidebarScroll = page.locator('[data-sidebar-scroll-container="true"]')
    await expect(sidebar).toBeVisible({ timeout: 60_000 })
    const scrollBefore = await sidebarScroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight
      element.dispatchEvent(new Event('scroll'))
      return {
        scrollTop: element.scrollTop,
        maxScrollTop: element.scrollHeight - element.clientHeight,
      }
    })
    expect(scrollBefore.scrollTop).toBeGreaterThan(0)

    const navigationEntriesBefore = await page.evaluate(
      () => performance.getEntriesByType('navigation').length
    )

    await page.getByRole('link', { name: '设置', exact: true }).click()
    await expect(page).toHaveURL(/\/settings$/)
    await expect(page.getByRole('heading', { name: '设置' }).first()).toBeVisible({
      timeout: 60_000,
    })

    expect(await page.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(
      navigationEntriesBefore
    )
    const scrollAfter = await sidebarScroll.evaluate((element) => ({
      scrollTop: element.scrollTop,
      maxScrollTop: element.scrollHeight - element.clientHeight,
    }))
    const expectedScrollTop = Math.min(scrollBefore.scrollTop, scrollAfter.maxScrollTop)
    expect(scrollAfter.scrollTop).toBeGreaterThan(0)
    expect(Math.abs(scrollAfter.scrollTop - expectedScrollTop)).toBeLessThanOrEqual(24)
  })

  test('keeps mobile sidebar focus inside the overlay and restores it on close', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const trigger = page.getByRole('button', { name: '展开侧边栏' }).first()
    const sidebar = page.locator('#mimirq-sidebar')
    const appContent = page.locator('[data-app-content="true"]')
    await expect(trigger).toBeVisible({ timeout: 60_000 })

    await trigger.focus()
    await page.keyboard.press('Enter')
    await expect(sidebar).toBeVisible()
    await expect(appContent).toHaveAttribute('aria-hidden', 'true')
    await expect.poll(() => page.evaluate(() => {
      const nav = document.querySelector('#mimirq-sidebar')
      return Boolean(nav?.contains(document.activeElement))
    })).toBe(true)

    await page.keyboard.press('Escape')
    await expect(sidebar).toHaveAttribute('inert', '')
    await expect(sidebar).toHaveClass(/-translate-x-full/)
    await expect(appContent).not.toHaveAttribute('aria-hidden', 'true')
    await expect.poll(() => trigger.evaluate((element) => element === document.activeElement)).toBe(true)
  })

  test('uses semantic surfaces after switching to dark mode', async ({ page }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/evaluations', { waitUntil: 'domcontentloaded' })
    await expect(
      page.getByRole('heading', { name: '实时会话评分' }).first()
    ).toBeVisible({ timeout: 60_000 })
    await page.getByRole('button', { name: '切换主题' }).last().click()
    const darkThemeItem = page.getByRole('menuitem', { name: '深色' })
    await expect(darkThemeItem).toBeVisible({ timeout: 10_000 })
    await darkThemeItem.click()
    await expect(page.locator('html')).toHaveClass(/dark/)

    for (const surface of [
      { route: '/evaluations', heading: '实时会话评分' },
      { route: '/evaluations/ablations', heading: '检索调参对比' },
      { route: '/reports', heading: '数据报告' },
      { route: '/datasets', heading: '数据集' },
    ]) {
      await page.goto(surface.route, { waitUntil: 'domcontentloaded' })
      const heading = page.getByRole('heading', { name: surface.heading }).first()
      await expect(heading).toBeVisible({ timeout: 60_000 })

      const legacyClasses = await visibleLegacyDarkSurfaceClasses(page)
      expect(
        legacyClasses,
        `${surface.route} still renders light-only utility classes in dark mode`
      ).toEqual([])

      const colors = await textAndSemanticForeground(
        page,
        `h1:has-text("${surface.heading}")`
      )
      expect(colors.actual).toBe(colors.expected)
    }
  })

  test('keeps similarity workbench readable at laptop width', async ({ page }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 1280, height: 720 })

    await page.goto('/knowledge/similarity', {
      waitUntil: 'domcontentloaded',
      timeout: 150_000,
    })
    const similarityTitle = page.getByRole('heading', {
      name: '跨集合相似度热力图',
    })
    await expect(similarityTitle).toBeVisible({ timeout: 60_000 })
    const similarityTitleBox = await similarityTitle.boundingBox()
    expect(similarityTitleBox?.width).toBeGreaterThan(160)
    expect(similarityTitleBox?.height).toBeLessThan(60)
  })

  test('keeps regression workspace readable at laptop width', async ({ page }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 1280, height: 720 })

    await page.goto('/evaluations', {
      waitUntil: 'domcontentloaded',
      timeout: 150_000,
    })
    await page.getByRole('button', { name: '回归评测' }).click()
    const regressionWorkspaceTitle = page.getByRole('heading', {
      name: '标准样本回归评测',
    })
    await expect(regressionWorkspaceTitle).toBeVisible({ timeout: 60_000 })
    const regressionTitleBox = await regressionWorkspaceTitle.boundingBox()
    expect(regressionTitleBox?.width).toBeGreaterThan(90)
    expect(regressionTitleBox?.height).toBeLessThan(40)

    const runHistoryTitle = page.getByText('运行历史', { exact: true })
    const runHistoryCardHeight = await runHistoryTitle.evaluate(
      (element) =>
        element.parentElement?.parentElement?.parentElement?.getBoundingClientRect()
          .height ?? 0
    )
    expect(runHistoryCardHeight).toBeGreaterThan(100)
  })

  test('keeps knowledge ingestion vertically scrollable at laptop heights', async ({ page }) => {
    test.setTimeout(180_000)
    for (const viewport of [
      { width: 1024, height: 768 },
      { width: 1280, height: 720 },
      { width: 1366, height: 768 },
    ]) {
      await page.setViewportSize(viewport)
      await page.goto('/knowledge/ingestion', {
        waitUntil: 'domcontentloaded',
        timeout: 150_000,
      })
      await expect(page.getByRole('heading', { name: '入库管理', exact: true })).toBeVisible({
        timeout: 60_000,
      })

      const metrics = await scrollContainerMetrics(
        page,
        '[data-ingestion-operation-root="true"]'
      )
      expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight + 20)
      expect(metrics.scrolled).toBe(true)
    }
  })

  test('keeps quarantine vertically scrollable at laptop heights', async ({ page }) => {
    test.setTimeout(180_000)
    for (const viewport of [
      { width: 1024, height: 768 },
      { width: 1280, height: 720 },
      { width: 1366, height: 768 },
    ]) {
      await page.setViewportSize(viewport)
      await page.goto('/knowledge/quarantine', {
        waitUntil: 'domcontentloaded',
        timeout: 150_000,
      })
      await expect(page.getByText('隔离审核中心', { exact: true })).toBeVisible({
        timeout: 60_000,
      })

      const metrics = await scrollContainerMetrics(
        page,
        '[data-quarantine-page-root="true"]'
      )
      expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight + 20)
      expect(metrics.scrolled).toBe(true)
    }
  })

  test('keeps chunk preview readable at 1024px width', async ({ page }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 1024, height: 768 })

    await page.goto('/chunk-preview', {
      waitUntil: 'domcontentloaded',
      timeout: 150_000,
    })
    await expect(page.locator('[data-chunk-empty-intake-panel]')).toBeVisible({
      timeout: 60_000,
    })

    expect(await documentHorizontalOverflow(page)).toBeLessThanOrEqual(1)
  })

  test('keeps retrieval ablations readable at 1024px width', async ({ page }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 1024, height: 768 })

    await page.goto('/evaluations/ablations', {
      waitUntil: 'domcontentloaded',
      timeout: 150_000,
    })
    await expect(page.getByRole('heading', { name: '检索调参对比' })).toBeVisible({
      timeout: 60_000,
    })

    expect(await documentHorizontalOverflow(page)).toBeLessThanOrEqual(1)
  })

  test('keeps evidence workbench usable at 1024px and 1280px widths', async ({ page }) => {
    test.setTimeout(180_000)
    for (const viewport of [
      { width: 1024, height: 768, stacked: true },
      { width: 1280, height: 720, stacked: false },
    ]) {
      await page.setViewportSize(viewport)
      await page.goto('/datasets/ds-smoke/evidence', {
        waitUntil: 'domcontentloaded',
        timeout: 150_000,
      })
      await expect(
        page.getByRole('heading', { name: '证据库', exact: true })
      ).toBeVisible({ timeout: 60_000 })

      const suitePanel = page.getByText('Evidence Suites', { exact: true })
      const itemPanel = page.getByText('Evidence Items', { exact: true })
      const detailPanel = page.getByText('Detail', { exact: true })
      await expect(suitePanel).toBeVisible()
      await expect(itemPanel).toBeVisible()
      const suiteButton = page.getByRole('button', {
        name: /Smoke Evidence Suite/,
      })
      await expect(suiteButton).toBeVisible({ timeout: 60_000 })
      await suiteButton.click()
      await itemPanel.scrollIntoViewIfNeeded()
      await expect(itemPanel).toBeVisible()
      const evidenceItem = page.getByText('How does the smoke evidence item behave at laptop widths?', {
        exact: true,
      })
      await expect(evidenceItem).toBeVisible({ timeout: 10_000 })
      await evidenceItem.click()
      await detailPanel.scrollIntoViewIfNeeded()
      await expect(detailPanel).toBeVisible()
      expect(await documentHorizontalOverflow(page)).toBeLessThanOrEqual(1)

      const suiteBox = await suitePanel.boundingBox()
      const detailBox = await detailPanel.boundingBox()
      if (viewport.stacked) {
        expect(detailBox?.y).toBeGreaterThan((suiteBox?.y ?? 0) + 120)
      }
    }
  })

  test('keeps the knowledge scope panel scrollable at low height', async ({ page }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 1280, height: 520 })

    await page.goto('/knowledge', {
      waitUntil: 'domcontentloaded',
      timeout: 150_000,
    })
    await expect(page.getByRole('heading', { name: '筛选范围' })).toBeVisible({
      timeout: 60_000,
    })

    const metrics = await scrollContainerMetrics(page, '[data-knowledge-scope-panel]')
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight + 20)
    expect(metrics.scrolled).toBe(true)
  })

  test('keeps RBAC controls inside the 1024px viewport', async ({ page }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 1024, height: 768 })

    await page.goto('/settings/rbac', {
      waitUntil: 'domcontentloaded',
      timeout: 150_000,
    })
    await expect(page.getByRole('heading', { name: '成员权限' })).toBeVisible({
      timeout: 60_000,
    })

    expect(await documentHorizontalOverflow(page)).toBeLessThanOrEqual(1)
  })

  test('does not reopen the compact similarity sidebar across breakpoint changes', async ({ page }) => {
    test.setTimeout(180_000)

    await page.setViewportSize({ width: 1024, height: 768 })
    await page.goto('/knowledge/similarity', {
      waitUntil: 'domcontentloaded',
      timeout: 150_000,
    })
    await expect(
      page.getByRole('heading', { name: '跨集合相似度热力图' })
    ).toBeVisible({ timeout: 60_000 })

    const dataSourcePanelTitle = page.getByText('数据源配置', { exact: true }).last()
    await expect(dataSourcePanelTitle).not.toBeVisible()

    await page.setViewportSize({ width: 1366, height: 768 })
    await expect(dataSourcePanelTitle).not.toBeVisible()
  })

  test('loads usage page with token and quota summaries', async ({ page }) => {
    await page.goto('/usage')
    await expect(page.getByRole('heading', { name: '用量与配额' })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('row', { name: /Smoke Dataset.*128/ })).toBeVisible()
  })

  test('loads audit page with mocked audit events', async ({ page }) => {
    await page.goto('/audit')
    await expect(page.getByRole('heading', { name: '审计日志' })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('row', { name: /smoke\.audit\.view/ })).toBeVisible()
  })

  test('redirects the retired access-review page to audit logs', async ({ page }) => {
    await page.goto('/access-review')
    await expect(page).toHaveURL(/\/audit/)
    await expect(page.getByRole('heading', { name: '审计日志' })).toBeVisible({ timeout: 60_000 })
  })

  test('all major management surface routes are reachable', async ({ page }) => {
    test.setTimeout(600_000)

    await page.route('**/*', async (route) => {
      const headers = route.request().headers()
      if (headers['next-router-prefetch'] === '1' || headers.purpose === 'prefetch') {
        await route.abort()
        return
      }
      await route.fallback()
    })

    const routes = [
      '/',
      '/history',
      '/datasets',
      '/knowledge',
      '/knowledge/quarantine',
      '/knowledge/feedback',
      '/knowledge/ingestion',
      '/parsing',
      '/data-governance',
      '/data-governance/profiles',
      '/chunk-preview',
      '/graph',
      '/evaluations',
      '/reports',
      '/prompts',
      '/diagnostics',
      '/usage',
      '/audit',
      '/settings/rbac',
      '/settings/groups',
      '/settings',
    ]

    for (const route of routes) {
      await test.step(route, async () => {
        const response = await page.goto(route, { waitUntil: 'domcontentloaded' })
        if (!response) throw new Error(`${route} did not return a document response`)
        expect(response.status()).toBeLessThan(400)
        await expect(page, `${route} redirected to authentication`).not.toHaveURL(/\/auth(?:\?|$)/)
      })
    }

    await page.goto('/access-review')
    await expect(page).toHaveURL(/\/audit/)
  })

  test('renders retrieval results without nested interactive controls', async ({ page }) => {
    const nestedControlErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() !== 'error') return
      const text = message.text()
      if (text.includes('<button> cannot be a descendant of <button>')) {
        nestedControlErrors.push(text)
      }
    })
    await page.route('**/api/v1/rag/retrieve', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      return fulfillJson(route, {
        schema: 'mimirq.evidence.v1',
        query_for_retrieval: '发布验收',
        citations: [
          {
            document_id: 'doc-retrieval-a11y',
            document_name: '发布验收规范.pdf',
            chunk_id: 'chunk-retrieval-a11y',
            chunk_content: '发布前应检查权限、检索结果和引用证据。',
            score: 0.94,
          },
        ],
        has_evidence: true,
        abstain_triggered: false,
      })
    })

    await page.goto('/knowledge?tab=retrieval&dataset=ds-smoke')
    const searchInput = page.getByPlaceholder(
      '例如：请按第十二条说明例外条件，并指出适用范围与例外条款'
    )
    await expect(searchInput).toBeVisible({ timeout: 60_000 })
    await searchInput.fill('发布验收')
    await page.getByRole('button', { name: '开始检索' }).click()
    await expect(page.getByText('发布验收规范.pdf').first()).toBeVisible()
    await expect(
      page.locator('[aria-label="检索结果排名列表"] button button')
    ).toHaveCount(0)
    expect(nestedControlErrors).toEqual([])
  })

  test('captures the documented knowledge-base journey on demand', async ({ page }) => {
    test.skip(
      process.env.CAPTURE_DOCS_SCREENSHOTS !== '1',
      'Set CAPTURE_DOCS_SCREENSHOTS=1 to refresh committed guide screenshots.'
    )
    test.setTimeout(240_000)
    await page.setViewportSize({ width: 1600, height: 1000 })

    const evidence = {
      document_id: 'doc-guide-1',
      document_name: '企业知识库操作规范.pdf',
      chunk_id: 'chunk-guide-1',
      chunk_content:
        '正式发布前应完成数据集权限检查、真实检索验证与引用核对，并保留可回归的 Golden 题集。',
      page_number: 12,
      score: 0.943,
      relevance_score: 0.943,
      retrieval_score: 0.918,
      retrieval_role: 'hierarchy_primary',
      matched_terms: ['权限检查', '检索验证', '引用核对'],
      policy_clause_number: '第十二条',
      policy_path_str: '发布管理 / 上线验收 / 知识库',
      family_hit: true,
      has_image: false,
    }

    await page.route('**/api/v1/rag/retrieve', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      return fulfillJson(route, {
        schema: 'mimirq.evidence.v1',
        query_for_retrieval: '知识库发布前需要完成哪些验收？',
        citations: [
          evidence,
          {
            ...evidence,
            chunk_id: 'chunk-guide-2',
            chunk_content:
              '上线后应通过 request_id 关联 API、Worker、模型服务和检索 Trace，并持续复测关键问题。',
            page_number: 13,
            score: 0.887,
            relevance_score: 0.887,
            retrieval_role: 'vector_primary',
            policy_clause_number: '第十三条',
            policy_path_str: '发布管理 / 运行观测',
            family_hit: false,
          },
        ],
        metrics: {
          candidate_count: 24,
          returned_count: 2,
          retrieval_mode: 'hybrid',
          reranker: 'enabled',
        },
        has_evidence: true,
        abstain_triggered: false,
      })
    })

    await page.route('**/api/v1/chat/stream', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      const body = [
        { type: 'citations', data: [evidence] },
        {
          type: 'token',
          data: {
            content:
              '发布前需要完成数据集权限检查、真实检索验证和引用核对，并保存 Golden 题集作为回归基线。',
          },
        },
        {
          type: 'done',
          request_id: 'req-guide-screenshot',
          data: {
            conversation_id: 'conv-guide-screenshot',
            assistant_message_id: 'assistant-guide-screenshot',
            request_id: 'req-guide-screenshot',
          },
        },
      ]
        .map((event) => `data: ${JSON.stringify(event)}\n\n`)
        .join('')
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: {
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Request-ID': 'req-guide-screenshot',
          'X-Conversation-ID': 'conv-guide-screenshot',
        },
        body,
      })
    })

    await page.route('**/api/v1/datasets**', async (route) => {
      const request = route.request()
      const pathname = new URL(request.url()).pathname.replace(/\/$/, '')
      if (request.method() !== 'GET') return route.fallback()
      const dataset = {
        id: 'ds-smoke',
        name: '企业知识库示例',
        description: '用于演示建库、入库、检索与引用闭环的公开样例。',
        created_at: '2026-07-29T00:00:00Z',
        updated_at: '2026-07-29T00:00:00Z',
      }
      if (pathname === '/api/v1/datasets') {
        return fulfillJson(route, { items: [dataset], total: 1 })
      }
      if (pathname === '/api/v1/datasets/ds-smoke') {
        return fulfillJson(route, dataset)
      }
      return route.fallback()
    })

    await page.goto('/datasets')
    await expect(page.getByRole('heading', { name: '数据集' }).first()).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText('企业知识库示例').first()).toBeVisible()
    await captureGuideScreenshot(page, 'guide-create-dataset.png')

    await page.goto('/knowledge/ingestion?datasetId=ds-smoke')
    await expect(page.getByRole('heading', { name: '入库管理', exact: true })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText('企业知识库示例').first()).toBeVisible()
    await captureGuideScreenshot(page, 'guide-ingestion.png')

    await page.goto('/knowledge?tab=retrieval&dataset=ds-smoke')
    await expect(page.getByText('语义检索测试', { exact: true }).first()).toBeVisible({ timeout: 60_000 })
    await page.getByRole('button', { name: '收起侧栏' }).click()
    await page
      .getByPlaceholder('例如：请按第十二条说明例外条件，并指出适用范围与例外条款')
      .fill('知识库发布前需要完成哪些验收？')
    await page.getByRole('button', { name: '开始检索' }).click()
    await expect(page.getByText('企业知识库操作规范.pdf').first()).toBeVisible()
    await captureGuideScreenshot(page, 'guide-retrieval-test.png')

    await page.goto('/')
    const datasetScope = page.getByRole('button', { name: '选择数据集', exact: true })
    await expect(datasetScope).toBeVisible({ timeout: 60_000 })
    await datasetScope.click()
    await page.getByRole('button', { name: /企业知识库示例/ }).last().click()
    const composer = page.getByPlaceholder('问点什么... (Shift + Enter 换行)')
    await composer.fill('知识库发布前需要完成哪些验收？')
    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.getByText('发布前需要完成数据集权限检查')).toBeVisible({ timeout: 60_000 })
    await page.getByText('来源与证据', { exact: true }).last().click()
    const openEvidence = page.locator('details[open]').last()
    await expect(openEvidence.getByText('企业知识库操作规范.pdf')).toBeVisible()
    await openEvidence.scrollIntoViewIfNeeded()
    await captureGuideScreenshot(page, 'guide-source-evidence.png')
  })
})
