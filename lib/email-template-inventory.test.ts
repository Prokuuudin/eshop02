import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

type Template = {
  id: string
  subject: string
  body: string
  variables: string[]
}

const templates = (JSON.parse(
  readFileSync(path.join(process.cwd(), 'data', 'email-templates.json'), 'utf8')
) as { templates: Template[] }).templates

const REQUIRED_TEMPLATE_IDS = [
  'order-confirmation', 'order-confirmation-en', 'order-confirmation-lv',
  'order-shipped', 'order-shipped-en', 'order-shipped-lv',
  'order-delivered', 'order-delivered-en', 'order-delivered-lv',
  'password-reset', 'password-reset-ru', 'password-reset-en', 'password-reset-lv',
  'access-request-rejected-ru', 'access-request-rejected-en', 'access-request-rejected-lv',
  'card-rules-ru', 'pro-invite',
]

describe('email template inventory', () => {
  it('contains every template referenced by transactional email flows', () => {
    const ids = new Set(templates.map((template) => template.id))
    expect(REQUIRED_TEMPLATE_IDS.filter((id) => !ids.has(id))).toEqual([])
  })

  it('has unique ids and declares every placeholder it uses', () => {
    const ids = templates.map((template) => template.id)
    expect(new Set(ids).size).toBe(ids.length)

    for (const template of templates) {
      const placeholders = new Set(
        [...`${template.subject}\n${template.body}`.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1])
      )
      expect([...placeholders].filter((placeholder) => !template.variables.includes(placeholder)), template.id).toEqual([])
    }
  })

  it('does not contain known obsolete factual claims', () => {
    const allText = templates.map((template) => `${template.subject}\n${template.body}`).join('\n')
    expect(allText).not.toContain('{{total}} ₽')
    expect(allText).not.toContain('Ссылка действительна в течение 24 часов')
  })

  it('uses the domain as the store name', () => {
    const allText = templates.map((template) => `${template.subject}\n${template.body}`).join('\n')
    expect(allText).not.toMatch(/HairShop\.lv|Hairshop-Pro|MiksPlus|Миксплюс|ProBeauty/)
    expect(allText).toContain('hairshoppro.lv')
  })

  it('does not expose templates from the retired shared-password registration flow', () => {
    const ids = new Set(templates.map((template) => template.id))
    const retiredIds = [
      'store-launch-ru', 'store-launch-en', 'store-launch-lv',
      'access-request-approved-ru', 'access-request-approved-en', 'access-request-approved-lv',
      'registration', 'registration-ru', 'registration-en', 'registration-lv',
    ]
    expect(retiredIds.filter((id) => ids.has(id))).toEqual([])

    const allText = templates.map((template) => template.body).join('\n')
    expect(allText).not.toMatch(/начальн(?:ый|ого) пароль|initial password|sākotnējo paroli/i)
  })
})
