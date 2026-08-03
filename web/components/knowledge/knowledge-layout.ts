/**
 * 根据全局响应式断点返回文档网格的实际列数。
 * 该值同时用于 CSS 网格和虚拟列表分行，避免两者在窄屏下错位。
 */
export function resolveKnowledgeDocumentGridColumns(
  isMobile: boolean,
  isTablet: boolean
): 1 | 2 | 3 {
  if (isMobile) return 1
  if (isTablet) return 2
  return 3
}
