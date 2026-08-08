'use client'

import type { BrandConfigItem, BrandManufacturerInfo } from '@/lib/brands-config'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Input } from '@/components/ui/input'
import type { useAdminBrandsPage } from './useAdminBrandsPage'

type State = ReturnType<typeof useAdminBrandsPage>
type LegalParty = 'manufacturer' | 'distributor'
type LegalField = keyof BrandManufacturerInfo
type Props = { brand: BrandConfigItem; state: Pick<State, 'tl' | 'updateBrandManufacturer' | 'updateBrandDistributor'> }
const fields: Array<{ field: LegalField; suffix: string; label: string }> = [
  { field: 'name', suffix: 'Name', label: 'Name' },
  { field: 'address', suffix: 'Address', label: 'Postal address' },
  { field: 'email', suffix: 'Email', label: 'E-mail' },
]

export default function BrandLegalSection({ brand, state }: Props): React.ReactElement {
  const { tl, updateBrandManufacturer, updateBrandDistributor } = state
  const hasData = [brand.manufacturer, brand.distributor].some((party) => Boolean(party?.name || party?.address || party?.email))
  const update = (party: LegalParty, patch: BrandManufacturerInfo) => {
    if (party === 'manufacturer') updateBrandManufacturer(brand.id, patch)
    else updateBrandDistributor(brand.id, patch)
  }
  return (
    <div className="admin-brands__legal-section mt-3">
      <Accordion type="single" collapsible>
        <AccordionItem value="legal" className="overflow-hidden rounded-lg border border-border">
          <AccordionTrigger className="px-4 py-2 text-sm font-medium hover:bg-gray-50 hover:no-underline dark:hover:bg-gray-800/50 [&>svg]:shrink-0">
            <span className="flex items-center gap-2">
              {tl('admin.brands.field.manufacturerSection', 'Производитель / Дистрибьютор (EU)', 'Manufacturer / Distributor (EU)', 'Ražotājs / Izplatītājs (ES)')}
              {hasData && <span className="inline-block h-2 w-2 rounded-full bg-green-500" title={tl('admin.brands.field.hasData', 'Данные заполнены', 'Data filled', 'Dati aizpildīti')} />}
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4 pt-2">
            <div className="grid gap-4">
              {(['manufacturer', 'distributor'] as const).map((party) => {
                const data = brand[party]
                const prefix = party === 'manufacturer' ? 'mfg' : 'dist'
                const heading = party === 'manufacturer'
                  ? tl('admin.brands.field.manufacturer', 'Производитель', 'Manufacturer', 'Ražotājs')
                  : tl('admin.brands.field.distributor', 'Дистрибьютор в ЕС', 'EU Distributor', 'ES Izplatītājs')
                return <div key={party} className={`admin-brands__${party}-group`}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{heading}</p>
                  <div className="admin-brands__legal-fields grid gap-2 md:grid-cols-3">
                    {fields.map(({ field, suffix, label }) => <label key={field} className="text-xs">
                      <span className="mb-1 block text-muted-foreground">{tl(`admin.brands.field.${prefix}${suffix}`, label, label, label)}</span>
                      <Input value={data?.[field] ?? ''} onChange={(event) => update(party, { [field]: event.target.value })} />
                    </label>)}
                  </div>
                </div>
              })}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}

