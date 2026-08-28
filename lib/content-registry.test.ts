import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { translations } from '@/data/translations'
import { CONTENT_REGISTRY } from './content-registry'

const LANGUAGES = ['ru', 'en', 'lv'] as const

describe('CONTENT_REGISTRY validity', () => {
  it('has at least the 7 sections from the spec', () => {
    expect(CONTENT_REGISTRY.length).toBeGreaterThanOrEqual(7)
  })

  it('every text entry key exists in all three languages', () => {
    for (const section of CONTENT_REGISTRY) {
      for (const entry of section.entries) {
        if (entry.type !== 'text') continue
        for (const lang of LANGUAGES) {
          expect(
            entry.defaults?.[lang] ?? translations[lang][entry.key],
            `key "${entry.key}" (section "${section.id}") missing in "${lang}"`
          ).toBeTruthy()
        }
      }
    }
  })

  it('every image entry src is a local path pointing at an existing file in public/', () => {
    for (const section of CONTENT_REGISTRY) {
      for (const entry of section.entries) {
        if (entry.type !== 'image') continue
        expect(entry.src.startsWith('/'), `src "${entry.src}" must start with /`).toBe(true)
        const filePath = path.join(process.cwd(), 'public', entry.src)
        expect(
          fs.existsSync(filePath),
          `file for src "${entry.src}" (section "${section.id}") not found at ${filePath}`
        ).toBe(true)
      }
    }
  })

  it('section ids, text keys, and image srcs are unique across the registry', () => {
    const ids = CONTENT_REGISTRY.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)

    const keys = CONTENT_REGISTRY.flatMap((s) =>
      s.entries.filter((e) => e.type === 'text').map((e) => (e as { key: string }).key)
    )
    expect(new Set(keys).size).toBe(keys.length)

    const srcs = CONTENT_REGISTRY.flatMap((s) =>
      s.entries.filter((e) => e.type === 'image').map((e) => (e as { src: string }).src)
    )
    expect(new Set(srcs).size).toBe(srcs.length)
  })

  it('every entry has a non-empty Russian label', () => {
    for (const section of CONTENT_REGISTRY) {
      expect(section.title.trim()).not.toBe('')
      for (const entry of section.entries) {
        expect(entry.label.trim(), `entry in "${section.id}"`).not.toBe('')
      }
    }
  })
})
