import type { InviteLang } from './invitations'
import { escapeHtml } from './escape-html'

export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match
  )
}

type Tpl = { subject: string; body: string }

/** Срез конфига бонусной программы, нужный письму-приглашению. */
export type InviteBonusInfo = { enabled: boolean; welcomeBonusPoints: number; earnRatePercent: number }

// Блок о приветственном бонусе в шаблоне обёрнут маркерами: если бонус не
// начисляется (программа выключена или 0 баллов), блок вырезается целиком,
// чтобы письмо не обещало «0 €» или несуществующий бонус.
const BONUS_SECTION_RE = /<!--bonus-->[\s\S]*?<!--\/bonus-->/g

/** 1 балл = 1 цент; целочисленно, без float: 500 → "5", 550 → "5.50". */
export function formatPointsAsEuros(points: number): string {
  const cents = Math.max(0, Math.round(points))
  const euros = Math.floor(cents / 100)
  const rest = cents % 100
  return rest === 0 ? String(euros) : `${euros}.${String(rest).padStart(2, '0')}`
}

function welcomeBonusPoints(bonus: InviteBonusInfo): number {
  return bonus.enabled ? Math.max(0, Math.round(bonus.welcomeBonusPoints)) : 0
}

/** Языковой вариант шаблона приоритетнее базового pro-invite. */
export function pickInviteTemplate<T extends { id: string }>(
  templates: T[],
  lang: InviteLang
): T | undefined {
  return (
    templates.find((t) => t.id === `pro-invite-${lang}`) ??
    templates.find((t) => t.id === 'pro-invite')
  )
}

// Письмо-приглашение только на латышском (решение владельца 2026-11-13) и ведёт
// держателя карты по персональной одноразовой ссылке (/auth/invite).
// Синий — цвет кружка в логотипе (public/logo-2026.svg): шапка и кнопка;
// остальные акценты голубые, блок бонуса оранжевый.
const INVITE_BRAND_BLUE = '#0088C4'
const INVITE_LIGHT_BLUE = '#1a9ad6'
const INVITE_SUBJECT = 'Jauns veikals profesionāļiem'

const INVITE_INTRO =
  '<strong>SIA MIKS PLUS</strong> ir atvērusi jaunu interneta veikalu skaistumkopšanas profesionāļiem — <strong>hairshoppro.lv</strong>. Atgādinām: jums ir SIA MIKS PLUS klienta karte Nr. <strong>{{card_number}}</strong>. Pēc reģistrācijas redzēsiet profesionālās cenas, varēsiet veikt pasūtījumus tiešsaistē, krāt bonusu punktus un izmantot tos nākamajiem pirkumiem. Kā reģistrēties:'
const INVITE_BONUS =
  'Sveiciena bonuss: pēc reģistrācijas jūsu kontā tiks ieskaitīti {{welcome_bonus_points}} bonusa punkti ({{welcome_bonus_eur}} €). Par katru pasūtījumu krājas {{bonus_earn_rate}}% no summas punktos; 1 punkts = 1 cents, punktus var izmantot nākamo pirkumu apmaksai.'
const INVITE_STEPS = [
  'Nospiediet zemāk pogu “Aktivizēt kontu” — saite ir personīga un derīga ierobežotu laiku.',
  'Iestatiet savu paroli.',
  'Turpmāk piesakieties ar kartes numuru un šo paroli.',
]
const INVITE_BUTTON = 'Aktivizēt kontu'
const INVITE_LINK_FALLBACK = 'Ja poga nedarbojas, atveriet šo saiti:'

/** Конфиденциальность/отписка — мелким шрифтом в самом конце письма-приглашения. */
export const INVITE_DISCLAIMER = [
  'Šī e-pasta ziņojuma saturs ir konfidenciāls un juridiski aizsargāts. Tas ir paredzēts tikai norādītajam adresātam. Ja neesat šī ziņojuma adresāts, jebkāda tā satura izpaušana, kopēšana, izplatīšana vai cita veida izmantošana, kā arī jebkāda rīcība, pamatojoties uz tajā ietverto informāciju, ir stingri aizliegta un var būt prettiesiska.',
  'Ja turpmāk nevēlaties saņemt e-pasta ziņojumus no SIA MIKS PLUS, lūdzam par to informēt mūs, rakstot uz e-pasta adresi: office@miksplus.eu.',
  'Ja esat saņēmis šo ziņojumu kļūdas dēļ, lūdzam nekavējoties informēt sūtītāju, atbildot uz šo e-pastu, un dzēst ziņojumu no savas sistēmas.',
  'Paldies par sapratni!',
]

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
  vars: { name: string; cardNumber: string; inviteUrl: string; bonus: InviteBonusInfo },
  tpl?: Tpl
): { subject: string; html: string } {
  // Card activation happens only through the personal one-time link. A stored template that still
  // uses the retired {{registration_link}} placeholder gets the same personal link.
  const activationLink = vars.inviteUrl
  const bonusPoints = welcomeBonusPoints(vars.bonus)
  const safe = {
    name: escapeHtml(vars.name),
    card_number: escapeHtml(vars.cardNumber),
    invite_link: activationLink,
    registration_link: activationLink,
    welcome_bonus_points: String(bonusPoints),
    welcome_bonus_eur: formatPointsAsEuros(bonusPoints),
    bonus_earn_rate: String(Math.max(0, vars.bonus.earnRatePercent)),
  }
  if (tpl) {
    const body = bonusPoints > 0 ? tpl.body : tpl.body.replace(BONUS_SECTION_RE, '')
    return { subject: interpolate(tpl.subject, safe), html: interpolate(body, safe) }
  }
  const html = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto">
    <div style="padding:20px;background:${INVITE_BRAND_BLUE};color:#fff;text-align:center;border-radius:8px 8px 0 0">
      <div style="font-size:13px;font-weight:700;letter-spacing:.12em">SIA MIKS PLUS</div>
      <h2 style="margin:8px 0 0">Laipni lūdzam!</h2>
    </div>
    ${safe.name ? `<p>${safe.name}</p>` : ''}
    <p>${interpolate(INVITE_INTRO, safe)}</p>
    <ol style="margin:4px 0 16px;padding-left:20px">${INVITE_STEPS.map((s) => `<li>${s}</li>`).join('')}</ol>
    ${bonusPoints > 0 ? `<p style="color:#c2410c"><strong>${interpolate(INVITE_BONUS, safe)}</strong></p>` : ''}
    <p>
      <a href="${activationLink}" style="display:inline-block;padding:12px 24px;background:${INVITE_BRAND_BLUE};color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
        ${INVITE_BUTTON}
      </a>
    </p>
    <p style="color:#6b7280;font-size:13px">${INVITE_LINK_FALLBACK}<br><a href="${activationLink}" style="color:${INVITE_LIGHT_BLUE}">${activationLink}</a></p>
    <div style="margin-top:24px;color:#6b8290;font-size:11px;line-height:1.5">${INVITE_DISCLAIMER.map((p) => `<p style="margin:0 0 6px">${p}</p>`).join('')}</div>
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
