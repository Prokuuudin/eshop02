import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/mailer'

export const runtime = 'nodejs'

type Lang = 'ru' | 'en' | 'lv'

const FIRST_LOGIN_PASSWORD =
  process.env.NEXT_PUBLIC_FIRST_LOGIN_PASSWORD || 'Welcome1!'

const OFFICE_PHONE = '+371 27067730'
const OFFICE_EMAIL = 'office@miksplus.eu'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://miksplus.eu'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const i18n = {
  approval: {
    subject: {
      ru: 'Добро пожаловать! Ваша карта клиента готова',
      en: 'Welcome! Your client card is ready',
      lv: 'Laipni lūdzam! Jūsu klienta karte ir gatava',
    },
    heading: {
      ru: 'Добро пожаловать!',
      en: 'Welcome!',
      lv: 'Laipni lūdzam!',
    },
    subheading: {
      ru: 'Ваша карта клиента готова',
      en: 'Your client card is ready',
      lv: 'Jūsu klienta karte ir gatava',
    },
    greeting: {
      ru: (name: string) => `Дорогой(-ая) ${name},`,
      en: (name: string) => `Dear ${name},`,
      lv: (name: string) => `Cienījamais(-ā) ${name},`,
    },
    intro: {
      ru: 'Рады приветствовать вас в нашем сообществе профессионалов! Благодарим за доверие — ваша заявка рассмотрена и одобрена.',
      en: 'We are happy to welcome you to our community of professionals! Thank you for your trust — your application has been reviewed and approved.',
      lv: 'Priecājamies jūs uzņemt mūsu profesionāļu kopienā! Paldies par uzticību — jūsu pieteikums ir izskatīts un apstiprināts.',
    },
    cardLabel: {
      ru: 'Номер карты',
      en: 'Card number',
      lv: 'Kartes numurs',
    },
    stepsTitle: {
      ru: 'Как зарегистрироваться на сайте:',
      en: 'How to register on the website:',
      lv: 'Kā reģistrēties vietnē:',
    },
    steps: {
      ru: (card: string, pass: string, url: string) => [
        `Перейдите на <a href="${url}/auth/register" style="color:#4f46e5;text-decoration:none">${url}/auth/register</a>`,
        'Выберите вариант <strong>«Есть карта клиента»</strong>',
        `Введите номер карты: <strong style="font-family:monospace">${card}</strong>`,
        `Используйте начальный пароль: <strong style="font-family:monospace;background:#f3f4f6;padding:2px 6px;border-radius:4px">${pass}</strong>`,
        'После входа вы сможете изменить пароль в разделе <strong>«Профиль»</strong>. <strong>Смена пароля обязательна!</strong>',
      ],
      en: (card: string, pass: string, url: string) => [
        `Go to <a href="${url}/auth/register" style="color:#4f46e5;text-decoration:none">${url}/auth/register</a>`,
        'Select the option <strong>"I have a client card"</strong>',
        `Enter your card number: <strong style="font-family:monospace">${card}</strong>`,
        `Use the initial password: <strong style="font-family:monospace;background:#f3f4f6;padding:2px 6px;border-radius:4px">${pass}</strong>`,
        'After logging in, go to <strong>"Profile"</strong> to set your own password. <strong>Changing the password is required!</strong>',
      ],
      lv: (card: string, pass: string, url: string) => [
        `Dodieties uz <a href="${url}/auth/register" style="color:#4f46e5;text-decoration:none">${url}/auth/register</a>`,
        'Izvēlieties opciju <strong>"Man ir klienta karte"</strong>',
        `Ievadiet kartes numuru: <strong style="font-family:monospace">${card}</strong>`,
        `Izmantojiet sākotnējo paroli: <strong style="font-family:monospace;background:#f3f4f6;padding:2px 6px;border-radius:4px">${pass}</strong>`,
        'Pēc pieteikšanās dodieties uz <strong>"Profils"</strong>, lai iestatītu savu paroli. <strong>Paroles maiņa ir obligāta!</strong>',
      ],
    },
    help: {
      ru: 'Если возникнут вопросы — мы всегда готовы помочь:',
      en: 'If you have any questions, we are always ready to help:',
      lv: 'Ja jums rodas jautājumi — mēs vienmēr esam gatavi palīdzēt:',
    },
    regards: {
      ru: 'С уважением,<br><strong>Команда MiksPlus</strong>',
      en: 'Kind regards,<br><strong>MiksPlus Team</strong>',
      lv: 'Ar cieņu,<br><strong>MiksPlus komanda</strong>',
    },
  },
  rejection: {
    subject: {
      ru: 'О вашей заявке на карту клиента',
      en: 'About your client card application',
      lv: 'Par jūsu klienta kartes pieteikumu',
    },
    heading: {
      ru: 'О вашей заявке',
      en: 'About your application',
      lv: 'Par jūsu pieteikumu',
    },
    greeting: {
      ru: (name: string) => `Уважаемый(-ая) ${name},`,
      en: (name: string) => `Dear ${name},`,
      lv: (name: string) => `Cienījamais(-ā) ${name},`,
    },
    thanks: {
      ru: 'Благодарим за интерес к нашей компании и время, которое вы уделили для подачи заявки.',
      en: 'Thank you for your interest in our company and the time you took to submit your application.',
      lv: 'Paldies par interesi par mūsu uzņēmumu un laiku, ko veltījāt pieteikuma iesniegšanai.',
    },
    body: {
      ru: 'К сожалению, в настоящее время мы не можем выдать карту клиента по вашей заявке. Мы ценим ваш интерес и приносим свои извинения за возможные неудобства.',
      en: 'Unfortunately, we are currently unable to issue a client card for your application. We appreciate your interest and apologize for any inconvenience.',
      lv: 'Diemžēl šobrīd mēs nevaram izsniegt klienta karti jūsu pieteikumam. Mēs novērtējam jūsu interesi un atvainojamies par sagādātajām neērtībām.',
    },
    contact: {
      ru: 'Если вы хотите узнать подробности или у вас остались вопросы — пожалуйста, свяжитесь с нашим офисом:',
      en: 'If you would like to know more details or have any questions, please contact our office:',
      lv: 'Ja vēlaties uzzināt sīkāku informāciju vai jums ir kādi jautājumi — lūdzu, sazinieties ar mūsu biroju:',
    },
    noteLabel: {
      ru: 'Комментарий',
      en: 'Comment',
      lv: 'Komentārs',
    },
    regards: {
      ru: 'С уважением,<br><strong>Команда MiksPlus</strong>',
      en: 'Kind regards,<br><strong>MiksPlus Team</strong>',
      lv: 'Ar cieņu,<br><strong>MiksPlus komanda</strong>',
    },
  },
}

function buildApprovalEmail(name: string, cardNumber: string, lang: Lang): string {
  const safeName = escapeHtml(name)
  const safeCard = escapeHtml(cardNumber)
  const safePass = escapeHtml(FIRST_LOGIN_PASSWORD)
  const s = i18n.approval
  const steps = s.steps[lang](safeCard, safePass, SITE_URL)

  return `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a2e">
      <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px 24px;border-radius:12px 12px 0 0;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:24px;font-weight:700">${s.heading[lang]}</h1>
        <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:15px">${s.subheading[lang]}</p>
      </div>
      <div style="background:#ffffff;padding:32px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
        <p style="font-size:16px;margin-top:0">${s.greeting[lang](safeName)}</p>
        <p style="font-size:15px;line-height:1.7;color:#374151">${s.intro[lang]}</p>
        <div style="background:#f5f3ff;border:2px solid #7c3aed;border-radius:10px;padding:16px 24px;text-align:center;margin:24px 0">
          <p style="color:#5b21b6;font-size:12px;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.08em">${s.cardLabel[lang]}</p>
          <p style="color:#1a1a2e;font-size:36px;font-weight:700;margin:0;letter-spacing:0.15em;font-family:monospace">${safeCard}</p>
        </div>
        <p style="font-size:15px;font-weight:600;color:#1a1a2e;margin-bottom:8px">${s.stepsTitle[lang]}</p>
        <ol style="font-size:15px;line-height:1.9;color:#374151;padding-left:20px;margin:0 0 20px">
          ${steps.map(step => `<li>${step}</li>`).join('')}
        </ol>
        <p style="font-size:15px;line-height:1.7;color:#374151">${s.help[lang]}</p>
        <div style="background:#f9fafb;border-radius:8px;padding:14px 20px;margin:12px 0 24px;font-size:14px;color:#4b5563">
          <p style="margin:4px 0">📞 <a href="tel:+37127067730" style="color:#4f46e5;text-decoration:none">${OFFICE_PHONE}</a></p>
          <p style="margin:4px 0">✉️ <a href="mailto:${OFFICE_EMAIL}" style="color:#4f46e5;text-decoration:none">${OFFICE_EMAIL}</a></p>
        </div>
        <p style="font-size:15px;color:#374151;margin-bottom:0">${s.regards[lang]}</p>
      </div>
    </div>
  `
}

function buildRejectionEmail(name: string, lang: Lang, note?: string): string {
  const safeName = escapeHtml(name)
  const s = i18n.rejection
  const noteBlock = note
    ? `<div style="background:#fff7ed;border-left:3px solid #f97316;border-radius:4px;padding:12px 16px;margin:16px 0;font-size:14px;color:#9a3412;line-height:1.6">
        <p style="margin:0 0 4px;font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:#c2410c">${s.noteLabel[lang]}</p>
        <p style="margin:0">${escapeHtml(note)}</p>
       </div>`
    : ''

  return `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a2e">
      <div style="background:#f9fafb;padding:28px 24px;border-radius:12px 12px 0 0;text-align:center;border:1px solid #e5e7eb;border-bottom:none">
        <h1 style="color:#374151;margin:0;font-size:22px;font-weight:600">${s.heading[lang]}</h1>
      </div>
      <div style="background:#ffffff;padding:32px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
        <p style="font-size:16px;margin-top:0">${s.greeting[lang](safeName)}</p>
        <p style="font-size:15px;line-height:1.7;color:#374151">${s.thanks[lang]}</p>
        <p style="font-size:15px;line-height:1.7;color:#374151">${s.body[lang]}</p>
        ${noteBlock}
        <p style="font-size:15px;line-height:1.7;color:#374151">${s.contact[lang]}</p>
        <div style="background:#f9fafb;border-radius:8px;padding:14px 20px;margin:12px 0 24px;font-size:14px;color:#4b5563">
          <p style="margin:4px 0">📞 <a href="tel:+37127067730" style="color:#4f46e5;text-decoration:none">${OFFICE_PHONE}</a></p>
          <p style="margin:4px 0">✉️ <a href="mailto:${OFFICE_EMAIL}" style="color:#4f46e5;text-decoration:none">${OFFICE_EMAIL}</a></p>
        </div>
        <p style="font-size:15px;color:#374151;margin-bottom:0">${s.regards[lang]}</p>
      </div>
    </div>
  `
}

type ApprovePayload = { action: 'approve'; email: string; name: string; cardNumber: string; language?: Lang }
type RejectPayload = { action: 'reject'; email: string; name: string; note?: string; language?: Lang }
type Payload = ApprovePayload | RejectPayload

export async function POST(request: NextRequest): Promise<NextResponse> {
  let payload: Payload
  try {
    payload = (await request.json()) as Payload
  } catch {
    return NextResponse.json({ ok: false, code: 'invalid_json' }, { status: 400 })
  }

  const { action, email, name } = payload
  if (!action || !email || !name) {
    return NextResponse.json({ ok: false, code: 'missing_fields' }, { status: 422 })
  }

  const lang: Lang = payload.language ?? 'ru'

  try {
    if (action === 'approve') {
      const { cardNumber } = payload as ApprovePayload
      if (!cardNumber) return NextResponse.json({ ok: false, code: 'missing_card' }, { status: 422 })

      await sendEmail(
        email,
        i18n.approval.subject[lang],
        buildApprovalEmail(name, cardNumber, lang)
      )
    } else if (action === 'reject') {
      const { note } = payload as RejectPayload
      await sendEmail(
        email,
        i18n.rejection.subject[lang],
        buildRejectionEmail(name, lang, note)
      )
    } else {
      return NextResponse.json({ ok: false, code: 'unknown_action' }, { status: 400 })
    }
  } catch (err) {
    console.error('[card-request] sendEmail error:', err)
    return NextResponse.json({ ok: false, code: 'email_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
