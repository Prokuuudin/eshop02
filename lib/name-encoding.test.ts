import { describe, expect, it } from 'vitest'
import { classifyNameEncoding, reinterpretCp1251AsCp1257, resolveImportedClientName } from './name-encoding'

// Synthetic names only; damaged forms are the exact cp1257 → cp1251 misreading.
describe('classifyNameEncoding', () => {
  it.each([
    ['Testa Bзrziтa', 'Testa Bērziņa'],
    ['Jвnis Kalniтр 00000000', 'Jānis Kalniņš 00000000'],
    ['Ilze  Мзrнe', 'Ilze  Ģērķe'],
    ['Юanete Ozola', 'Žanete Ozola'],
    ['Ilze Meпнe', 'Ilze Meļķe'],
    ['Lоga рmite 00000001', 'Līga šmite 00000001'],
    ['ANNA ВBOLIТA 00000002', 'ANNA ĀBOLIŅA 00000002'],
    ['SIA KALNIТI', 'SIA KALNIŅI'],
  ])('repairs %j to %j', (input, expected) => {
    expect(classifyNameEncoding(input)).toEqual({ kind: 'repairable', repaired: expected })
  })

  it.each(['Testa Bērziņa', 'Anna Ozola', ''])('leaves %j clean', (input) => {
    expect(classifyNameEncoding(input)).toEqual({ kind: 'clean' })
  })

  it.each(['Анна Петрова', 'елена иванова', 'Ivan Петров', 'TestUser Пётр Сидоров'])(
    'keeps genuine Cyrillic %j untouched',
    (input) => {
      expect(classifyNameEncoding(input)).toEqual({ kind: 'cyrillic' })
    },
  )

  it.each([
    ['Liene Пukova', 'ambiguous-ļ-or-ž', 'Liene Ļukova'],
    ['Пuba Ozola', 'ambiguous-ļ-or-ž', 'Ļuba Ozola'],
    ['Anna OzoliСa', 'non-latvian-letter', 'Anna OzoliŃa'],
    ['Test Jдrve OЬ', 'non-latvian-letter', 'Test Järve OÜ'],
    ['Anna Ozoљa', 'undecodable', null],
    ['IK ґ\'TEST\'ґ', 'undecodable', null],
    ['Anna Kalniтa Иванова', 'mixed-cyrillic-words', null],
  ])('flags %j for manual review (%s)', (input, reason, proposed) => {
    expect(classifyNameEncoding(input)).toEqual({ kind: 'suspicious', reason, proposed })
  })

  it('flags a Latvian capital in the middle of a lowercase word', () => {
    expect(classifyNameEncoding('Anna Kalniтa BeрТna')).toMatchObject({ kind: 'suspicious', reason: 'mid-word-capital' })
  })

  it('repairs lowercase "п" — only the capital П is ambiguous with cp775', () => {
    expect(classifyNameEncoding('Jeпena Ozola')).toEqual({ kind: 'repairable', repaired: 'Jeļena Ozola' })
  })
})

describe('resolveImportedClientName', () => {
  it('repairs unambiguous damage', () => {
    expect(resolveImportedClientName('Testa Bзrziтa')).toEqual({ ok: true, name: 'Testa Bērziņa', repaired: true })
  })

  it.each(['Testa Bērziņa', 'Анна Петрова', 'Ivan Петров'])('keeps %j as is', (input) => {
    expect(resolveImportedClientName(input)).toEqual({ ok: true, name: input, repaired: false })
  })

  it.each([
    ['Пuba Ozola', 'ambiguous-ļ-or-ž'],
    ['Anna OzoliСa', 'non-latvian-letter'],
    ['Anna Ozoљa', 'undecodable'],
  ])('rejects %j (%s)', (input, reason) => {
    expect(resolveImportedClientName(input)).toEqual({ ok: false, reason })
  })
})

describe('reinterpretCp1251AsCp1257', () => {
  it('maps every damaged Latvian letter back and keeps ASCII untouched', () => {
    expect(reinterpretCp1251AsCp1257('вимзонпртыюВИМЗОНПРТЫЮ abc-1')).toBe('āčģēīķļšņūžĀČĢĒĪĶĻŠŅŪŽ abc-1')
  })
})
