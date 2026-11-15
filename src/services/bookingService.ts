import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore'

import { auth, db } from '../firebase'

export type BookingStatus = 'Pending' | 'Confirmed' | 'Cancelled'
export type PaymentStatus = 'Unpaid' | 'Paid'

export interface Booking {
  id: string
  userId: string
  customerName: string
  workspaceId: string
  workspaceName: string
  location: string
  date: string
  guests: number
  total: number
  status: BookingStatus
  paymentStatus: PaymentStatus
  paymentReference: string | null
  qrToken: string | null
  createdAt: unknown
  expiresAt?: unknown
  version?: number
}

export interface PublicBookingVerification {
  bookingReference: string
  workspaceName: string
  location: string
  date: string
  guests: number
  total: number
  status: BookingStatus
  paymentStatus: PaymentStatus
}

export interface WorkspaceAttendee {
  uid: string
  workspaceId: string
  displayName: string
  workType: string
  bookingReference: string
  visible: boolean
}

export interface DiscoverableMember {
  uid: string
  displayName: string
  workType: string
  skills: string[]
  role: 'freelancer' | 'company'
  title: string
  organisation: string
  bio: string
}

export interface MemberProfileForBooking {
  name: string
  workType: string
  visible: boolean
}

const bookingsCollection = collection(db, 'bookings')
const verificationsCollection = collection(db, 'bookingVerifications')

const ONE_HOUR_MS = 60 * 60 * 1000

function attendeeRef(workspaceId: string, uid: string) {
  return doc(db, 'workspaces', workspaceId, 'attendees', uid)
}

/** Random URL-safe token used for the booking QR code. */
function newToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)

  return btoa(String.fromCharCode(...Array.from(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** Random reference for demo payments. */
function newPaymentReference(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)

  const hex = Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()

  return `DEMO-${hex}`
}

/**
 * Creates a booking directly in Firestore (no Cloud Functions needed).
 * The booking and its public verification record are saved together.
 * The attendee record is written afterwards.
 */
export async function createBooking(
  booking: Omit<
    Booking,
    | 'id'
    | 'createdAt'
    | 'status'
    | 'paymentStatus'
    | 'paymentReference'
    | 'qrToken'
  >,
  memberProfile: MemberProfileForBooking,
): Promise<string> {
  const currentUser = auth.currentUser

  if (!currentUser) {
    throw new Error('Please sign in before creating a booking.')
  }

  if (booking.userId !== currentUser.uid) {
    throw new Error('Your account does not match this booking.')
  }

  const workType = memberProfile.workType.trim()

  if (workType.length < 2) {
    throw new Error(
      'Please add your work type to your profile before booking.',
    )
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(booking.date)) {
    throw new Error('Please choose a valid booking date.')
  }

  if (
    !Number.isInteger(booking.guests) ||
    booking.guests < 1 ||
    booking.guests > 8
  ) {
    throw new Error('Guest count must be between 1 and 8.')
  }

  if (!Number.isFinite(booking.total) || booking.total <= 0) {
    throw new Error('Invalid booking total.')
  }

  const bookingRef = doc(bookingsCollection)
  const token = newToken()
  const expiresAt = Timestamp.fromMillis(Date.now() + ONE_HOUR_MS)

  const batch = writeBatch(db)

  batch.set(bookingRef, {
    userId: currentUser.uid,
    customerName: booking.customerName.trim(),
    workspaceId: String(booking.workspaceId),
    workspaceName: booking.workspaceName,
    location: booking.location,
    date: booking.date,
    guests: booking.guests,
    total: booking.total,

    status: 'Pending',
    paymentStatus: 'Unpaid',
    paymentReference: null,

    qrToken: token,
    version: 1,

    createdAt: serverTimestamp(),
    expiresAt,
  })

  batch.set(doc(verificationsCollection, token), {
    bookingReference: bookingRef.id,
    workspaceName: booking.workspaceName,
    location: booking.location,
    date: booking.date,
    guests: booking.guests,
    total: booking.total,

    status: 'Pending',
    paymentStatus: 'Unpaid',

    expiresAt,
    createdAt: serverTimestamp(),
  })

  await batch.commit()

  // Best effort: attendee creation must never undo a successful booking.
  try {
    const memberRef = attendeeRef(
      String(booking.workspaceId),
      currentUser.uid,
    )

    const existingMember = await getDoc(memberRef)

    if (!existingMember.exists()) {
      await setDoc(memberRef, {
        uid: currentUser.uid,
        displayName: memberProfile.name.trim(),
        workType,
        visible: memberProfile.visible,
        bookingReference: bookingRef.id,
      })
    }
  } catch (error) {
    console.warn(
      'Booking saved, but the attendee record was not written:',
      error,
    )
  }

  return bookingRef.id
}

/**
 * Cancels a booking and updates its public verification record.
 */
export async function cancelBooking(
  booking: Booking,
  removeAttendee: boolean,
): Promise<void> {
  const batch = writeBatch(db)

  batch.update(
    doc(bookingsCollection, booking.id),
    { status: 'Cancelled' },
  )

  if (booking.qrToken) {
    const verificationRef = doc(
      verificationsCollection,
      booking.qrToken,
    )

    const verificationSnapshot = await getDoc(verificationRef)

    if (verificationSnapshot.exists()) {
      batch.update(verificationRef, {
        status: 'Cancelled',
      })
    }
  }

  if (removeAttendee) {
    batch.delete(
      attendeeRef(
        String(booking.workspaceId),
        booking.userId,
      ),
    )
  }

  await batch.commit()
}

/**
 * Permanently deletes a booking only if it is already cancelled.
 */
export async function deleteCancelledBooking(
  booking: Booking,
): Promise<void> {
  if (booking.status !== 'Cancelled') {
    throw new Error('Only cancelled bookings can be deleted.')
  }

  const batch = writeBatch(db)

  batch.delete(doc(bookingsCollection, booking.id))

  if (booking.qrToken) {
    const verificationRef = doc(
      verificationsCollection,
      booking.qrToken,
    )

    const verificationSnapshot = await getDoc(verificationRef)

    if (
      verificationSnapshot.exists() &&
      verificationSnapshot.data().status === 'Cancelled'
    ) {
      batch.delete(verificationRef)
    }
  }

  await batch.commit()
}

/**
 * Keeps attendee records synchronized with profile changes.
 */
export async function syncAttendeeProfile(
  userId: string,
  workspaceIds: string[],
  profile: MemberProfileForBooking,
): Promise<void> {
  const uniqueIds = [...new Set(workspaceIds.map(String))]

  if (uniqueIds.length === 0) return

  const batch = writeBatch(db)
  let updates = 0

  for (const workspaceId of uniqueIds) {
    const ref = attendeeRef(workspaceId, userId)
    const snapshot = await getDoc(ref)

    if (snapshot.exists()) {
      batch.update(ref, {
        displayName: profile.name.trim(),
        workType: profile.workType.trim(),
        visible: profile.visible,
      })

      updates += 1
    }
  }

  if (updates > 0) {
    await batch.commit()
  }
}

/**
 * Retrieves public booking verification details.
 */
export async function getPublicBookingVerification(
  token: string,
): Promise<PublicBookingVerification | null> {
  if (!token || token.length > 100) {
    return null
  }

  const verificationRef = doc(
    verificationsCollection,
    token,
  )

  const snapshot = await getDoc(verificationRef)

  if (!snapshot.exists()) {
    return null
  }

  const data = snapshot.data()

  return {
    bookingReference: String(data.bookingReference || ''),
    workspaceName: String(data.workspaceName || ''),
    location: String(data.location || ''),
    date: String(data.date || ''),
    guests: Number(data.guests || 0),
    total: Number(data.total || 0),
    status: String(data.status || 'Pending') as BookingStatus,
    paymentStatus: String(
      data.paymentStatus || 'Unpaid',
    ) as PaymentStatus,
  }
}

function timestampMillis(value: unknown): number {
  if (!value || typeof value !== 'object') return 0

  const timestamp = value as {
    toMillis?: () => number
  }

  return typeof timestamp.toMillis === 'function'
    ? timestamp.toMillis()
    : 0
}

/**
 * Real-time bookings belonging to one user.
 */
export function listenToUserBookings(
  userId: string,
  onBookings: (bookings: Booking[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const bookingsQuery = query(
    bookingsCollection,
    where('userId', '==', userId),
  )

  return onSnapshot(
    bookingsQuery,
    snapshot => {
      const bookings = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data({
          serverTimestamps: 'estimate',
        }),
      })) as Booking[]

      bookings.sort(
        (a, b) =>
          timestampMillis(b.createdAt) -
          timestampMillis(a.createdAt),
      )

      onBookings(bookings)
    },
    error => onError?.(error),
  )
}

/**
 * Real-time list of visible people who booked the given workspaces.
 */
export function listenToWorkspaceAttendees(
  workspaceIds: string[],
  onMembers: (members: WorkspaceAttendee[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const uniqueIds = [...new Set(workspaceIds.map(String))]

  if (uniqueIds.length === 0) {
    onMembers([])
    return () => {}
  }

  const results = new Map<string, WorkspaceAttendee[]>()

  const unsubscribes = uniqueIds.map(workspaceId => {
    const attendeesQuery = query(
      collection(
        db,
        'workspaces',
        workspaceId,
        'attendees',
      ),
      where('visible', '==', true),
    )

    return onSnapshot(
      attendeesQuery,
      snapshot => {
        results.set(
          workspaceId,
          snapshot.docs.map(item => {
            const data = item.data()

            return {
              uid: item.id,
              workspaceId,
              displayName: String(
                data.displayName || 'Member',
              ),
              workType: String(data.workType || ''),
              bookingReference: String(
                data.bookingReference || '',
              ),
              visible: data.visible === true,
            }
          }),
        )

        onMembers(
          Array.from(results.values()).flat(),
        )
      },
      error => onError?.(error),
    )
  })

  return () => {
    unsubscribes.forEach(unsubscribe => unsubscribe())
  }
}

/**
 * Real-time list of visible freelancers and companies.
 */
export function listenToDiscoverableMembers(
  onMembers: (members: DiscoverableMember[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const membersQuery = query(
    collection(db, 'users'),
    where('visible', '==', true),
    limit(200),
  )

  return onSnapshot(
    membersQuery,
    snapshot => {
      const members: DiscoverableMember[] = snapshot.docs
        .map(item => {
          const data = item.data()

          return {
            uid: item.id,
            displayName: String(data.name || 'Member'),
            workType: String(data.workType || ''),
            skills: Array.isArray(data.skills)
              ? data.skills.map(String).slice(0, 10)
              : [],
            role:
              data.role === 'company'
                ? 'company'
                : 'freelancer',
            title: String(data.title || ''),
            organisation: String(data.organisation || ''),
            bio: String(data.bio || ''),
          } as DiscoverableMember
        })
        .filter(
          member => member.workType.trim().length >= 2,
        )

      onMembers(members)
    },
    error => onError?.(error),
  )
}

/**
 * Demo payment only. No real money is collected.
 * Runs directly against Firestore (no Cloud Functions needed).
 * Only the booking owner can confirm payment, and only before expiry.
 */
export async function simulateDemoPayment(bookingId: string) {
  const currentUser = auth.currentUser

  if (!currentUser) {
    throw new Error('Please sign in first.')
  }

  if (!bookingId.trim()) {
    throw new Error('A valid booking ID is required.')
  }

  const bookingRef = doc(bookingsCollection, bookingId)
  const snapshot = await getDoc(bookingRef)

  if (!snapshot.exists()) {
    throw new Error('Booking not found.')
  }

  const booking = snapshot.data()

  if (booking.userId !== currentUser.uid) {
    throw new Error("You cannot pay for another user's booking.")
  }

  if (booking.status !== 'Pending' || booking.paymentStatus !== 'Unpaid') {
    throw new Error('This booking is no longer awaiting payment.')
  }

  const expiresMs = timestampMillis(booking.expiresAt)

  if (expiresMs <= Date.now()) {
    throw new Error('This booking has expired. Please create a new booking.')
  }

  const paymentReference = newPaymentReference()
  const batch = writeBatch(db)

  batch.update(bookingRef, {
    status: 'Confirmed',
    paymentStatus: 'Paid',
    paymentReference,
    paidAt: serverTimestamp(),
  })

  if (typeof booking.qrToken === 'string' && booking.qrToken) {
    const verificationRef = doc(verificationsCollection, booking.qrToken)
    const verificationSnapshot = await getDoc(verificationRef)

    if (verificationSnapshot.exists()) {
      batch.update(verificationRef, {
        status: 'Confirmed',
        paymentStatus: 'Paid',
        paymentReference,
        paidAt: serverTimestamp(),
      })
    }
  }

  await batch.commit()

  return {
    success: true,
    bookingId,
    status: 'Confirmed',
    paymentStatus: 'Paid',
    paymentReference,
  }
}