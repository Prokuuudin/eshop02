export function hasSkuChanged(currentSku?: string | null, nextSku?: string): boolean {
  return (currentSku?.trim().toLowerCase() ?? '') !== (nextSku?.trim().toLowerCase() ?? '')
}
