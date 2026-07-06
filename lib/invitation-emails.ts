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

const INVITE_CONTENT: Record<InviteLang, { subject: string; title: string; body1: string; body2: string; button: string; expiry: string }> = {
  ru: {
    subject: 'Приглашение на новый сайт для профессионалов',
    title: 'Добро пожаловать!',
    body1: 'Вы — держатель карты клиента №{{card_number}}. Мы открыли новый сайт для профессионалов и приглашаем вас.',
    body2: 'Ваш аккаунт уже создан. Нажмите кнопку, задайте пароль — и все возможности сайта будут доступны.',
    button: 'Активировать аккаунт',
    expiry: 'Ссылка действительна 7 дней.',
  },
  en: {
    subject: 'Invitation to our new professional store',
    title: 'Welcome!',
    body1: 'You hold client card No. {{card_number}}. We have launched a new site for professionals and invite you to join.',
    body2: 'Your account is already created. Click the button, set a password — and everything is ready.',
    button: 'Activate account',
    expiry: 'The link is valid for 7 days.',
  },
  lv: {
    subject: 'Ielūgums uz jauno profesionāļu veikalu',
    title: 'Laipni lūdzam!',
    body1: 'Jums ir klienta karte Nr. {{card_number}}. Esam atvēruši jaunu vietni profesionāļiem un aicinām jūs pievienoties.',
    body2: 'Jūsu konts jau ir izveidots. Nospiediet pogu, iestatiet paroli — un viss ir gatavs.',
    button: 'Aktivizēt kontu',
    expiry: 'Saite ir derīga 7 dienas.',
  },
}

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
  lang: InviteLang,
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
  const c = INVITE_CONTENT[lang]
  const greeting = safe.name ? `${safe.name}, ` : ''
  const html = wrap(
    c.title,
    [greeting + interpolate(c.body1, safe), c.body2],
    c.button,
    vars.inviteUrl,
    c.expiry
  )
  return { subject: c.subject, html }
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
