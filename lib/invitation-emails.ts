import type { InviteLang } from './invitations'

export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match
  )
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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

// Письмо-инвайт трёхъязычное (LV/RU/EN) — аудитория смешанная, язык получателя
// неизвестен. Каждый блок с пошаговой инструкцией.
const INVITE_SUBJECT =
  'Klienta karte — aktivizējiet kontu · Карта клиента — активируйте аккаунт · Activate your account'

const INVITE_BLOCKS: Array<{ intro: string; steps: string[] }> = [
  {
    intro: '<strong>LV</strong> — Jums ir klienta karte Nr. <strong>{{card_number}}</strong>. Esam atvēruši jaunu interneta veikalu profesionāļiem, un jūsu konts tajā jau ir izveidots. Kā sākt:',
    steps: [
      'Nospiediet pogu “Aktivizēt kontu”.',
      'Izveidojiet paroli (vismaz 8 simboli).',
      'Ielogojieties ar savu e-pastu un jauno paroli.',
    ],
  },
  {
    intro: '<strong>RU</strong> — У вас есть карта клиента № <strong>{{card_number}}</strong>. Мы открыли новый интернет-магазин для профессионалов, и ваш аккаунт в нём уже создан. Как начать:',
    steps: [
      'Нажмите кнопку «Активировать аккаунт».',
      'Придумайте пароль (не менее 8 символов).',
      'Войдите на сайт со своим e-mail и новым паролем.',
    ],
  },
  {
    intro: '<strong>EN</strong> — You hold client card No. <strong>{{card_number}}</strong>. We have launched a new online store for professionals, and your account is already set up. How to start:',
    steps: [
      'Click the “Activate account” button.',
      'Create a password (at least 8 characters).',
      'Log in with your email and your new password.',
    ],
  },
]

const INVITE_BUTTON = 'Aktivizēt kontu · Активировать аккаунт · Activate account'
const INVITE_LINK_FALLBACK =
  'Ja poga nedarbojas, atveriet šo saiti · Если кнопка не работает, откройте эту ссылку · If the button does not work, open this link:'
const INVITE_EXPIRY =
  'Saite ir derīga 7 dienas · Ссылка действительна 7 дней · The link is valid for 7 days.'

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
  const safe = {
    name: escapeHtml(vars.name),
    card_number: escapeHtml(vars.cardNumber),
    invite_link: vars.inviteUrl,
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
      <a href="${vars.inviteUrl}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
        ${INVITE_BUTTON}
      </a>
    </p>
    <p style="color:#6b7280;font-size:13px">${INVITE_LINK_FALLBACK}<br><a href="${vars.inviteUrl}">${vars.inviteUrl}</a></p>
    <p style="color:#6b7280;font-size:13px">${INVITE_EXPIRY}</p>
  </div>`
  return { subject: INVITE_SUBJECT, html }
}

const OFFICE_PHONE = '+371 27067730'
const OFFICE_EMAIL = 'office@miksplus.eu'

// Every cardholder shares one onboarding password, so a known/guessed card
// number is the only thing standing between an attacker and someone else's
// account. This has no button/CTA on purpose — it's a "was this you?" alert,
// sent right after a card is successfully activated, not an invitation.
export function buildCardActivatedEmail(vars: { name: string; cardNumber: string }): { subject: string; html: string } {
  const safe = { name: escapeHtml(vars.name), card_number: escapeHtml(vars.cardNumber) }
  const subject = 'Karte aktivizēta · Карта активирована · Card activated'
  const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
    <h2 style="color:#4f46e5">Karte aktivizēta · Карта активирована · Card activated</h2>
    ${safe.name ? `<p>${safe.name},</p>` : ''}
    <p><strong>LV</strong> — Jūsu klienta karte Nr. <strong>${safe.card_number}</strong> tikko tika aktivizēta vietnē hairshop-pro.lv. Ja tas nebijāt jūs, nekavējoties sazinieties ar mums: ${OFFICE_PHONE} / ${OFFICE_EMAIL}.</p>
    <p><strong>RU</strong> — Ваша карта клиента № <strong>${safe.card_number}</strong> только что была активирована на hairshop-pro.lv. Если это были не вы, срочно свяжитесь с нами: ${OFFICE_PHONE} / ${OFFICE_EMAIL}.</p>
    <p><strong>EN</strong> — Your client card No. <strong>${safe.card_number}</strong> was just activated on hairshop-pro.lv. If this wasn't you, contact us immediately: ${OFFICE_PHONE} / ${OFFICE_EMAIL}.</p>
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
