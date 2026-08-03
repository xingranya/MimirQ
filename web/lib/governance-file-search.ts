type GovernanceSearchableFile = {
  filename?: string | null
  datasetName?: string | null
  sourcePath?: string | null
  parser?: string | null
  fileType?: string | null
}

function normalizeSearchText(value: unknown): string {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
}

export function filterGovernanceFiles<T extends GovernanceSearchableFile>(
  files: T[],
  query: string
): T[] {
  const normalizedQuery = normalizeSearchText(query).trim()
  if (!normalizedQuery) return files

  return files.filter((file) =>
    [
      file.filename,
      file.datasetName,
      file.sourcePath,
      file.parser,
      file.fileType,
    ].some((value) => normalizeSearchText(value).includes(normalizedQuery))
  )
}
