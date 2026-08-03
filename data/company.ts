// Rekvizīti — единый источник. Значения всегда на латышском, лейблы — через переводы (labelKey).
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
  email: 'info@hairshop.lv',
  sameAs: ['https://hairshop.lv/'],
} as const

export const COMPANY_CONTACT_LINES: ReadonlyArray<{ labelKey: string; value: string }> = [
  { labelKey: 'contact.legalAddressLabel', value: COMPANY.legalAddress },
  { labelKey: 'contact.regNumberLabel', value: COMPANY.regNumber },
  { labelKey: 'contact.vatLabel', value: COMPANY.vatNumber },
  { labelKey: 'contact.bankLabel', value: COMPANY.bankName },
  { labelKey: 'contact.bankAccountLabel', value: COMPANY.bankAccount },
  { labelKey: 'contact.swiftLabel', value: COMPANY.swift },
  { labelKey: 'contact.officeAddressLabel', value: COMPANY.officeAddress },
  { labelKey: 'contact.phoneLabel', value: COMPANY.phone },
  { labelKey: 'contact.emailLabel', value: COMPANY.email },
]
