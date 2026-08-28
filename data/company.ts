// Rekvizīti — единый источник. Значения всегда на латышском, лейблы — через переводы (labelKey).
export const COMPANY = {
  name: 'SIA Miks Plus',
  legalAddress: 'Rencēnu iela 10A, Rīga, Latvija, LV-1073',
  officeAddress: 'Rencēnu iela 10A, Rīga, LV-1073, Latvija',
  regNumber: '40103351370',
  vatNumber: 'LV40103351370',
  bankName: 'AS Swedbank',
  bankAccount: 'LV66HABA0551036604107',
  swift: 'HABALV22',
  phone: '+37127067730',
  email: 'info@hairshop.lv',
  sameAs: ['https://hairshop.lv/'],
} as const

export const COMPANY_CONTACT_LINES: ReadonlyArray<{ labelKey: string; contentKey: string; value: string }> = [
  { labelKey: 'contact.legalAddressLabel', contentKey: 'company.legalAddress', value: COMPANY.legalAddress },
  { labelKey: 'contact.regNumberLabel', contentKey: 'company.regNumber', value: COMPANY.regNumber },
  { labelKey: 'contact.vatLabel', contentKey: 'company.vatNumber', value: COMPANY.vatNumber },
  { labelKey: 'contact.bankLabel', contentKey: 'company.bankName', value: COMPANY.bankName },
  { labelKey: 'contact.bankAccountLabel', contentKey: 'company.bankAccount', value: COMPANY.bankAccount },
  { labelKey: 'contact.swiftLabel', contentKey: 'company.swift', value: COMPANY.swift },
  { labelKey: 'contact.officeAddressLabel', contentKey: 'company.officeAddress', value: COMPANY.officeAddress },
  { labelKey: 'contact.phoneLabel', contentKey: 'company.phone', value: COMPANY.phone },
  { labelKey: 'contact.emailLabel', contentKey: 'company.email', value: COMPANY.email },
]
