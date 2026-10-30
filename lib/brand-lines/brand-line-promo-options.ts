export type PromoBrandLineOption = {
  value: string
  label: string
  parentId: string | null
  brandName: string
  names: Record<string, string | undefined> | null
}

export function localizeBrandLineOptions(
  rows: PromoBrandLineOption[],
  language: 'ru' | 'en' | 'lv',
  locale: string,
): Array<{ value: string; label: string }> {
  const byId = new Map(rows.map((line) => [line.value, line]))
  const localizedName = (line: PromoBrandLineOption): string => {
    const names = line.names ?? {}
    return names[language] ?? names.default ?? names.ru ?? names.lv ?? names.en ?? line.value
  }
  const labelFor = (line: PromoBrandLineOption): string => {
    const path: string[] = []
    let current: PromoBrandLineOption | undefined = line
    const visited = new Set<string>()
    while (current && !visited.has(current.value)) {
      visited.add(current.value)
      path.unshift(localizedName(current))
      current = current.parentId ? byId.get(current.parentId) : undefined
    }
    return [line.brandName, ...path].join(' › ')
  }
  return rows
    .map((line) => ({ value: line.value, label: labelFor(line) }))
    .sort((left, right) => left.label.localeCompare(right.label, locale))
}
