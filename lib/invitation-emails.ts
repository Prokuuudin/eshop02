import type { InviteLang } from './invitations'
import { escapeHtml } from './escape-html'

export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match
  )
}

type Tpl = { subject: string; body: string }

/** Языковой вариант шаблона приоритетнее базового трёхъязычного pro-invite. */
export function pickInviteTemplate<T extends { id: string }>(
  templates: T[],
  lang: InviteLang
): T | undefined {
  return (
    templates.find((t) => t.id === `pro-invite-${lang}`) ??
    templates.find((t) => t.id === 'pro-invite')
  )
}

// Трёхъязычное письмо ведёт держателя карты в обычную регистрацию.
const INVITE_SUBJECT =
  'Jauns veikals profesionāļiem · Новый магазин для профессионалов · A new store for professionals'

const INVITE_BLOCKS: Array<{ intro: string; steps: string[] }> = [
  {
    intro: '<strong>LV</strong> — MIKS PLUS ir atvēris jaunu interneta veikalu skaistumkopšanas profesionāļiem — <strong>hairshoppro.lv</strong>. Atgādinām: jums ir MIKS PLUS klienta karte Nr. <strong>{{card_number}}</strong>. Pēc reģistrācijas redzēsiet profesionālās cenas, varēsiet veikt pasūtījumus tiešsaistē, krāt bonusu punktus un izmantot tos nākamajiem pirkumiem. Kā reģistrēties:',
    steps: [
      'Atveriet reģistrācijas lapu un izvēlieties “Man ir klienta karte”.',
      'Ievadiet MIKS PLUS kartes numuru un e-pastu un/vai tālruņa numura pēdējos 4 ciparus, kas norādīti klientu datubāzē.',
      'Sistēma pārbaudīs datu atbilstību un uzreiz atvērs jūsu kontu.',
    ],
  },
  {
    intro: '<strong>RU</strong> — MIKS PLUS открыл новый интернет-магазин для профессионалов индустрии красоты — <strong>hairshoppro.lv</strong>. Напоминаем: у вас есть карта клиента MIKS PLUS № <strong>{{card_number}}</strong>. После регистрации вам будут доступны профессиональные цены, онлайн-заказы, накопление бонусных баллов и их использование при следующих покупках. Как зарегистрироваться:',
    steps: [
      'Откройте страницу регистрации и выберите «Есть карта клиента».',
      'Введите номер карты MIKS PLUS и email и/или последние 4 цифры телефона, указанные в клиентской базе.',
      'Система проверит соответствие данных и сразу откроет ваш аккаунт.',
    ],
  },
  {
    intro: '<strong>EN</strong> — MIKS PLUS has opened a new online store for beauty professionals — <strong>hairshoppro.lv</strong>. A reminder: you have MIKS PLUS client card No. <strong>{{card_number}}</strong>. Once registered, you can access professional prices, order online, earn bonus points and redeem them on future purchases. How to register:',
    steps: [
      'Open the registration page and select “I have a client card”.',
      'Enter your MIKS PLUS card number and the email and/or last 4 digits of the phone number stored in the client database.',
      'The system will verify the details and open your account immediately.',
    ],
  },
]

const INVITE_BUTTON = 'Reģistrēties · Зарегистрироваться · Register'
const INVITE_LINK_FALLBACK =
  'Ja poga nedarbojas, atveriet šo saiti · Если кнопка не работает, откройте эту ссылку · If the button does not work, open this link:'
const RULES_CONTENT: Record<InviteLang, { subject: string; title: string; body1: string; body2: string; button: string }> = {
  ru: {
    subject: 'Как получить карту клиента',
    title: 'Карта клиента — доступ к сайту для профессионалов',
    body1: 'Мы открыли новый сайт для профессионалов индустрии красоты. Полный доступ к ценам и заказам даёт карта клиента.',
    body2: 'Получить карту просто: подайте заявку на сайте, приложив сертификат специалиста или данные салона. Мы рассмотрим заявку и вышлем номер карты.',
    button: 'Подать заявку',
  },
  en: {
    subject: 'How to get a client card',
    title: 'Client card — access to the professional store',
    body1: 'We have launched a new site for beauty industry professionals. A client card gives full access to prices and ordering.',
    body2: 'Getting a card is simple: submit a request on the site with your professional certificate or salon details. We will review it and send you a card number.',
    button: 'Submit a request',
  },
  lv: {
    subject: 'Kā saņemt klienta karti',
    title: 'Klienta karte — pieeja profesionāļu veikalam',
    body1: 'Esam atvēruši jaunu vietni skaistumkopšanas profesionāļiem. Klienta karte dod pilnu pieeju cenām un pasūtījumiem.',
    body2: 'Saņemt karti ir vienkārši: iesniedziet pieteikumu vietnē, pievienojot speciālista sertifikātu vai salona datus. Mēs izskatīsim pieteikumu un nosūtīsim kartes numuru.',
    button: 'Iesniegt pieteikumu',
  },
}

function wrap(title: string, paragraphs: string[], buttonText: string, buttonUrl: string, footer: string): string {
  return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
    <h2 style="color:#4f46e5">${title}</h2>
    ${paragraphs.map((p) => `<p>${p}</p>`).join('\n    ')}
    <p>
      <a href="${buttonUrl}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
        ${buttonText}
      </a>
    </p>
    ${footer ? `<p style="color:#6b7280;font-size:13px">${footer}</p>` : ''}
  </div>`
}

export function buildInviteEmail(
  _lang: InviteLang,
  vars: { name: string; cardNumber: string; inviteUrl: string },
  tpl?: Tpl
): { subject: string; html: string } {
  const registrationLink = (() => {
    try { return `${new URL(vars.inviteUrl).origin}/auth/register` } catch { return '/auth/register' }
  })()
  const safe = {
    name: escapeHtml(vars.name),
    card_number: escapeHtml(vars.cardNumber),
    invite_link: vars.inviteUrl,
    registration_link: registrationLink,
  }
  if (tpl) {
    return { subject: interpolate(tpl.subject, safe), html: interpolate(tpl.body, safe) }
  }
  const blocks = INVITE_BLOCKS.map(
    (b) =>
      `<p>${interpolate(b.intro, safe)}</p>
    <ol style="margin:4px 0 16px;padding-left:20px">${b.steps.map((s) => `<li>${s}</li>`).join('')}</ol>`
  )
  const html = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto">
    <h2 style="color:#4f46e5">Laipni lūdzam! · Добро пожаловать! · Welcome!</h2>
    ${safe.name ? `<p>${safe.name}</p>` : ''}
    ${blocks.join('\n    ')}
    <p>
      <a href="${registrationLink}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
        ${INVITE_BUTTON}
      </a>
    </p>
    <p style="color:#6b7280;font-size:13px">${INVITE_LINK_FALLBACK}<br><a href="${registrationLink}">${registrationLink}</a></p>
  </div>`
  return { subject: INVITE_SUBJECT, html }
}

const OFFICE_PHONE = '+371 27067730'
const OFFICE_EMAIL = 'office@miksplus.eu'

// Every cardholder shares one onboarding password, so a known/guessed card
// number is the only thing standing between an attacker and someone else's
// account. This has no button/CTA on purpose — it's a "was this you?" alert,
// sent right after a card is successfully activated, not an invitation.
export function buildCardActivatedEmail(vars: { name: string; cardNumber: string }, tpl?: Tpl): { subject: string; html: string } {
  const safe = { name: escapeHtml(vars.name), card_number: escapeHtml(vars.cardNumber) }
  if (tpl) {
    return { subject: interpolate(tpl.subject, safe), html: interpolate(tpl.body, safe) }
  }
  const subject = 'Karte aktivizēta · Карта активирована · Card activated'
  const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
    <h2 style="color:#4f46e5">Karte aktivizēta · Карта активирована · Card activated</h2>
    ${safe.name ? `<p>${safe.name},</p>` : ''}
    <p><strong>LV</strong> — Jūsu klienta karte Nr. <strong>${safe.card_number}</strong> tikko tika aktivizēta vietnē hairshoppro.lv. Ja tas nebijāt jūs, nekavējoties sazinieties ar mums: ${OFFICE_PHONE} / ${OFFICE_EMAIL}.</p>
    <p><strong>RU</strong> — Ваша карта клиента № <strong>${safe.card_number}</strong> только что была активирована на hairshoppro.lv. Если это были не вы, срочно свяжитесь с нами: ${OFFICE_PHONE} / ${OFFICE_EMAIL}.</p>
    <p><strong>EN</strong> — Your client card No. <strong>${safe.card_number}</strong> was just activated on hairshoppro.lv. If this wasn't you, contact us immediately: ${OFFICE_PHONE} / ${OFFICE_EMAIL}.</p>
  </div>`
  return { subject, html }
}

export function buildRulesEmail(
  lang: InviteLang,
  vars: { name: string; siteUrl: string },
  tpl?: Tpl
): { subject: string; html: string } {
  const safe = { name: escapeHtml(vars.name), site_url: vars.siteUrl }
  if (tpl) {
    return { subject: interpolate(tpl.subject, safe), html: interpolate(tpl.body, safe) }
  }
  const c = RULES_CONTENT[lang]
  const greeting = safe.name ? `${safe.name}, ` : ''
  const html = wrap(
    c.title,
    [greeting + c.body1, c.body2],
    c.button,
    `${vars.siteUrl}/auth/register`,
    ''
  )
  return { subject: c.subject, html }
}
