import { describe, expect, it } from 'vitest'

import type { GovernanceProfilePayload } from '@/types'

import {
  buildGovernanceProfilePayload,
  governanceProfileDraftFingerprint,
} from './governance-profile-utils'

describe('治理模板保存数据', () => {
  it('编辑模板时保留继承关系和处理脚本', () => {
    const sourcePayload: GovernanceProfilePayload = {
      version: '2',
      extends: 'base-profile',
      input_formats: ['markdown'],
      pipeline_patch: { governance_enabled: true },
      regex_rules: [],
      processing_scripts: [
        {
          name: '统一标题',
          language: 'python',
          stage: 'post_governance',
          content: 'return content',
          enabled: true,
        },
      ],
    }

    const result = buildGovernanceProfilePayload(
      sourcePayload,
      ['html'],
      { governance_enabled: false },
      [{ pattern: '旧标题', repl: '新标题', flags: 0 }]
    )

    expect(result).toMatchObject({
      version: '2',
      extends: 'base-profile',
      input_formats: ['html'],
      pipeline_patch: { governance_enabled: false },
      regex_rules: [{ pattern: '旧标题', repl: '新标题', flags: 0 }],
      processing_scripts: sourcePayload.processing_scripts,
    })
    expect(result.processing_scripts).not.toBe(sourcePayload.processing_scripts)
  })

  it('新建模板时补齐可选字段的安全默认值', () => {
    expect(buildGovernanceProfilePayload(null, [], {}, [])).toEqual({
      version: '1',
      extends: null,
      input_formats: ['markdown'],
      pipeline_patch: {},
      regex_rules: [],
      processing_scripts: [],
    })
  })

  it('模板草稿指纹忽略首尾空格并识别配置修改', () => {
    const payload = buildGovernanceProfilePayload(null, [], {}, [])
    const baseline = governanceProfileDraftFingerprint({
      name: '基础模板',
      key: 'base',
      description: '清理 PDF',
      payload,
    })

    expect(
      governanceProfileDraftFingerprint({
        name: ' 基础模板 ',
        key: 'base ',
        description: ' 清理 PDF ',
        payload,
      })
    ).toBe(baseline)
    expect(
      governanceProfileDraftFingerprint({
        name: '基础模板',
        key: 'base',
        description: '清理 PDF',
        payload: { ...payload, input_formats: ['html'] },
      })
    ).not.toBe(baseline)
  })
})
