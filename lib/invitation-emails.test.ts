import { readFileSync } from 'fs'
import path from 'path'
import { buildInviteEmail, buildRulesEmail, interpolate, pickInviteTemplate } from './invitation-emails'

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
      name: 'Anna', cardNumber: '1001', inviteUrl: 'https://x.lv/auth/invite?token=t',
    })
    expect(subject.length).toBeGreaterThan(0)
    expect(html).toContain('1001')
    expect(html).toContain('https://x.lv/auth/invite?token=t')
    expect(html).toContain('Anna')
  })

  it('DB-шаблон имеет приоритет', () => {
    const { subject, html } = buildInviteEmail(
      'ru',
      { name: 'Anna', cardNumber: '1001', inviteUrl: 'https://x' },
      { subject: 'S {{card_number}}', body: 'B {{invite_link}} {{name}}' }
    )
    expect(subject).toBe('S 1001')
    expect(html).toBe('B https://x Anna')
  })

  it('экранирует HTML в имени', () => {
    const { html } = buildInviteEmail('en', {
      name: '<img>', cardNumber: '1', inviteUrl: 'https://x',
    })
    expect(html).not.toContain('<img>')
    expect(html).toContain('&lt;img&gt;')
  })
})

describe('buildInviteEmail — трёхъязычный дефолт', () => {
  it('письмо содержит латышский, русский и английский блоки', () => {
    const { subject, html } = buildInviteEmail('lv', {
      name: 'Ilze', cardNumber: '1001', inviteUrl: 'https://x.lv/auth/invite?token=t',
    })
    expect(html).toContain('Aktivizēt')
    expect(html).toContain('Активировать')
    expect(html).toContain('Activate')
    expect(subject.length).toBeGreaterThan(0)
    expect(subject).not.toContain('{{') // без неподставленных плейсхолдеров
  })

  it('инструкция пошаговая: есть нумерованный список', () => {
    const { html } = buildInviteEmail('lv', {
      name: '', cardNumber: '1001', inviteUrl: 'https://x',
    })
    expect(html).toContain('<ol')
    expect(html).toContain('</ol>')
  })

  it('ссылка присутствует и как кнопка, и текстом (если кнопка не работает)', () => {
    const { html } = buildInviteEmail('en', {
      name: '', cardNumber: '1', inviteUrl: 'https://x.lv/auth/invite?token=abc',
    })
    const occurrences = html.split('https://x.lv/auth/invite?token=abc').length - 1
    expect(occurrences).toBeGreaterThanOrEqual(2)
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

  it('существует и содержит критичный {{invite_link}} в body', () => {
    expect(tpl).toBeDefined()
    expect(tpl!.body).toContain('{{invite_link}}')
  })

  it('трёхъязычный с номером карты и пошаговой инструкцией', () => {
    expect(tpl!.body).toContain('{{card_number}}')
    expect(tpl!.body).toContain('Aktivizēt')
    expect(tpl!.body).toContain('Активировать')
    expect(tpl!.body).toContain('Activate')
    expect(tpl!.body).toContain('<ol')
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
