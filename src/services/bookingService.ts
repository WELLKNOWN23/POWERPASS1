import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  setDoc,
  where,
  serverTimestamp,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore'

import { db } from '../firebase'

export type BookingStatus = 'Pending' | 'Confirmed' | 'Cancelled'
export type PaymentStatus = 'Unpaid' | 'Paid'

export interface Booking {
  id: string
  userId: string
  customerName: string
  // Stored as a STRING so it matches the workspace path used by the rules.
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

// Optional "also booked here" record, stored at
// workspaces/{workspaceId}/attendees/{uid}
export interface WorkspaceAttendee {
  uid: string
  workspaceId: string
  displayName: string
  workType: string
  bookingReference: string
  visible: boolean
}

// Public profile used for discovery, read from users/{uid}.
// It does NOT depend on any booking.
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

function attendeeRef(workspaceId: string, uid: string) {
  return doc(db, 'workspaces', workspaceId, 'attendees', uid)
}

/**
 * Creates the booking and its public QR verification record in ONE atomic
 * batch. The optional "also booked here" attendee record is written
 * afterwards on a best-effort basis, so it can never block a booking.
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
  if (!crypto.randomUUID) {
    throw new Error(
      'Your browser cannot create a secure booking reference. Please use an updated browser.',
    )
  }

  const workspaceId = String(booking.workspaceId)
  const workType = memberProfile.workType.trim()

  if (workType.length < 2) {
    throw new Error('Please add your work type to your profile before booking.')
  }

  const bookingRef = doc(bookingsCollection)
  const token = crypto.randomUUID()
  const verificationRef = doc(verificationsCollection, token)

  const bookingData = {
    ...booking,
    workspaceId,
    customerName: booking.customerName.trim(),
    status: 'Pending' as const,
    paymentStatus: 'Unpaid' as const,
    paymentReference: null,
    qrToken: token,
    createdAt: serverTimestamp(),
  }

  const publicData = {
    bookingReference: bookingRef.id,
    workspaceName: booking.workspaceName,
    location: booking.location,
    date: booking.date,
    guests: booking.guests,
    total: booking.total,
    status: 'Pending',
    paymentStatus: 'Unpaid',
    createdAt: serverTimestamp(),
  }

  const batch = writeBatch(db)

  batch.set(bookingRef, bookingData)
  batch.set(verificationRef, publicData)

  await batch.commit()

  // Best effort: never let this fail the booking.
  try {
    const memberRef = attendeeRef(workspaceId, booking.userId)
    const existingMember = await getDoc(memberRef)

    if (!existingMember.exists()) {
      await setDoc(memberRef, {
        uid: booking.userId,
        displayName: memberProfile.name.trim(),
        workType,
        visible: memberProfile.visible,
        bookingReference: bookingRef.id,
      })
    }
  } catch (error) {
    console.warn('Booking saved, but the attendee record was not written:', error)
  }

  return bookingRef.id
}

/**
 * Cancels a booking, marks its QR record as Cancelled, and (optionally)
 * removes the user's attendee record for that workspace, atomically.
 * Pass removeAttendee = false if the user has another active booking there.
 */
export async function cancelBooking(
  booking: Booking,
  removeAttendee: boolean,
): Promise<void> {
  const batch = writeBatch(db)

  batch.update(doc(bookingsCollection, booking.id), { status: 'Cancelled' })

  if (booking.qrToken) {
    const verificationRef = doc(verificationsCollection, booking.qrToken)
    const verificationSnapshot = await getDoc(verificationRef)

    if (verificationSnapshot.exists()) {
      batch.update(verificationRef, { status: 'Cancelled' })
    }
  }

  if (removeAttendee) {
    batch.delete(attendeeRef(String(booking.workspaceId), booking.userId))
  }

  await batch.commit()
}

/**
 * Permanently deletes a booking, but ONLY if it is already Cancelled.
 * The rules enforce the same restriction on the server.
 */
export async function deleteCancelledBooking(booking: Booking): Promise<void> {
  if (booking.status !== 'Cancelled') {
    throw new Error('Only cancelled bookings can be deleted.')
  }

  const batch = writeBatch(db)

  batch.delete(doc(bookingsCollection, booking.id))

  if (booking.qrToken) {
    const verificationRef = doc(verificationsCollection, booking.qrToken)
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
 * Keeps the user's attendee records in sync when their name, work type or
 * visibility changes.
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

export async function getPublicBookingVerification(
  token: string,
): Promise<PublicBookingVerification | null> {
  if (!token || token.length > 100) {
    return null
  }

  const verificationRef = doc(verificationsCollection, token)
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
    paymentStatus: String(data.paymentStatus || 'Unpaid') as PaymentStatus,
  }
}

function timestampMillis(value: unknown): number {
  if (!value || typeof value !== 'object') return 0

  const timestamp = value as { toMillis?: () => number }

  return typeof timestamp.toMillis === 'function'
    ? timestamp.toMillis()
    : 0
}

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
      // 'estimate' fills in createdAt for a booking that is still being
      // written, so a brand-new booking sorts to the TOP instead of the end.
      const bookings = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data({ serverTimestamps: 'estimate' }),
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
 * The rules only allow reading a workspace's attendees if you are one too.
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
      collection(db, 'workspaces', workspaceId, 'attendees'),
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
              displayName: String(data.displayName || 'Member'),
              workType: String(data.workType || ''),
              bookingReference: String(data.bookingReference || ''),
              visible: data.visible === true,
            }
          }),
        )

        onMembers(Array.from(results.values()).flat())
      },
      error => onError?.(error),
    )
  })

  return () => unsubscribes.forEach(unsubscribe => unsubscribe())
}

/**
 * Real-time list of every member (freelancers AND companies) who has left
 * their profile visible. No booking is required to appear here.
 * The query MUST filter on visible == true to satisfy the rules.
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
            role: data.role === 'company' ? 'company' : 'freelancer',
            title: String(data.title || ''),
            organisation: String(data.organisation || ''),
            bio: String(data.bio || ''),
          } as DiscoverableMember
        })
        .filter(member => member.workType.trim().length >= 2)

      onMembers(members)
    },
    error => onError?.(error),
  )
}