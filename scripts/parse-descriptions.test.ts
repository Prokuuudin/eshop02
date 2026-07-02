import { describe, expect, it } from 'vitest'
import { parseDescription, splitSentences } from './parse-descriptions'

describe('splitSentences', () => {
  it('splits on sentence terminators followed by an uppercase/digit start', () => {
    expect(splitSentences('Дозировка 1.5 мл на литр воды. Хранить в тёмном месте.')).toEqual([
      'Дозировка 1.5 мл на литр воды.',
      'Хранить в тёмном месте.',
    ])
  })

  it('does not split after dotted abbreviations or single-letter initials', () => {
    expect(
      splitSentences('Содержит витамины A и E и т.д. Также питает кожу головы.')
    ).toHaveLength(1)
  })

  it('keeps numbered list markers attached to their sentence', () => {
    expect(
      splitSentences('Способ применения. 1. Нанесите средство на волосы. 2. Смойте тёплой водой.')
    ).toEqual([
      'Способ применения.',
      '1. Нанесите средство на волосы.',
      '2. Смойте тёплой водой.',
    ])
  })

  it('treats newlines as hard boundaries', () => {
    expect(splitSentences('Первая строка без точки\nВторая строка.')).toEqual([
      'Первая строка без точки',
      'Вторая строка.',
    ])
  })
})

describe('parseDescription', () => {
  it('preserves paragraph breaks from block-level HTML', () => {
    const result = parseDescription('<p>Первый абзац.</p><p>Второй абзац.</p>')
    expect(result.description).toBe('Первый абзац.\n\nВторой абзац.')
    expect(result.features).toEqual([])
  })

  it('decodes HTML entities', () => {
    const result = parseDescription('<p>Matu &scaron;ampūns. Der visiem matu tipiem.</p>')
    expect(result.description).toBe('Matu šampūns. Der visiem matu tipiem.')
  })

  it('still extracts bold-labelled sections as features (flattened to one line)', () => {
    const result = parseDescription(
      '<p>Интро текст.</p><p><strong>Lietošana:</strong> наносить на влажные волосы.</p>'
    )
    expect(result.description).toBe('Интро текст.')
    expect(result.features).toEqual(['Lietošana: наносить на влажные волосы.'])
  })

  it('still routes ingredients to technicalSpecs', () => {
    const result = parseDescription(
      '<p>Крем для рук.</p><p><strong>Состав:</strong> aqua, glycerin, parfum</p>'
    )
    expect(result.description).toBe('Крем для рук.')
    expect(result.technicalSpecs).toEqual({ 'Состав': 'aqua, glycerin, parfum' })
    expect(result.features).toEqual([])
  })

  it('sentence-splits label-less text: 2 sentences to description, rest to max 4 features', () => {
    const result = parseDescription(
      '<p>Шампунь мягко очищает волосы. Подходит для ежедневного применения. ' +
        'Укрепляет корни. Придает блеск. Защищает цвет. Облегчает расчесывание. ' +
        'Не содержит сульфатов.</p>'
    )
    expect(result.description).toBe(
      'Шампунь мягко очищает волосы. Подходит для ежедневного применения.'
    )
    expect(result.features).toEqual([
      'Укрепляет корни.',
      'Придает блеск.',
      'Защищает цвет.',
      'Облегчает расчесывание. Не содержит сульфатов.',
    ])
  })

  it('leaves short label-less text (<= 2 sentences) intact without features', () => {
    const result = parseDescription('<p>Первое предложение. Второе предложение.</p>')
    expect(result.description).toBe('Первое предложение. Второе предложение.')
    expect(result.features).toEqual([])
  })

  it('does not sentence-split when labelled features already exist', () => {
    const result = parseDescription(
      '<p>Одно. Два. Три. Четыре.</p><p><strong>Lietošana:</strong> наносить.</p>'
    )
    expect(result.description).toBe('Одно. Два. Три. Четыре.')
    expect(result.features).toEqual(['Lietošana: наносить.'])
  })
})
