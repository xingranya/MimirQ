import { describe, expectTypeOf, it } from 'vitest'

import type { components } from './openapi'
import type { QuerysetHealthDiffResponse, QuerysetHealthRunsResponse } from './observability'

describe('检索集健康度 OpenAPI 类型契约', () => {
  it('直接复用后端生成的运行历史响应类型', () => {
    expectTypeOf<QuerysetHealthRunsResponse>().toEqualTypeOf<
      components['schemas']['QuerysetHealthRunsResponse']
    >()
  })

  it('直接复用后端生成的差异响应类型', () => {
    expectTypeOf<QuerysetHealthDiffResponse>().toEqualTypeOf<
      components['schemas']['QuerysetHealthDiffResponse']
    >()
  })
})
