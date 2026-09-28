export const ALLOWED_STOCK_WAREHOUSES = ['10000', '10001', '10002', '10005'] as const
export const EXCLUDED_STOCK_WAREHOUSES = ['10003', '10004', '10006', '10007', '10010'] as const

export const clean = (value: unknown): string => String(value ?? '').trim()
export const numeric = (value: unknown): number => {
  const parsed = Number(clean(value) || '0')
  return Number.isFinite(parsed) ? parsed : Number.NaN
}
export const normalizedName = (value: unknown): string => clean(value).normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/gu, ' ')
export const normalizedEan = (value: unknown): string => clean(value).toLocaleUpperCase('en-US').replace(/[\s-]+/gu, '')
export const skuKeys = (value: unknown): string[] => {
  const raw = clean(value), upper = raw.toLocaleUpperCase('en-US')
  return [...new Set([upper, upper.replace(/^0+(?=\d)/u, ''), upper.replace(/\./gu, ''), upper.replace(/[\s\u00a0]+/gu, '')].filter(Boolean))]
}
export const isStandardEanUpc = (value: unknown): boolean => {
  const code=normalizedEan(value)
  if(!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/u.test(code))return false
  const digits=[...code].map(Number),check=digits.pop()!,sum=digits.reduce((total,digit,index)=>total+digit*(((digits.length-index)%2===1)?3:1),0)
  return (10-(sum%10))%10===check
}
export const allowedStock = (warehouses: Record<string, number>): number => ALLOWED_STOCK_WAREHOUSES.reduce((sum, id) => sum + Math.max(0, warehouses[id] ?? 0), 0)
export type ZeroStockReason = 'ALL_WAREHOUSES_ZERO'|'EXCLUDED_WAREHOUSE_ONLY'|'NEGATIVE_VALUES'|'MISSING_WAREHOUSE_FIELDS'|'UNUSUAL_COMBINATION'
export function zeroStockReason(warehouses: Record<string, number>): ZeroStockReason {
  const values=Object.values(warehouses), missing=ALLOWED_STOCK_WAREHOUSES.some(id=>!(id in warehouses)), negative=values.some(v=>v<0)
  if(EXCLUDED_STOCK_WAREHOUSES.some(id=>(warehouses[id]??0)>0))return 'EXCLUDED_WAREHOUSE_ONLY'
  if(negative)return 'NEGATIVE_VALUES'
  if(missing)return 'MISSING_WAREHOUSE_FIELDS'
  if(values.every(v=>v===0))return 'ALL_WAREHOUSES_ZERO'
  return 'UNUSUAL_COMBINATION'
}
export function median(values: number[]): number {
  const sorted=[...values].sort((a,b)=>a-b), middle=Math.floor(sorted.length/2)
  return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2
}
export function quantile(values:number[],q:number):number{
  const sorted=[...values].sort((a,b)=>a-b), position=(sorted.length-1)*q, base=Math.floor(position), rest=position-base
  return sorted[base]+((sorted[base+1]??sorted[base])-sorted[base])*rest
}
