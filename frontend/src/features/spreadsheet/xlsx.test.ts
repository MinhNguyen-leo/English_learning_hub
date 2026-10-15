import { describe, expect, it } from 'vitest'
import { read, utils, write, type WorkBook, type WorkSheet } from 'xlsx'
import { emptyInput, fieldNames } from '../vocabulary/model'
import {
  autoMapping,
  exportXlsx,
  MAX_FILE_BYTES,
  mappingErrors,
  parseXlsx,
  previewRows,
} from './xlsx'

function bytes(
  sheet: WorkSheet,
  extras?: (book: WorkBook) => void,
): Uint8Array<ArrayBuffer> {
  const book = utils.book_new()
  utils.book_append_sheet(book, sheet, 'Words')
  extras?.(book)
  return new Uint8Array(
    write(book, {
      type: 'array',
      bookType: book.vbaraw ? 'xlsm' : 'xlsx',
      compression: true,
    }) as ArrayBuffer,
  )
}
function rows(data: unknown[][]) {
  return bytes(utils.aoa_to_sheet(data))
}
describe('XLSX input boundaries', () => {
  it('detects data beyond a falsely shortened worksheet dimension', () => {
    const sheet = utils.aoa_to_sheet([['word', 'english_meaning']])
    sheet.A5002 = { t: 's', v: 'hidden late row' }
    sheet['!ref'] = 'A1:B5002'
    const book = utils.book_new()
    utils.book_append_sheet(book, sheet, 'Words')
    const data = new Uint8Array(
      write(book, {
        type: 'array',
        bookType: 'xlsx',
        compression: false,
      }) as ArrayBuffer,
    )
    const dimension = new TextEncoder().encode('<dimension ref="A1:B5002"')
    const at = data.findIndex((_, index) =>
      dimension.every((byte, offset) => data[index + offset] === byte),
    )
    expect(at).toBeGreaterThan(0)
    data.set(new TextEncoder().encode('<dimension ref="A1:B0001"'), at)
    expect(() => parseXlsx(data, 'false-dimension.xlsx')).toThrow('5000')
  })
  it('generates a blank downloadable-compatible workbook with all headers and no data', () => {
    const sheet = parseXlsx(exportXlsx([]), 'template.xlsx')
    expect(sheet.headers).toEqual(fieldNames)
    expect(sheet.rows).toEqual([])
  })
  it('preserves Vietnamese and every optional field through export and import', () => {
    const input = {
      word: 'hello',
      english_meaning: 'a greeting',
      vietnamese_meaning: 'xin chào',
      part_of_speech: 'thán từ',
      synonyms: 'hi, chào',
      antonyms: 'tạm biệt',
      example_sentence: 'Xin chào bạn!',
      note: 'Tiếng Việt: ă â đ ê ô ơ ư',
    }
    const sheet = parseXlsx(exportXlsx([input]), 'words.xlsx')
    expect(previewRows(sheet, autoMapping(sheet.headers))).toEqual([
      { rowNumber: 2, input, errors: [] },
    ])
  })
  it.each([
    '=HYPERLINK("https://example.com","click")',
    '+SUM(1,2)',
    '-1+2',
    '@SUM(1,2)',
    '\t=1+1',
    '\r=1+1',
  ])(
    'exports %s as a literal string without formula or hyperlink metadata',
    (text) => {
      const book = read(
        exportXlsx([{ ...emptyInput, word: text, english_meaning: text }]),
        { type: 'array', cellFormula: true },
      )
      const sheet = book.Sheets[book.SheetNames[0]!]
      expect(sheet?.A2).toMatchObject({ t: 's', v: text })
      expect(sheet?.A2.f).toBeUndefined()
      expect(sheet?.A2.l).toBeUndefined()
      expect(sheet?.B2.f).toBeUndefined()
    },
  )
  it.each([
    new Uint8Array(),
    new TextEncoder().encode('word,meaning\nhello,hi'),
    new Uint8Array([
      80, 75, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]),
  ])('rejects malformed and renamed non-XLSX uploads', (data) => {
    expect(() => parseXlsx(data, 'broken.xlsx')).toThrow()
  })
  it('rejects wrong extensions and oversized files before parsing', () => {
    expect(() => parseXlsx(exportXlsx([]), 'words.xlsm')).toThrow('.xlsx')
    expect(() =>
      parseXlsx(new Uint8Array(MAX_FILE_BYTES + 1), 'large.xlsx'),
    ).toThrow('5 MiB')
  })
  it('rejects over-limit physical row ranges and excessive columns without silently truncating', () => {
    const sheet = utils.aoa_to_sheet([['word', 'english_meaning']])
    sheet.A5002 = { t: 's', v: 'last' }
    sheet['!ref'] = 'A1:B5002'
    expect(() => parseXlsx(bytes(sheet), 'words.xlsx')).toThrow('5000')
    expect(() =>
      parseXlsx(
        rows([Array.from({ length: 65 }, () => 'header')]),
        'wide.xlsx',
      ),
    ).toThrow('64 columns')
  })
  it('accepts exactly 5000 data rows', () => {
    const sheet = utils.aoa_to_sheet([['word', 'english_meaning']])
    sheet.A5001 = { t: 's', v: 'last' }
    sheet.B5001 = { t: 's', v: 'meaning' }
    sheet['!ref'] = 'A1:B5001'
    expect(parseXlsx(bytes(sheet), 'words.xlsx').rows[0]?.rowNumber).toBe(5001)
  })
  it('rejects macro-enabled workbooks even when renamed .xlsx', () => {
    const data = bytes(utils.aoa_to_sheet([['word']]), (book) => {
      book.vbaraw = new Uint8Array([1, 2, 3])
    })
    expect(() => parseXlsx(data, 'disguised.xlsx')).toThrow(/macro/i)
  })
  it('reports formula cells including cached results and formulas in ignored columns as invalid', () => {
    const sheet = utils.aoa_to_sheet([
      ['word', 'english_meaning', 'unknown'],
      ['hello', 'greeting', ''],
    ])
    sheet.C2 = {
      t: 's',
      v: 'cached',
      f: 'HYPERLINK("https://example.com","cached")',
    }
    const parsed = parseXlsx(bytes(sheet), 'formulas.xlsx')
    const preview = previewRows(parsed, autoMapping(parsed.headers))
    expect(preview[0]?.errors.join(' ')).toContain('Formulas are not allowed')
    expect(preview[0]?.input.note).toBe('')
  })
  it('rejects formulas in headers', () => {
    const sheet = utils.aoa_to_sheet([['word', 'english_meaning']])
    sheet.A1 = { t: 's', v: 'word', f: '"word"' }
    expect(() => parseXlsx(bytes(sheet), 'header.xlsx')).toThrow('Formulas')
  })
  it('uses only the first sheet with a warning and preserves original row numbers', () => {
    const data = bytes(
      utils.aoa_to_sheet([
        ['word', 'english_meaning'],
        [],
        ['hello', 'greeting'],
      ]),
      (book) =>
        utils.book_append_sheet(
          book,
          utils.aoa_to_sheet([['ignored']]),
          'Second',
        ),
    )
    const sheet = parseXlsx(data, 'multiple.xlsx')
    expect(sheet.warnings).toHaveLength(1)
    expect(sheet.rows.map((row) => row.rowNumber)).toEqual([3])
  })
  it('reports invalid required fields and numeric/date/boolean/error cells', () => {
    const sheet = utils.aoa_to_sheet([
      ['word', 'english_meaning'],
      ['', 'missing word'],
      ['number', 42],
      ['boolean', true],
      ['date', new Date('2026-01-01')],
    ])
    sheet.A6 = { t: 's', v: 'error' }
    sheet.B6 = { t: 'e', v: 7 }
    sheet['!ref'] = 'A1:B6'
    const parsed = parseXlsx(bytes(sheet), 'types.xlsx')
    const preview = previewRows(parsed, autoMapping(parsed.headers))
    expect(preview).toHaveLength(5)
    expect(preview.every((row) => row.errors.length)).toBe(true)
    expect(preview[0]?.errors.join(' ')).toContain('Word is required')
  })
})
describe('column mapping', () => {
  it('automatically maps normalized canonical headers', () => {
    const mapping = autoMapping([
      ' WORD ',
      'English Meaning',
      'Vietnamese-Meaning',
    ])
    expect(mapping.word).toBe(0)
    expect(mapping.english_meaning).toBe(1)
    expect(mapping.vietnamese_meaning).toBe(2)
  })
  it('supports custom headers, optional missing columns and Vietnamese-only meanings', () => {
    const sheet = parseXlsx(
      rows([
        ['Từ', 'Nghĩa'],
        ['hello', 'xin chào'],
      ]),
      'custom.xlsx',
    )
    const mapping = {
      ...autoMapping(sheet.headers),
      word: 0,
      vietnamese_meaning: 1,
    }
    expect(previewRows(sheet, mapping)[0]?.input).toEqual({
      ...emptyInput,
      word: 'hello',
      vietnamese_meaning: 'xin chào',
    })
  })
  it('blocks missing required mappings and duplicate source selections', () => {
    const mapping = autoMapping(['word', 'note'])
    expect(mappingErrors(mapping, 2).join(' ')).toContain('meaning')
    expect(() =>
      previewRows(
        parseXlsx(
          rows([
            ['word', 'note'],
            ['hello', 'note'],
          ]),
          'missing.xlsx',
        ),
        mapping,
      ),
    ).toThrow('meaning')
    expect(
      mappingErrors({ ...mapping, english_meaning: 0 }, 2).join(' '),
    ).toContain('only once')
  })
  it('leaves repeated headers unmapped for explicit column selection', () => {
    expect(autoMapping(['word', 'word', 'english_meaning']).word).toBeNull()
  })
})
