import { QRCodeSVG } from 'qrcode.react'
import { useUiText } from '../../lib/useUiText'
import { donationAccount, donationPayload } from './vietqr'
import './donation.css'

export function DonationQr({ compact = false }: { compact?: boolean }) {
  const t = useUiText()
  const qr = (
    <figure className="donation-qr">
      <QRCodeSVG
        value={donationPayload}
        size={240}
        level="M"
        marginSize={4}
        role="img"
        aria-label={t('Donation QR for NGUYEN TIEN MINH at VietinBank')}
      />
      <figcaption>
        <strong>{donationAccount.accountName}</strong>
        <span>{donationAccount.bankName}</span>
      </figcaption>
    </figure>
  )
  if (!compact) return qr
  return (
    <details className="donation-details">
      <summary>
        <QRCodeSVG
          value={donationPayload}
          size={40}
          level="M"
          marginSize={4}
          aria-hidden="true"
          focusable="false"
        />
        <span>{t('Donate via QR')}</span>
      </summary>
      {qr}
      <p>{t('Scan with your banking app. Thank you for your support!')}</p>
    </details>
  )
}
