export type DiagnosticParameterLimit = Readonly<{
  min: number
  max: number
}>

export const DIAGNOSTIC_PARAMETER_LIMITS = {
  driftSample: { min: 1, max: 2000 },
  driftThreshold: { min: 0, max: 1 },
  perfIterations: { min: 1, max: 200 },
  perfTimeout: { min: 0.05, max: 10 },
} as const satisfies Record<string, DiagnosticParameterLimit>

/** 将诊断参数限制在后端接受的数值范围内。 */
export function clampDiagnosticNumber(
  value: number,
  limit: DiagnosticParameterLimit,
  fallback: number
) {
  const normalized = Number.isFinite(value) ? value : fallback
  return Math.min(limit.max, Math.max(limit.min, normalized))
}

/** 将需要整数的诊断参数取整，并限制在后端接受的范围内。 */
export function clampDiagnosticInteger(
  value: number,
  limit: DiagnosticParameterLimit,
  fallback: number
) {
  return Math.trunc(clampDiagnosticNumber(value, limit, fallback))
}
