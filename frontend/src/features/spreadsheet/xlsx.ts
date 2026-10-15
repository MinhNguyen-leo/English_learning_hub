import { read, write, utils, type CellObject } from 'xlsx'
import {
  emptyInput,
  fieldNames,
  fields,
  validate,
  VocabularyError,
  type Field,
  type VocabularyInput,
} from '../vocabulary/model'
import { MAX_IMPORT_ROWS } from '../vocabulary/importPlan'

export const MAX_FILE_BYTES = 5 * 1024 * 1024
export const MAX_COLUMNS = 64
const MAX_EXPANDED_BYTES = 32 * 1024 * 1024
export interface ImportCell {
  text: string
  error: string
}
export interface ParsedSheet {
  name: string
  headers: string[]
  rows: { rowNumber: number; cells: ImportCell[] }[]
  warnings: string[]
}
export type ColumnMapping = Record<Field, number | null>
export interface PreviewRow {
  rowNumber: number
  input: VocabularyInput
  errors: string[]
}

// Check ZIP directory bounds before the XLSX parser expands uploaded content.
function checkArchive(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 22 || view.getUint32(0, true) !== 0x04034b50)
    throw new VocabularyError(
      'Upload a valid XLSX workbook, not CSV, XLS or an encrypted file.',
    )
  let end = bytes.length - 22
  while (
    end >= Math.max(0, bytes.length - 65557) &&
    view.getUint32(end, true) !== 0x06054b50
  )
    end--
  if (end < Math.max(0, bytes.length - 65557))
    throw new VocabularyError('The XLSX archive is damaged.')
  const count = view.getUint16(end + 10, true)
  let offset = view.getUint32(end + 16, true),
    expanded = 0
  if (
    count > 512 ||
    view.getUint16(end + 4, true) ||
    view.getUint16(end + 6, true)
  )
    throw new VocabularyError(
      'This workbook archive is too complex or unsupported.',
    )
  const names: string[] = []
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50)
      throw new VocabularyError('The XLSX archive is damaged.')
    expanded += view.getUint32(offset + 24, true)
    if (expanded > MAX_EXPANDED_BYTES)
      throw new VocabularyError(
        'The expanded workbook exceeds the 32 MiB limit.',
      )
    if (view.getUint16(offset + 8, true) & 1)
      throw new VocabularyError('Encrypted workbooks are not supported.')
    const length = view.getUint16(offset + 28, true)
    const next =
      offset +
      46 +
      length +
      view.getUint16(offset + 30, true) +
      view.getUint16(offset + 32, true)
    if (next > end) throw new VocabularyError('The XLSX archive is damaged.')
    names.push(
      new TextDecoder().decode(
        bytes.subarray(offset + 46, offset + 46 + length),
      ),
    )
    offset = next
  }
  if (
    !names.includes('[Content_Types].xml') ||
    !names.includes('xl/workbook.xml')
  )
    throw new VocabularyError('This file is not an XLSX workbook.')
  if (names.some((name) => /vba|macrosheet|activex/i.test(name)))
    throw new VocabularyError(
      'Macro-enabled workbooks are not supported. Save a macro-free XLSX copy.',
    )
}
function cellValue(cell: CellObject | undefined): ImportCell {
  if (!cell) return { text: '', error: '' }
  if (cell.f !== undefined || cell.F !== undefined)
    return {
      text: '',
      error: 'Formulas are not allowed; paste values as text.',
    }
  if (cell.t === 'z' || cell.v === undefined || cell.v === null)
    return { text: '', error: '' }
  if (cell.t !== 's' || typeof cell.v !== 'string')
    return {
      text: '',
      error:
        'Expected a text cell (numbers, dates, booleans and errors are not accepted).',
    }
  return { text: cell.v, error: '' }
}
export function parseXlsx(bytes: Uint8Array, filename: string): ParsedSheet {
  if (!/\.xlsx$/i.test(filename))
    throw new VocabularyError('Choose an .xlsx file.')
  if (bytes.byteLength > MAX_FILE_BYTES)
    throw new VocabularyError('File exceeds the 5 MiB limit.')
  try {
    checkArchive(bytes)
    const workbook = read(bytes, {
      type: 'array',
      sheets: 0,
      cellFormula: true,
      cellHTML: false,
      cellText: false,
      cellDates: true,
      bookVBA: true,
    })
    if (workbook.vbaraw || workbook.bookType !== 'xlsx')
      throw new VocabularyError('Only macro-free XLSX workbooks are supported.')
    const name = workbook.SheetNames[0]
    const sheet = name ? workbook.Sheets[name] : undefined
    if (!name || !sheet || !sheet['!ref'])
      throw new VocabularyError(
        'The first worksheet is empty. Add column headers in row 1.',
      )
    const range = utils.decode_range(sheet['!fullref'] ?? sheet['!ref'])
    // Some user-created files understate their dimension. Inspect actual cells as well,
    // and parse without sheetRows so data beyond a false dimension is never lost.
    for (const address of Object.keys(sheet)) {
      if (!/^[A-Z]+[1-9][0-9]*$/.test(address)) continue
      const cell = utils.decode_cell(address)
      range.e.r = Math.max(range.e.r, cell.r)
      range.e.c = Math.max(range.e.c, cell.c)
    }
    // Physical row limit includes blank rows after the header; never silently truncate.
    if (range.e.r > MAX_IMPORT_ROWS)
      throw new VocabularyError(
        `The first worksheet exceeds ${MAX_IMPORT_ROWS} data rows (including blank rows).`,
      )
    if (range.e.c >= MAX_COLUMNS)
      throw new VocabularyError(
        `The first worksheet exceeds ${MAX_COLUMNS} columns.`,
      )
    const headers = Array.from({ length: range.e.c + 1 }, (_, c) => {
      const cell = cellValue(
        sheet[utils.encode_cell({ r: 0, c })] as CellObject | undefined,
      )
      if (cell.error)
        throw new VocabularyError(
          `Header ${utils.encode_col(c)}: ${cell.error}`,
        )
      return cell.text.trim()
    })
    if (!headers.some(Boolean))
      throw new VocabularyError('Add column headers in row 1.')
    const rows: ParsedSheet['rows'] = []
    for (let r = 1; r <= range.e.r; r++) {
      const cells = headers.map((_, c) =>
        cellValue(sheet[utils.encode_cell({ r, c })] as CellObject | undefined),
      )
      if (cells.some((cell) => cell.text.trim() || cell.error))
        rows.push({ rowNumber: r + 1, cells })
    }
    return {
      name,
      headers,
      rows,
      warnings:
        workbook.SheetNames.length > 1
          ? [
              'Only the first worksheet is imported; other worksheets are ignored.',
            ]
          : [],
    }
  } catch (error) {
    if (error instanceof VocabularyError) throw error
    throw new VocabularyError(
      'Could not read this XLSX workbook. It may be malformed, damaged or unsupported.',
      { cause: error },
    )
  }
}
export function autoMapping(headers: string[]): ColumnMapping {
  const normalized = headers.map((header) =>
    header
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_'),
  )
  return Object.fromEntries(
    fieldNames.map((field) => {
      const matches = normalized.flatMap((header, index) =>
        header === field ? [index] : [],
      )
      return [field, matches.length === 1 ? matches[0] : null]
    }),
  ) as ColumnMapping
}
export function mappingErrors(
  mapping: ColumnMapping,
  columns: number,
): string[] {
  const errors: string[] = []
  if (mapping.word === null) errors.push('Map the Word column.')
  if (mapping.english_meaning === null && mapping.vietnamese_meaning === null)
    errors.push('Map at least one English or Vietnamese meaning column.')
  const used = new Set<number>()
  for (const key of fieldNames) {
    const index = mapping[key]
    if (index === null) continue
    if (!Number.isInteger(index) || index < 0 || index >= columns)
      errors.push(`Invalid column for ${fields[key].label}.`)
    if (used.has(index))
      errors.push('Each source column may be mapped only once.')
    used.add(index)
  }
  return errors
}
export function previewRows(
  sheet: ParsedSheet,
  mapping: ColumnMapping,
): PreviewRow[] {
  const issues = mappingErrors(mapping, sheet.headers.length)
  if (issues.length) throw new VocabularyError(issues.join(' '))
  return sheet.rows.map((row) => {
    const input = { ...emptyInput },
      errors: string[] = []
    for (const key of fieldNames) {
      const index = mapping[key]
      if (index !== null) input[key] = row.cells[index]?.text ?? ''
    }
    // Reject formulas/type errors even in ignored columns rather than accepting cached values.
    row.cells.forEach((cell, index) => {
      if (cell.error)
        errors.push(`Column ${utils.encode_col(index)}: ${cell.error}`)
    })
    try {
      return { rowNumber: row.rowNumber, input: validate(input), errors }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Invalid row.')
      return { rowNumber: row.rowNumber, input, errors }
    }
  })
}
export function exportXlsx(rows: VocabularyInput[]): Uint8Array<ArrayBuffer> {
  const sheet = utils.aoa_to_sheet([fieldNames])
  rows.forEach((row, r) =>
    fieldNames.forEach((key, c) => {
      // Explicit string cells, no formula or hyperlink properties: leading =,+,-,@ remain literal text.
      sheet[utils.encode_cell({ r: r + 1, c })] = {
        t: 's',
        v: row[key],
        z: '@',
      }
    }),
  )
  sheet['!ref'] = utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: rows.length, c: fieldNames.length - 1 },
  })
  sheet['!cols'] = fieldNames.map((key) => ({
    wch: key === 'word' || key === 'part_of_speech' ? 22 : 42,
  }))
  sheet['!autofilter'] = { ref: sheet['!ref'] }
  const workbook = utils.book_new()
  utils.book_append_sheet(workbook, sheet, 'Vocabulary')
  const buffer: ArrayBuffer = write(workbook, {
    bookType: 'xlsx',
    type: 'array',
    compression: true,
  })
  return new Uint8Array(buffer)
}
