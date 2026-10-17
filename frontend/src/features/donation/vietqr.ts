// Static NAPAS 247 account transfer payload. All encoding happens locally.
// The account comes from the bank QR reference supplied by the site author.
export const donationAccount = {
  bankBin: '970415',
  bankName: 'VietinBank',
  accountNumber: '104879603721',
  accountName: 'NGUYEN TIEN MINH',
} as const

function field(id: string, value: string) {
  return id + value.length.toString().padStart(2, '0') + value
}

export function crc16(value: string): string {
  let crc = 0xffff
  for (const byte of new TextEncoder().encode(value)) {
    crc ^= byte << 8
    for (let bit = 0; bit < 8; bit++)
      crc = ((crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

export function accountTransferPayload(bankBin: string, accountNumber: string) {
  const beneficiary = field('00', bankBin) + field('01', accountNumber)
  const merchant =
    field('00', 'A000000727') +
    field('01', beneficiary) +
    field('02', 'QRIBFTTA')
  const payload =
    field('00', '01') +
    field('01', '11') +
    field('38', merchant) +
    field('53', '704') +
    field('58', 'VN') +
    '6304'
  return payload + crc16(payload)
}

export const donationPayload = accountTransferPayload(
  donationAccount.bankBin,
  donationAccount.accountNumber,
)
