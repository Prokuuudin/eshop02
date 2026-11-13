import { readFileSync } from 'fs'
import path from 'path'
import { buildInviteEmail, buildRulesEmail, formatPointsAsEuros, interpolate, pickInviteTemplate } from './invitation-emails'

const bonus = { enabled: true, welcomeBonusPoints: 500, earnRatePercent: 0.5 }

describe('interpolate', () => {
  it('заменяет все вхождения переменной', () => {
    expect(interpolate('{{a}} и {{a}}', { a: 'x' })).toBe('x и x')
  })

  it('не переподставляет плейсхолдеры из значений переменных', () => {
    expect(interpolate('{{a}} {{b}}', { a: '{{b}}', b: 'x' })).toBe('{{b}} x')
  })
})

describe('buildInviteEmail', () => {
  it('фолбэк ru содержит карту и ссылку', () => {
    const { subject, html } = buildInviteEmail('ru', {
      name: 'Anna', cardNumber: '1001', inviteUrl: 'https://x.lv/auth/invite?token=t', bonus,
    })
    expect(subject.length).toBeGreaterThan(0)
    expect(html).toContain('1001')
    expect(html).toContain('https://x.lv/auth/invite?token=t')
    expect(html).not.toContain('/auth/register')
    expect(html).toContain('Anna')
  })

  it('старый плейсхолдер {{registration_link}} в сохранённом шаблоне тоже ведёт по персональной ссылке', () => {
    const { html } = buildInviteEmail(
      'ru',
      { name: 'Anna', cardNumber: '1001', inviteUrl: 'https://x.lv/auth/invite?token=t', bonus },
      { subject: 'S', body: 'B {{registration_link}}' }
    )
    expect(html).toBe('B https://x.lv/auth/invite?token=t')
  })

  it('DB-шаблон имеет приоритет', () => {
    const { subject, html } = buildInviteEmail(
      'ru',
      { name: 'Anna', cardNumber: '1001', inviteUrl: 'https://x', bonus },
      { subject: 'S {{card_number}}', body: 'B {{invite_link}} {{name}}' }
    )
    expect(subject).toBe('S 1001')
    expect(html).toBe('B https://x Anna')
  })

  it('экранирует HTML в имени', () => {
    const { html } = buildInviteEmail('en', {
      name: '<img>', cardNumber: '1', inviteUrl: 'https://x', bonus,
    })
    expect(html).not.toContain('<img>')
    expect(html).toContain('&lt;img&gt;')
  })
})

describe('buildInviteEmail — латышский дефолт', () => {
  it('письмо только на латышском, при любом языке приглашения', () => {
    for (const lang of ['lv', 'ru', 'en'] as const) {
      const { subject, html } = buildInviteEmail(lang, {
        name: 'Ilze', cardNumber: '1001', inviteUrl: 'https://x.lv/auth/invite?token=t', bonus,
      })
      expect(html).toContain('Aktivizēt kontu')
      expect(html).not.toMatch(/[А-Яа-яЁё]/)
      expect(html).not.toContain('Activate account')
      expect(subject).toBe('Jauns veikals profesionāļiem')
    }
  })

  it('MIKS PLUS везде с SIA, синие шапка и кнопка, дисклеймер в конце', () => {
    const { html } = buildInviteEmail('lv', {
      name: 'Ilze', cardNumber: '1001', inviteUrl: 'https://x.lv/auth/invite?token=t', bonus,
    })
    expect(html).toContain('SIA MIKS PLUS')
    expect(html).not.toMatch(/(?<!SIA )MIKS PLUS/)
    expect(html.match(/background:#0088C4/g)).toHaveLength(2)
    expect(html).not.toContain('#4f46e5')
    expect(html.trimEnd().endsWith('</div>')).toBe(true)
    expect(html.lastIndexOf('Paldies par sapratni!')).toBeGreaterThan(html.lastIndexOf('Aktivizēt kontu'))
    expect(html).toContain('office@miksplus.eu')
  })

  it('инструкция пошаговая: есть нумерованный список', () => {
    const { html } = buildInviteEmail('lv', {
      name: '', cardNumber: '1001', inviteUrl: 'https://x', bonus,
    })
    expect(html).toContain('<ol')
    expect(html).toContain('</ol>')
  })

  it('ссылка присутствует и как кнопка, и текстом (если кнопка не работает)', () => {
    const { html } = buildInviteEmail('en', {
      name: '', cardNumber: '1', inviteUrl: 'https://x.lv/auth/invite?token=abc', bonus,
    })
    const occurrences = html.split('https://x.lv/auth/invite?token=abc').length - 1
    expect(occurrences).toBeGreaterThanOrEqual(2)
  })

  it('не учит активировать карту по номеру и цифрам телефона', () => {
    const { html } = buildInviteEmail('en', {
      name: '', cardNumber: '1', inviteUrl: 'https://x.lv/auth/invite?token=abc', bonus,
    })
    expect(html).not.toMatch(/4 cipar|4 цифр|last 4 digits/)
  })
})

describe('buildInviteEmail — приветственный бонус', () => {
  const base = { name: 'Anna', cardNumber: '1001', inviteUrl: 'https://x.lv/auth/invite?token=t' }
  const tpl = {
    subject: 'S',
    body: 'A<!--bonus-->{{welcome_bonus_points}}|{{welcome_bonus_eur}}|{{bonus_earn_rate}}<!--/bonus-->Z',
  }

  it('подставляет баллы, сумму в евро и процент начисления из конфига', () => {
    const { html } = buildInviteEmail('ru', { ...base, bonus: { enabled: true, welcomeBonusPoints: 750, earnRatePercent: 1 } }, tpl)
    expect(html).toBe('A<!--bonus-->750|7.50|1<!--/bonus-->Z')
  })

  it('вырезает блок бонуса, если программа выключена или бонус 0', () => {
    for (const b of [{ ...bonus, enabled: false }, { ...bonus, welcomeBonusPoints: 0 }]) {
      expect(buildInviteEmail('ru', { ...base, bonus: b }, tpl).html).toBe('AZ')
    }
  })

  it('встроенный дефолт упоминает бонус (оранжевым) только когда он есть', () => {
    const on = buildInviteEmail('lv', { ...base, bonus }).html
    expect(on).toContain('Sveiciena bonuss')
    expect(on).toContain('color:#c2410c')
    expect(on).toContain('500')
    expect(on).not.toContain('{{')
    const off = buildInviteEmail('lv', { ...base, bonus: { ...bonus, welcomeBonusPoints: 0 } }).html
    expect(off).not.toContain('Sveiciena bonuss')
  })

  it('formatPointsAsEuros: 1 балл = 1 цент, без float-артефактов', () => {
    expect(formatPointsAsEuros(500)).toBe('5')
    expect(formatPointsAsEuros(550)).toBe('5.50')
    expect(formatPointsAsEuros(1005)).toBe('10.05')
    expect(formatPointsAsEuros(0)).toBe('0')
  })
})

describe('pickInviteTemplate', () => {
  const tpls = [
    { id: 'pro-invite', subject: 'base', body: 'b {{invite_link}}' },
    { id: 'pro-invite-ru', subject: 'ru', body: 'r {{invite_link}}' },
  ]
  it('языковой вариант приоритетнее базового', () => {
    expect(pickInviteTemplate(tpls, 'ru')!.subject).toBe('ru')
  })
  it('без языкового варианта берётся базовый pro-invite', () => {
    expect(pickInviteTemplate(tpls, 'lv')!.subject).toBe('base')
  })
  it('без шаблонов — undefined (встроенный дефолт)', () => {
    expect(pickInviteTemplate([], 'lv')).toBeUndefined()
  })
})

describe('шаблон pro-invite в data/email-templates.json', () => {
  const data = JSON.parse(
    readFileSync(path.join(__dirname, '..', 'data', 'email-templates.json'), 'utf-8')
  ) as { templates: { id: string; subject: string; body: string; variables: string[] }[] }
  const tpl = data.templates.find((t) => t.id === 'pro-invite')

  it('существует и ведёт по персональной одноразовой ссылке', () => {
    expect(tpl).toBeDefined()
    expect(tpl!.body).toContain('{{invite_link}}')
    expect(tpl!.body).not.toContain('{{registration_link}}')
  })

  it('только латышский, с номером карты, инструкцией и кнопкой активации', () => {
    expect(tpl!.body).toContain('{{card_number}}')
    expect(tpl!.body).toContain('Aktivizēt kontu')
    expect(tpl!.body).toContain('<ol')
    expect(tpl!.body).not.toMatch(/[А-Яа-яЁё]/)
    expect(tpl!.subject).not.toMatch(/[А-Яа-яЁё]/)
    expect(tpl!.body).not.toMatch(/Activate account|How to register/)
  })

  it('синие (как кружок логотипа) только шапка и кнопка, бонус оранжевый, старых зелёных нет', () => {
    expect(tpl!.body.match(/background:#0088C4/g)).toHaveLength(2)
    expect(tpl!.body).toMatch(/<a href="\{\{invite_link\}\}" style="[^"]*background:#0088C4/)
    expect(tpl!.body).toMatch(/<!--bonus--><div style="[^"]*background:#fff7ed/)
    expect(tpl!.body).not.toMatch(/#0f766e|#ecfdf5|#edf5f2/)
  })

  it('MIKS PLUS везде с SIA; дисклеймер мелким шрифтом в самом конце', () => {
    expect(tpl!.body).toContain('SIA MIKS PLUS')
    expect(tpl!.body).not.toMatch(/(?<!SIA )MIKS PLUS/)
    const tail = tpl!.body.slice(tpl!.body.lastIndexOf('</table>'))
    expect(tail).toContain('font-size:11px')
    expect(tail).toContain('Šī e-pasta ziņojuma saturs ir konfidenciāls un juridiski aizsargāts.')
    expect(tail).toContain('rakstot uz e-pasta adresi: office@miksplus.eu.')
    expect(tail).toContain('Paldies par sapratni!')
  })

  it('содержит вырезаемый блок приветственного бонуса с переменными из конфига', () => {
    const block = tpl!.body.match(/<!--bonus-->[\s\S]*?<!--\/bonus-->/)
    expect(block).not.toBeNull()
    for (const v of ['welcome_bonus_points', 'welcome_bonus_eur', 'bonus_earn_rate']) {
      expect(block![0]).toContain(`{{${v}}}`)
      expect(tpl!.variables).toContain(v)
    }
  })

  it('сообщает об открытии магазина, карте SIA MIKS PLUS и реальных бонусах', () => {
    expect(tpl!.body).toContain('jaunu interneta veikalu skaistumkopšanas profesionāļiem')
    expect(tpl!.body).toContain('Jūsu SIA MIKS PLUS klienta karte')
    expect(tpl!.body).toContain('profesionālās cenas')
    expect(tpl!.body).toContain('bonusa punkti')
    expect(tpl!.body).toContain('nākamajiem pirkumiem')
    expect(tpl!.body).toContain('Iestatiet savu paroli')
    expect(tpl!.body).not.toMatch(/4 cipar|4 цифр|last 4 digits/)
  })

  it('variables описывают все плейсхолдеры', () => {
    expect(tpl!.variables).toEqual(expect.arrayContaining(['name', 'card_number', 'invite_link']))
  })
})

describe('buildRulesEmail', () => {
  it('фолбэк lv содержит ссылку на сайт', () => {
    const { html } = buildRulesEmail('lv', { name: 'Ilze', siteUrl: 'https://site.lv' })
    expect(html).toContain('https://site.lv')
  })
})
