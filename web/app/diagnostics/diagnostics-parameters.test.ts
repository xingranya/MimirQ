import { describe, expect, it } from 'vitest'

import {
  clampDiagnosticInteger,
  clampDiagnosticNumber,
  DIAGNOSTIC_PARAMETER_LIMITS,
} from './diagnostics-parameters'

describe('诊断参数边界', () => {
  it('限制漂移采样数量并去掉小数部分', () => {
    const limit = DIAGNOSTIC_PARAMETER_LIMITS.driftSample

    expect(clampDiagnosticInteger(0, limit, 200)).toBe(1)
    expect(clampDiagnosticInteger(42.9, limit, 200)).toBe(42)
    expect(clampDiagnosticInteger(3000, limit, 200)).toBe(2000)
    expect(clampDiagnosticInteger(Number.NaN, limit, 200)).toBe(200)
  })

  it('限制漂移阈值和性能超时时间', () => {
    expect(clampDiagnosticNumber(-0.1, DIAGNOSTIC_PARAMETER_LIMITS.driftThreshold, 0.05)).toBe(0)
    expect(clampDiagnosticNumber(1.4, DIAGNOSTIC_PARAMETER_LIMITS.driftThreshold, 0.05)).toBe(1)
    expect(clampDiagnosticNumber(0, DIAGNOSTIC_PARAMETER_LIMITS.perfTimeout, 2)).toBe(0.05)
    expect(
      clampDiagnosticNumber(Number.POSITIVE_INFINITY, DIAGNOSTIC_PARAMETER_LIMITS.perfTimeout, 2)
    ).toBe(2)
  })
})
