
import { useEffect, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { QRCodeSVG } from 'qrcode.react'
import { CheckCircle2, Clock, QrCode, ShieldCheck } from 'lucide-react'

import { functions } from '../firebase'
import type { Booking } from '../services/bookingService'

type Props = {
  booking: Booking
}

type QrResponse = {
  token: string
}

const getBookingQr = httpsCallable<
  { bookingId: string },
  QrResponse
>(functions, 'getOrCreateBookingQr')

export default function BookingQr({ booking }: Props) {
  const [token, setToken] = useState(booking.qrToken || '')
  const [loading, setLoading] = useState(!booking.qrToken)
  const [error, setError] = useState('')
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let active = true

    async function loadQr() {
      if (booking.qrToken) {
        setToken(booking.qrToken)
        setLoading(false)
        setError('')
        return
      }

      setLoading(true)
      setError('')

      try {
        const result = await getBookingQr({
          bookingId: booking.id,
        })

        if (active) {
          setToken(result.data.token)
        }
      } catch (err) {
        console.error('Booking QR error:', err)

        if (active) {
          setError('Unable to prepare your QR code. Please try again.')
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadQr()

    return () => {
      active = false
    }
  }, [booking.id, booking.qrToken, retryCount])

  const verificationUrl = token
    ? `${window.location.origin}/?booking=${encodeURIComponent(token)}`
    : ''

  const validEntry =
    booking.status === 'Confirmed' &&
    booking.paymentStatus === 'Paid'

  return (
    <div className="booking-qr-section">
      <div className="booking-qr-heading">
        <div>
          <span className="booking-qr-label">
            <QrCode size={15} /> BOOKING QR CODE
          </span>
          <h4>Your booking pass</h4>
          <p>Scan this code to view and verify your booking.</p>
        </div>
        <ShieldCheck size={23} />
      </div>

      <div className="booking-qr-content">
        {loading ? (
          <div className="booking-qr-placeholder">
            <span className="booking-spinner" />
            <p>Preparing your secure QR code...</p>
          </div>
        ) : error ? (
          <div className="booking-qr-placeholder">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => {
                setToken('')
                setLoading(true)
                setError('')
                setRetryCount(value => value + 1)
              }}
            >
              Retry
            </button>
          </div>
        ) : token ? (
          <>
            <div className="booking-qr-image">
              <QRCodeSVG
                value={verificationUrl}
                size={190}
                level="H"
                includeMargin
              />
            </div>

            <div className="booking-qr-status">
              {validEntry ? (
                <>
                  <CheckCircle2 size={16} />
                  <span>Confirmed booking</span>
                </>
              ) : (
                <>
                  <Clock size={16} />
                  <span>Not yet valid for entry</span>
                </>
              )}
            </div>

            <p className="booking-qr-hint">
              {validEntry
                ? 'Present this QR code when you arrive.'
                : 'Your QR code is ready, but entry requires a confirmed and paid booking.'}
            </p>
          </>
        ) : null}
      </div>
    </div>
  )
}
