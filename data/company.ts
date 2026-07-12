// Rekvizīti — единый источник. Всегда отображаются на латышском, независимо от языка интерфейса.
export const COMPANY = {
  name: 'SIA Miks Plus',
  legalAddress: 'Rencēnu iela 10A, Rīga, Latvija, LV-1073',
  officeAddress: 'Rencēnu iela 10A, Rīga, Latvija',
  regNumber: '40103351370',
  vatNumber: 'LV40103351370',
  bankName: 'AS Swedbank',
  bankAccount: 'LV66HABA0551036604107',
  swift: 'HABALV22',
  phone: '+37127067730',
  email: 'Info@HairShop.lv',
} as const

export const COMPANY_CONTACT_LINES: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'Juridiskā adrese', value: COMPANY.legalAddress },
  { label: 'Reģ. Nr.', value: COMPANY.regNumber },
  { label: 'PVN maksātāja Nr.', value: COMPANY.vatNumber },
  { label: 'Banka', value: COMPANY.bankName },
  { label: 'Konts (IBAN)', value: COMPANY.bankAccount },
  { label: 'S.W.I.F.T.', value: COMPANY.swift },
  { label: 'Ofiss', value: COMPANY.officeAddress },
  { label: 'Tālrunis', value: COMPANY.phone },
  { label: 'E-pasts', value: COMPANY.email },
]
