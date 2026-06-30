export function stripBrandPrefix(title: string, brand: string): string {
  const trimmedTitle = title?.trim() ?? ''
  const trimmedBrand = brand?.trim() ?? ''
  if (!trimmedTitle || !trimmedBrand) return trimmedTitle
  if (!trimmedTitle.toLowerCase().startsWith(trimmedBrand.toLowerCase())) return trimmedTitle
  const rest = trimmedTitle.slice(trimmedBrand.length).trim()
  return rest || trimmedTitle
}
