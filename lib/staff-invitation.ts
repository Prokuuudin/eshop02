import { escapeHtml } from '@/lib/escape-html'

export const STAFF_INVITE_CHANNEL = 'staff-invite'
export const STAFF_INVITE_TTL_HOURS = 24

export type StaffInviteLanguage = 'ru' | 'en' | 'lv'

const COPY = {
  ru: {
    subject: 'Hairshop Pro: приглашение сотрудника',
    greeting: (name: string) => `Здравствуйте${name ? `, ${name}` : ''}!`,
    intro: 'Для вас создана персональная учётная запись сотрудника Hairshop Pro.',
    action: 'Установить пароль',
    expiry: 'Ссылка одноразовая и действует 24 часа.',
    security: 'После назначения администратором при первом входе потребуется самостоятельно зарегистрировать MFA. Никому не передавайте пароль, MFA-секрет или резервные коды.',
    note: 'Это приглашение само по себе не предоставляет административных прав.',
  },
  en: {
    subject: 'Hairshop Pro: staff invitation',
    greeting: (name: string) => `Hello${name ? `, ${name}` : ''}!`,
    intro: 'A personal Hairshop Pro staff account has been created for you.',
    action: 'Set password',
    expiry: 'This link is single-use and expires in 24 hours.',
    security: 'After you are appointed as an administrator, you will be required to enroll MFA yourself on first sign-in. Never share your password, MFA secret, or recovery codes.',
    note: 'This invitation does not grant administrative privileges by itself.',
  },
  lv: {
    subject: 'Hairshop Pro: darbinieka uzaicinājums',
    greeting: (name: string) => `Labdien${name ? `, ${name}` : ''}!`,
    intro: 'Jums ir izveidots personīgs Hairshop Pro darbinieka konts.',
    action: 'Iestatīt paroli',
    expiry: 'Saite ir vienreizēja un derīga 24 stundas.',
    security: 'Pēc administratora lomas piešķiršanas pirmajā pierakstīšanās reizē jums būs pašam jāreģistrē MFA. Neizpaudiet paroli, MFA noslēpumu vai rezerves kodus.',
    note: 'Šis uzaicinājums pats par sevi nepiešķir administratora tiesības.',
  },
} as const

export function buildStaffInvitationEmail(input: {
  language: StaffInviteLanguage
  name?: string | null
  activationUrl: string
}): { subject: string; html: string } {
  const copy = COPY[input.language]
  const safeName = escapeHtml(input.name?.trim() ?? '')
  const safeUrl = escapeHtml(input.activationUrl)

  return {
    subject: copy.subject,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#17211b;max-width:600px;margin:0 auto">
        <h2>${copy.greeting(safeName)}</h2>
        <p>${copy.intro}</p>
        <p><a href="${safeUrl}" style="display:inline-block;padding:12px 20px;background:#047857;color:#fff;text-decoration:none;border-radius:6px">${copy.action}</a></p>
        <p>${copy.expiry}</p>
        <p>${copy.note}</p>
        <p>${copy.security}</p>
      </div>
    `.trim(),
  }
}
