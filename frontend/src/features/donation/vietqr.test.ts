import { expect, it } from 'vitest'
import {
  accountTransferPayload,
  crc16,
  donationAccount,
  donationPayload,
} from './vietqr'

it('matches the CRC-16/CCITT-FALSE reference vector', () => {
  expect(crc16('123456789')).toBe('29B1')
})

function decodeFields(payload: string) {
  const result = new Map<string, string>()
  for (let offset = 0; offset < payload.length;) {
    const id = payload.slice(offset, offset + 2)
    const length = Number(payload.slice(offset + 2, offset + 4))
    expect(Number.isInteger(length)).toBe(true)
    expect(length).toBeGreaterThan(0)
    const value = payload.slice(offset + 4, offset + 4 + length)
    expect(value.length).toBe(length)
    result.set(id, value)
    offset += length + 4
  }
  return result
}

it('encodes the supplied beneficiary as an open-amount static NAPAS account transfer', () => {
  const root = decodeFields(donationPayload)
  expect(root.get('00')).toBe('01')
  expect(root.get('01')).toBe('11')
  expect(root.get('53')).toBe('704')
  expect(root.get('58')).toBe('VN')
  expect(root.has('54')).toBe(false)
  const merchant = decodeFields(root.get('38')!)
  expect(merchant.get('00')).toBe('A000000727')
  expect(merchant.get('02')).toBe('QRIBFTTA')
  const beneficiary = decodeFields(merchant.get('01')!)
  expect(beneficiary.get('00')).toBe('970415')
  expect(beneficiary.get('01')).toBe('104879603721')
  expect(root.get('63')).toBe(crc16(donationPayload.slice(0, -4)))
  expect(
    accountTransferPayload(
      donationAccount.bankBin,
      donationAccount.accountNumber,
    ),
  ).toBe(donationPayload)
})
