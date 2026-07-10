/**
 * Read-only: какие email-шаблоны лежат в KV Neon и целы ли плейсхолдеры
 * для инвайт-рассылки держателям карт.
 *
 * Usage: npx tsx scripts/check-invite-templates.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { prisma } = await import('../lib/prisma')
  const row = await prisma.keyValueSetting.findUnique({ where: { key: 'email-templates' } })
  if (!row) {
    console.log('KV "email-templates" отсутствует — используется файл data/email-templates.json')
    return
  }
  const templates = (row.value as { templates?: { id: string; subject: string; body: string; variables?: string[] }[] })?.templates ?? []
  console.log(`KV существует, шаблонов: ${templates.length}`)
  console.log('IDs:', templates.map((t) => t.id).join(', '))

  for (const id of ['pro-invite-ru', 'pro-invite-en', 'pro-invite-lv', 'card-rules-ru', 'card-rules-en', 'card-rules-lv']) {
    const t = templates.find((x) => x.id === id)
    if (!t) {
      console.log(`\n${id}: НЕТ в KV → код возьмёт встроенный дефолт`)
      continue
    }
    console.log(`\n${id}: есть`)
    console.log('  subject:', JSON.stringify(t.subject))
    for (const ph of ['invite_link', 'card_number', 'name', 'site_url']) {
      const inBody = t.body.includes(`{{${ph}}}`)
      const inSubj = t.subject.includes(`{{${ph}}}`)
      if (inBody || inSubj) console.log(`  {{${ph}}}: body=${inBody} subject=${inSubj}`)
    }
    if (id.startsWith('pro-invite') && !t.body.includes('{{invite_link}}')) {
      console.log('  !!! НЕТ {{invite_link}} в body — письмо уйдёт без ссылки активации')
    }
    console.log('  body первые 300 симв.:', JSON.stringify(t.body.slice(0, 300)))
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
