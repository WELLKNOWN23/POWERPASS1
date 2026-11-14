import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  onAuthStateChanged,
  signOut,
  type User,
} from 'firebase/auth'

import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { QRCodeSVG } from 'qrcode.react'

import {
  Search,
  MapPin,
  SlidersHorizontal,
  LayoutGrid,
  Map as MapIcon,
  Heart,
  Bell,
  Sun,
  Moon,
  ChevronDown,
  ArrowUpRight,
  Wifi,
  Zap,
  Coffee,
  Monitor,
  Menu,
  X,
  Compass,
  CalendarDays,
  MessageCircle,
  Star,
  UserRound,
  LogOut,
  Bookmark,
  CheckCircle2,
  Settings,
  Share2,
  Users,
  Send,
  Building2,
  Laptop,
  Handshake,
  Sparkles,
  Trash2,
} from 'lucide-react'

import { auth, db } from './firebase'
import AuthScreen from './AuthScreen'
import WorkspaceMap from './components/WorkspaceMap'

import {
  cancelBooking as cancelBookingInFirestore,
  createBooking as saveBookingToFirestore,
  deleteCancelledBooking,
  getPublicBookingVerification,
  listenToDiscoverableMembers,
  listenToUserBookings,
  listenToWorkspaceAttendees,
  syncAttendeeProfile,
  type Booking as FirestoreBooking,
  type DiscoverableMember,
  type WorkspaceAttendee,
} from './services/bookingService'

import type { Workspace } from './types/workspace'

import './App.css'

type Role = 'freelancer' | 'company'
type RequestStatus = 'Pending' | 'Accepted' | 'Declined'

type WorkspaceItem = {
  id: number
  name: string
  location: string
  latitude: number
  longitude: number
  price: number
  rating: number
  type: string
  image: string
  score: number
  facilities: string[]
}

type Booking = FirestoreBooking

type MemberProfile = {
  uid: string
  name: string
  role: Role
  title: string
  workType: string
  skills: string[]
  organisation: string
  bio: string
  visible: boolean
}

type ConnectionRequest = {
  id: string
  fromUid: string
  fromName: string
  fromRole: Role
  fromTitle: string
  toUid: string
  toName: string
  workspaceId?: string
  message: string
  status: RequestStatus
  createdAt: string
}

type BookingVerification = {
  bookingReference: string
  workspaceName: string
  location: string
  date: string
  guests: number
  total: number
  status: string
  paymentStatus: string
}

type ChatContact = {
  uid: string
  name: string
}

type ChatMessage = {
  id: string
  senderId: string
  text: string
  readBy?: string[]
  createdAt?: {
    toDate?: () => Date
  } | null
}

type ConversationSummary = {
  id: string
  participants: string[]
  unreadCounts?: Record<string, number>
}

const workspaces: WorkspaceItem[] = [
  {
    id: 1,
    name: 'The Workstation',
    location: 'Yaba, Lagos',
    latitude: 6.5158,
    longitude: 3.3745,
    price: 4500,
    rating: 4.9,
    type: 'Coworking',
    image: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=900',
    score: 96,
    facilities: ['Wi-Fi', 'Power', 'Coffee'],
  },
  {
    id: 2,
    name: 'Civic Hub',
    location: 'Ikeja, Lagos',
    latitude: 6.6018,
    longitude: 3.3515,
    price: 6500,
    rating: 4.8,
    type: 'Private office',
    image: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=900',
    score: 92,
    facilities: ['Wi-Fi', 'Power', 'Meeting room'],
  },
  {
    id: 3,
    name: 'The Foundry',
    location: 'Victoria Island, Lagos',
    latitude: 6.4281,
    longitude: 3.4219,
    price: 8500,
    rating: 4.9,
    type: 'Coworking',
    image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=900',
    score: 98,
    facilities: ['Wi-Fi', 'Power', 'Coffee'],
  },
  {
    id: 4,
    name: 'Gather House',
    location: 'Surulere, Lagos',
    latitude: 6.4969,
    longitude: 3.3594,
    price: 12000,
    rating: 4.7,
    type: 'Meeting room',
    image: 'https://image.archify.com/blog/03-How-to-Create-a-Comfortable-Workspace-at-Home.jpg',
    score: 90,
    facilities: ['Wi-Fi', 'Power', 'Meeting room'],
  },
  {
    id: 5,
    name: 'The Creative Loft',
    location: 'Lekki, Lagos',
    latitude: 6.4474,
    longitude: 3.4700,
    price: 7500,
    rating: 4.9,
    type: 'Coworking',
    image: 'https://image.archify.com/blog/02-How-to-Create-a-Comfortable-Workspace-at-Home.jpg',
    score: 97,
    facilities: ['Wi-Fi', 'Power', 'Coffee'],
  },
  {
    id: 6,
    name: 'Executive Suites',
    location: 'Ikoyi, Lagos',
    latitude: 6.4549,
    longitude: 3.4350,
    price: 18000,
    rating: 4.8,
    type: 'Private office',
    image: 'https://image.archify.com/blog/01-How-to-Create-a-Comfortable-Workspace-at-Home.jpg',
    score: 95,
    facilities: ['Wi-Fi', 'Power', 'Meeting room'],
  },
  {
    id: 7,
    name: 'Connect Space',
    location: 'Oniru, Lagos',
    latitude: 6.4320,
    longitude: 3.4430,
    price: 5500,
    rating: 4.7,
    type: 'Coworking',
    image: 'https://www.dgicommunications.com/hs-fs/hubfs/Imported_Blog_Media/DGI_Blog-Post_Creating-the-Idea-Workspace_20220803_v3.jpg?height=900&name=DGI_Blog-Post_Creating-the-Idea-Workspace_20220803_v3.jpg&width=1200',
    score: 91,
    facilities: ['Wi-Fi', 'Power', 'Coffee'],
  },
  {
    id: 8,
    name: 'Boardroom One',
    location: 'Lekki Phase 1, Lagos',
    latitude: 6.4350,
    longitude: 3.4780,
    price: 22000,
    rating: 4.9,
    type: 'Meeting room',
    image: 'https://www.dgicommunications.com/hs-fs/hubfs/Imported_Blog_Media/Incorporate_Natural_Elements.jpg?height=1280&name=Incorporate_Natural_Elements.jpg&width=1920',
    score: 99,
    facilities: ['Wi-Fi', 'Power', 'Meeting room'],
  },
  {
    id: 9,
    name: 'The Hive',
    location: 'Maryland, Lagos',
    latitude: 6.5710,
    longitude: 3.3670,
    price: 4000,
    rating: 4.6,
    type: 'Coworking',
    image: 'https://www.hatcollective.com/wp-content/uploads/2022/08/360-workspace-kita-e2-open-office.jpg',
    score: 89,
    facilities: ['Wi-Fi', 'Power', 'Coffee'],
  },
  {
    id: 10,
    name: 'Studio Collective',
    location: 'Victoria Island, Lagos',
    latitude: 6.4250,
    longitude: 3.4150,
    price: 15000,
    rating: 4.9,
    type: 'Private office',
    image: 'https://www.dgicommunications.com/hs-fs/hubfs/Imported_Blog_Media/Design_a_Flexible_Workspace.jpg?height=1440&name=Design_a_Flexible_Workspace.jpg&width=1920',
    score: 98,
    facilities: ['Wi-Fi', 'Power', 'Meeting room'],
  },
]

const categories = ['All spaces', 'Coworking', 'Private office', 'Meeting room']

const workTypeSuggestions = [
  'UI/UX Designer',
  'Software Developer',
  'Graphic Designer',
  'Writer / Content Creator',
  'Marketing',
  'Photographer / Videographer',
  'Consultant',
  'Founder / Entrepreneur',
  'Student',
]

function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
}

function writeStorage<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Browser storage may be unavailable.
  }
}

function roleLabel(role: Role) {
  return role === 'freelancer' ? 'Freelancer' : 'Company'
}

/* -------------------------------------------------------
   PEOPLE DISCOVERY HELPERS
------------------------------------------------------- */

type PersonCard = {
  uid: string
  displayName: string
  workType: string
  role?: Role
  title?: string
  organisation?: string
  skills?: string[]
  workspaceId?: string
}

const FIELD_GROUPS: { label: string; words: string[] }[] = [
  {
    label: 'Design',
    words: ['design', 'ui', 'ux', 'graphic', 'illustrat', 'brand', 'creative', 'animat', 'motion', 'photograph', 'videograph', 'video', 'film', 'art'],
  },
  {
    label: 'Technology',
    words: ['software', 'develop', 'engineer', 'coder', 'coding', 'programm', 'web', 'mobile', 'data', 'cyber', 'cloud', 'devops', 'tech', 'ai', 'it', 'qa', 'app', 'frontend', 'backend', 'fullstack', 'front'],
  },
  {
    label: 'Writing',
    words: ['writ', 'content', 'copy', 'journal', 'editor', 'blog', 'author', 'translat'],
  },
  {
    label: 'Marketing',
    words: ['market', 'seo', 'social', 'advert', 'media', 'sales', 'growth', 'pr'],
  },
  {
    label: 'Education',
    words: ['student', 'teach', 'tutor', 'research', 'academ', 'lectur', 'educat', 'scien'],
  },
  {
    label: 'Business',
    words: ['consult', 'found', 'entrepreneur', 'business', 'strateg', 'manag', 'financ', 'account', 'hr', 'recruit', 'startup', 'operat', 'product', 'analyst', 'legal', 'law'],
  },
]

function fieldCategory(workType: string) {
  const tokens = workType
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

  for (const group of FIELD_GROUPS) {
    if (
      tokens.some(token =>
        group.words.some(
          word => token === word || (word.length >= 4 && token.startsWith(word)),
        ),
      )
    ) {
      return group.label
    }
  }

  return 'Other'
}

function similarFields(a: string, b: string) {
  const x = a.trim().toLowerCase()
  const y = b.trim().toLowerCase()

  if (!x || !y) return false
  if (x === y) return true

  const category = fieldCategory(x)

  return category !== 'Other' && category === fieldCategory(y)
}

// "Figma, React; SEO" -> ['Figma', 'React', 'SEO'] (max 10, 30 chars each)
function parseSkills(text: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const raw of text.split(/[,\n;]+/)) {
    const skill = raw.trim().slice(0, 30)
    const key = skill.toLowerCase()

    if (skill && !seen.has(key)) {
      seen.add(key)
      result.push(skill)
    }
  }

  return result.slice(0, 10)
}

function UnreadBadge({
  count,
  floating = false,
}: {
  count: number
  floating?: boolean
}) {
  if (count <= 0) return null

  return (
    <span
      aria-label={`${count} unread messages`}
      style={{
        minWidth: 18,
        height: 18,
        padding: '0 5px',
        display: 'inline-grid',
        placeItems: 'center',
        borderRadius: 9,
        background: '#d92d20',
        color: '#fff',
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1,
        ...(floating
          ? { position: 'absolute', top: -6, right: -10 }
          : { marginLeft: 'auto' }),
      }}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

/* -------------------------------------------------------
   REAL-TIME MESSAGES
------------------------------------------------------- */

function MessagesPanel({
  user,
  contacts,
  unreadByContact,
  notify,
}: {
  user: User
  contacts: ChatContact[]
  unreadByContact: Record<string, number>
  notify: (message: string) => void
}) {
  const [selectedContact, setSelectedContact] = useState<ChatContact | null>(null)
  const [conversationId, setConversationId] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messageText, setMessageText] = useState('')
  const [openingChat, setOpeningChat] = useState(false)
  const [sending, setSending] = useState(false)

  // Message IDs we are already marking as read (prevents duplicate writes).
  const markingRef = useRef<Set<string>>(new Set())

  const ownUnreadCount = selectedContact
    ? unreadByContact[selectedContact.uid] ?? 0
    : 0

  async function openChat(contact: ChatContact) {
    if (openingChat) return

    setOpeningChat(true)

    try {
      const id = [user.uid, contact.uid].sort().join('_')
      const conversationRef = doc(db, 'conversations', id)
      const conversationSnapshot = await getDoc(conversationRef)

      if (!conversationSnapshot.exists()) {
        await setDoc(conversationRef, {
          participants: [user.uid, contact.uid].sort(),
          participantNames: {
            [user.uid]: user.displayName || user.email?.split('@')[0] || 'Member',
            [contact.uid]: contact.name,
          },
          unreadCounts: {
            [user.uid]: 0,
            [contact.uid]: 0,
          },
          lastMessage: '',
          lastMessageSenderId: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      }

      markingRef.current = new Set()
      setSelectedContact(contact)
      setConversationId(id)
      setMessages([])
    } catch (error) {
      console.error('Unable to open conversation:', error)
      notify('Unable to open this conversation. Check your Firestore rules.')
    } finally {
      setOpeningChat(false)
    }
  }

  // Real-time message listener
  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      return
    }

    const messagesQuery = query(
      collection(db, 'conversations', conversationId, 'messages'),
      orderBy('createdAt', 'asc'),
    )

    const unsubscribe = onSnapshot(
      messagesQuery,
      snapshot => {
        const items = snapshot.docs.map(item => ({
          id: item.id,
          ...item.data(),
        })) as ChatMessage[]

        setMessages(items)
      },
      error => {
        console.error('Messages listener error:', error)
        notify('Unable to load messages. Check your Firestore rules.')
      },
    )

    return unsubscribe
  }, [conversationId, notify])

  // Automatically mark incoming messages as read while the chat is open
  useEffect(() => {
    if (!conversationId) return

    const unread = messages.filter(
      message =>
        message.senderId !== user.uid &&
        !(message.readBy ?? []).includes(user.uid) &&
        !markingRef.current.has(message.id),
    )

    if (unread.length > 0) {
      const toMark = unread.slice(0, 400)

      toMark.forEach(message => markingRef.current.add(message.id))

      const batch = writeBatch(db)

      toMark.forEach(message => {
        batch.update(
          doc(db, 'conversations', conversationId, 'messages', message.id),
          { readBy: arrayUnion(user.uid) },
        )
      })

      batch.update(doc(db, 'conversations', conversationId), {
        [`unreadCounts.${user.uid}`]: 0,
      })

      batch.commit().catch(error => {
        console.error('Unable to mark messages as read:', error)
        toMark.forEach(message => markingRef.current.delete(message.id))
      })

      return
    }

    // Everything is read but the counter is still showing unread messages.
    if (ownUnreadCount > 0 && messages.length > 0) {
      updateDoc(doc(db, 'conversations', conversationId), {
        [`unreadCounts.${user.uid}`]: 0,
      }).catch(error => {
        console.error('Unable to reset unread count:', error)
      })
    }
  }, [messages, conversationId, ownUnreadCount, user.uid])

  async function sendMessage() {
    const text = messageText.trim()

    if (!text || !conversationId || !selectedContact || sending) return

    if (text.length > 4000) {
      notify('Messages cannot be longer than 4,000 characters.')
      return
    }

    setSending(true)

    try {
      const messageRef = doc(
        collection(db, 'conversations', conversationId, 'messages'),
      )

      const batch = writeBatch(db)

      // 1. Save the message itself
      batch.set(messageRef, {
        senderId: user.uid,
        text,
        createdAt: serverTimestamp(),
        readBy: [user.uid],
      })

      // 2. Update the conversation preview and the OTHER person's unread count
      batch.update(doc(db, 'conversations', conversationId), {
        lastMessage: text,
        lastMessageSenderId: user.uid,
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        [`unreadCounts.${selectedContact.uid}`]: increment(1),
      })

      await batch.commit()

      setMessageText('')
    } catch (error) {
      console.error('Message send error:', error)
      notify('Message could not be sent. Check your Firestore rules.')
    } finally {
      setSending(false)
    }
  }

  function formatMessageTime(message: ChatMessage) {
    try {
      const date = message.createdAt?.toDate?.()

      if (!date) return 'Sending...'

      return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return ''
    }
  }

  return (
    <section
      className="messages-responsive"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(230px, 300px) minmax(0, 1fr)',
        gap: 18,
        minHeight: 520,
        background: 'var(--card, #fff)',
        border: '1px solid var(--border, #e8eae8)',
        borderRadius: 18,
        overflow: 'hidden',
      }}
    >
      <aside
        style={{
          borderRight: '1px solid var(--border, #e8eae8)',
          padding: 18,
          minWidth: 0,
        }}
      >
        <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>Your connections</h2>
        <p style={{ margin: '0 0 18px', fontSize: 13, opacity: 0.65 }}>
          Chat with accepted connections.
        </p>

        {contacts.length === 0 ? (
          <div style={{ padding: '25px 8px', textAlign: 'center' }}>
            <Users size={28} />
            <p style={{ fontSize: 13, opacity: 0.7 }}>
              You don't have accepted connections yet.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {contacts.map(contact => {
              const active = selectedContact?.uid === contact.uid

              return (
                <button
                  key={contact.uid}
                  type="button"
                  onClick={() => void openChat(contact)}
                  disabled={openingChat}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 11,
                    width: '100%',
                    padding: 12,
                    border: active ? '1px solid #16845b' : '1px solid transparent',
                    borderRadius: 12,
                    background: active ? 'rgba(22,132,91,0.09)' : 'transparent',
                    color: 'inherit',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      width: 40,
                      height: 40,
                      flexShrink: 0,
                      display: 'grid',
                      placeItems: 'center',
                      borderRadius: '50%',
                      background: '#e2f2e9',
                      color: '#13734d',
                      fontWeight: 700,
                    }}
                  >
                    {contact.name.slice(0, 2).toUpperCase()}
                  </span>

                  <span style={{ minWidth: 0 }}>
                    <strong
                      style={{
                        display: 'block',
                        fontSize: 14,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {contact.name}
                    </strong>
                    <small style={{ opacity: 0.65 }}>Connected</small>
                  </span>

                  <UnreadBadge count={unreadByContact[contact.uid] ?? 0} />
                </button>
              )
            })}
          </div>
        )}
      </aside>

      <div
        style={{
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 520,
        }}
      >
        {!selectedContact ? (
          <div
            style={{
              flex: 1,
              display: 'grid',
              placeContent: 'center',
              textAlign: 'center',
              padding: 25,
            }}
          >
            <MessageCircle size={42} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
            <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Your messages</h2>
            <p style={{ margin: 0, opacity: 0.65, fontSize: 14 }}>
              Select an accepted connection to start chatting.
            </p>
          </div>
        ) : (
          <>
            <header
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '15px 18px',
                borderBottom: '1px solid var(--border, #e8eae8)',
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: '50%',
                  background: '#e2f2e9',
                  color: '#13734d',
                  fontWeight: 700,
                }}
              >
                {selectedContact.name.slice(0, 2).toUpperCase()}
              </div>

              <div>
                <strong>{selectedContact.name}</strong>
                <p style={{ margin: '3px 0 0', fontSize: 12, opacity: 0.65 }}>
                  PowerPass connection
                </p>
              </div>
            </header>

            <div
              style={{
                flex: 1,
                minHeight: 330,
                maxHeight: 460,
                overflowY: 'auto',
                padding: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {messages.length === 0 ? (
                <div
                  style={{
                    margin: 'auto',
                    textAlign: 'center',
                    padding: 20,
                  }}
                >
                  <MessageCircle size={30} style={{ opacity: 0.5 }} />
                  <p style={{ fontSize: 14, opacity: 0.7 }}>
                    No messages yet. Say hello!
                  </p>
                </div>
              ) : (
                messages.map(message => {
                  const ownMessage = message.senderId === user.uid

                  return (
                    <div
                      key={message.id}
                      style={{
                        display: 'flex',
                        justifyContent: ownMessage ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <div
                        style={{
                          maxWidth: '78%',
                          padding: '11px 14px',
                          borderRadius: ownMessage
                            ? '15px 15px 3px 15px'
                            : '15px 15px 15px 3px',
                          background: ownMessage ? '#147b53' : '#f0f2f0',
                          color: ownMessage ? '#fff' : '#202820',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
                          {message.text}
                        </p>
                        <small
                          style={{
                            display: 'block',
                            marginTop: 5,
                            textAlign: 'right',
                            opacity: 0.7,
                            fontSize: 10,
                          }}
                        >
                          {formatMessageTime(message)}
                          {ownMessage &&
                            ((message.readBy ?? []).some(
                              uid => uid !== user.uid,
                            )
                              ? ' · ✓✓ Read'
                              : message.createdAt
                                ? ' · ✓ Sent'
                                : '')}
                        </small>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <form
              onSubmit={event => {
                event.preventDefault()
                void sendMessage()
              }}
              style={{
                display: 'flex',
                gap: 10,
                padding: 14,
                borderTop: '1px solid var(--border, #e8eae8)',
              }}
            >
              <input
                value={messageText}
                onChange={event => setMessageText(event.target.value)}
                placeholder="Write a message..."
                maxLength={4000}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '12px 14px',
                  border: '1px solid #dfe5df',
                  borderRadius: 10,
                  outline: 'none',
                  font: 'inherit',
                }}
              />

              <button
                type="submit"
                disabled={!messageText.trim() || sending}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  padding: '0 17px',
                  border: 0,
                  borderRadius: 10,
                  background: '#147b53',
                  color: '#fff',
                  cursor: 'pointer',
                  opacity: !messageText.trim() || sending ? 0.55 : 1,
                }}
              >
                <Send size={16} />
                {sending ? 'Sending' : 'Send'}
              </button>
            </form>
          </>
        )}
      </div>

      <style>
        {`
          @media (max-width: 700px) {
            .messages-responsive {
              grid-template-columns: 1fr !important;
            }

            .messages-responsive > aside {
              border-right: 0 !important;
              border-bottom: 1px solid var(--border, #e8eae8);
            }

            .messages-responsive > div {
              min-height: 420px !important;
            }
          }
        `}
      </style>
    </section>
  )
}

/* Public QR page. This page identifies a booking, but never approves entry. */
function BookingVerificationPage({ token }: { token: string }) {
  const [booking, setBooking] = useState<BookingVerification | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function loadBooking() {
      try {
        const result = await getPublicBookingVerification(token)

        if (!result) {
          throw new Error('Booking verification record not found.')
        }

        if (active) setBooking(result)
      } catch (err) {
        console.error('Booking QR lookup failed:', err)

        if (active) {
          setError(
            'This QR code could not be found. It may be invalid or unavailable.',
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadBooking()

    return () => {
      active = false
    }
  }, [token])

  return (
    <main className="qr-verification-page">
      <div className="qr-verification-card">
        <div className="qr-verification-brand">
          <div className="brand-mark">P</div>
          <strong>powerpass</strong>
        </div>

        {loading ? (
          <>
            <div className="qr-loading-spinner" />
            <h1>Loading booking...</h1>
            <p>Please wait while we retrieve this booking record.</p>
          </>
        ) : error || !booking ? (
          <>
            <div className="qr-result-icon invalid">
              <X size={34} />
            </div>
            <h1>Booking not found</h1>
            <p>{error || 'Booking information is unavailable.'}</p>
          </>
        ) : (
          <>
            <div className="qr-result-icon invalid">
              <X size={34} />
            </div>

            <h1>ENTRY NOT VERIFIED</h1>

            <p className="qr-verification-status">
              This QR code identifies a booking request. It does not verify
              payment or authorise entry. Venue staff must check the booking
              and payment records manually.
            </p>

            <div className="qr-booking-details">
              <div>
                <span>Workspace</span>
                <strong>{booking.workspaceName}</strong>
              </div>
              <div>
                <span>Location</span>
                <strong>{booking.location}</strong>
              </div>
              <div>
                <span>Booking date</span>
                <strong>{booking.date || 'Not provided'}</strong>
              </div>
              <div>
                <span>Guests</span>
                <strong>{booking.guests}</strong>
              </div>
              <div>
                <span>Booking reference</span>
                <strong>{booking.bookingReference}</strong>
              </div>
              <div>
                <span>Booking status</span>
                <strong>{booking.status}</strong>
              </div>
              <div>
                <span>Payment status</span>
                <strong>{booking.paymentStatus}</strong>
              </div>
              <div>
                <span>Booking total</span>
                <strong>
                  ₦{Number(booking.total).toLocaleString('en-NG')}
                </strong>
              </div>
            </div>

            <p className="qr-verification-status">
              Do not use this page alone to approve entry.
            </p>
          </>
        )}

        <button
          className="qr-home-button"
          onClick={() => {
            window.location.href = '/'
          }}
        >
          Go to PowerPass
        </button>

        <p className="qr-verification-footer">
          POWERPASS · BOOKING REFERENCE
        </p>
      </div>
    </main>
  )
}

function Dashboard({ user }: { user: User }) {
  const [dark, setDark] = useState(false)
  const [view, setView] = useState<'list' | 'map'>('list')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All spaces')
  const [saved, setSaved] = useState<number[]>([])
  const [bookingSubmitting, setBookingSubmitting] = useState(false)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [bookingDate, setBookingDate] = useState('')
  const [searchDate, setSearchDate] = useState('')
  const [guestCount, setGuestCount] = useState(1)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [notice, setNotice] = useState('')
  const [activeTab, setActiveTab] = useState('discover')
  const [signingOut, setSigningOut] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)

  const [profileName, setProfileName] = useState(
    user.displayName || user.email?.split('@')[0] || 'Member',
  )
  const [profileRole, setProfileRole] = useState<Role | null>(null)
  const [profileTitle, setProfileTitle] = useState('')
  const [profileWorkType, setProfileWorkType] = useState('')
  const [profileSkills, setProfileSkills] = useState('')
  const [organisation, setOrganisation] = useState('')
  const [bio, setBio] = useState('')
  const [visible, setVisible] = useState(true)
  const [members, setMembers] = useState<WorkspaceAttendee[]>([])
  const [people, setPeople] = useState<DiscoverableMember[]>([])
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all')
  const [profileError, setProfileError] = useState(false)
  const [profileReload, setProfileReload] = useState(0)
  const [workTypeFilter, setWorkTypeFilter] = useState('')
  const [requests, setRequests] = useState<ConnectionRequest[]>([])
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [profileLoading, setProfileLoading] = useState(true)
  const [requestMessage, setRequestMessage] = useState(
    'Hello, I would like to connect with you on PowerPass.',
  )
  const [requestTarget, setRequestTarget] = useState<PersonCard | null>(null)

  const notify = useCallback((message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3500)
  }, [])

  useEffect(() => {
    setSaved(readStorage(`powerpass_saved_${user.uid}`, []))
  }, [user.uid])

  useEffect(() => {
    writeStorage(`powerpass_saved_${user.uid}`, saved)
  }, [saved, user.uid])

  useEffect(() => {
    const unsubscribe = listenToUserBookings(
      user.uid,
      items => setBookings(items),
      error => {
        console.error('Booking listener error:', error)
        notify('Unable to load bookings. Check your internet connection.')
      },
    )

    return unsubscribe
  }, [user.uid, notify])

  // Workspaces where this user has an active booking
  const bookedWorkspaceIds = useMemo(
    () =>
      Array.from(
        new Set(
          bookings
            .filter(item => item.status !== 'Cancelled')
            .map(item => String(item.workspaceId)),
        ),
      ).sort(),
    [bookings],
  )

  const bookedWorkspaceKey = bookedWorkspaceIds.join('|')

  // People who booked the same workspaces (used for "also booked" labels
  // and the people list on a workspace page)
  useEffect(() => {
    const ids = bookedWorkspaceKey ? bookedWorkspaceKey.split('|') : []

    const unsubscribe = listenToWorkspaceAttendees(
      ids,
      items => setMembers(items),
      error => {
        console.error('Attendee listener error:', error)
        notify('Unable to load people from your workspaces.')
      },
    )

    return unsubscribe
  }, [bookedWorkspaceKey, notify])

  // Discovery: every visible freelancer and company, no booking needed
  useEffect(() => {
    const unsubscribe = listenToDiscoverableMembers(
      items => setPeople(items),
      error => {
        console.error('People listener error:', error)
        notify('Unable to load people.')
      },
    )

    return unsubscribe
  }, [notify])

  const attendeeWorkspaceByUid = useMemo(() => {
    const map = new globalThis.Map<string, string>()

    members.forEach(member => {
      if (!map.has(member.uid)) map.set(member.uid, member.workspaceId)
    })

    return map
  }, [members])

  // Own profile. Cached locally, so a failed read never sends an existing
  // member back to the setup screen.
  useEffect(() => {
    const cacheKey = `powerpass_profile_${user.uid}`
    const cached = readStorage<Partial<MemberProfile> | null>(cacheKey, null)
    const fallbackName =
      user.displayName || user.email?.split('@')[0] || 'Member'

    setProfileLoading(true)
    setProfileError(false)

    function applyProfile(own: Partial<MemberProfile>) {
      setProfileRole(
        own.role === 'freelancer' || own.role === 'company' ? own.role : null,
      )
      setProfileName(own.name || fallbackName)
      setProfileTitle(own.title || '')
      setProfileWorkType(own.workType || '')
      setOrganisation(own.organisation || '')
      setBio(own.bio || '')
      setProfileSkills(
        Array.isArray(own.skills) ? own.skills.join(', ') : '',
      )
      setVisible(own.visible !== false)
    }

    // On refresh, show the saved profile instantly (no setup screen flash).
    // Firestore then confirms it below.
    if (cached?.workType && cached.role) {
      applyProfile(cached)
      setProfileLoading(false)
    }

    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      snapshot => {
        if (snapshot.exists()) {
          const own = snapshot.data() as Partial<MemberProfile>

          applyProfile(own)
          writeStorage(cacheKey, own)

          // Older profiles have no "visible" flag, and discovery needs one.
          if (typeof own.visible !== 'boolean') {
            void setDoc(
              doc(db, 'users', user.uid),
              { visible: true },
              { merge: true },
            ).catch(error => console.error('Visibility migration failed:', error))
          }

          setProfileLoading(false)
          return
        }

        if (snapshot.metadata.fromCache) {
          // Offline: do not treat "not found" as "new user".
          if (cached?.workType && cached.role) {
            applyProfile(cached)
          } else {
            setProfileError(true)
          }

          setProfileLoading(false)
          return
        }

        setProfileRole(null)
        setProfileName(fallbackName)
        setProfileTitle('')
        setProfileWorkType('')
        setOrganisation('')
        setBio('')
        setProfileSkills('')
        setVisible(true)
        setProfileLoading(false)
      },
      error => {
        console.error('Profile listener error:', error)
        notify('Unable to load your profile. Check your connection.')

        if (cached?.workType && cached.role) {
          applyProfile(cached)
        } else {
          setProfileError(true)
        }

        setProfileLoading(false)
      },
    )

    return unsubscribe
  }, [user.uid, user.displayName, user.email, notify, profileReload])

  useEffect(() => {
    const incomingQuery = query(
      collection(db, 'connectionRequests'),
      where('toUid', '==', user.uid),
    )

    const outgoingQuery = query(
      collection(db, 'connectionRequests'),
      where('fromUid', '==', user.uid),
    )

    let incoming: ConnectionRequest[] = []
    let outgoing: ConnectionRequest[] = []

    function publish() {
      const merged = new globalThis.Map<string, ConnectionRequest>()

      incoming.forEach(item => merged.set(item.id, item))
      outgoing.forEach(item => merged.set(item.id, item))

      setRequests(
        Array.from(merged.values()).sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        ),
      )
    }

    const stopIncoming = onSnapshot(
      incomingQuery,
      snapshot => {
        incoming = snapshot.docs.map(item => ({
          id: item.id,
          ...item.data(),
        })) as ConnectionRequest[]
        publish()
      },
      error => {
        console.error('Incoming request listener:', error)
        notify('Unable to load incoming connection requests.')
      },
    )

    const stopOutgoing = onSnapshot(
      outgoingQuery,
      snapshot => {
        outgoing = snapshot.docs.map(item => ({
          id: item.id,
          ...item.data(),
        })) as ConnectionRequest[]
        publish()
      },
      error => {
        console.error('Outgoing request listener:', error)
        notify('Unable to load sent connection requests.')
      },
    )

    return () => {
      stopIncoming()
      stopOutgoing()
    }
  }, [user.uid, notify])

  // All my conversations, used for unread badges before Messages is opened
  useEffect(() => {
    const conversationsQuery = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', user.uid),
    )

    const unsubscribe = onSnapshot(
      conversationsQuery,
      snapshot => {
        setConversations(
          snapshot.docs.map(item => ({
            ...(item.data() as Omit<ConversationSummary, 'id'>),
            id: item.id,
          })),
        )
      },
      error => {
        console.error('Conversation listener error:', error)
        notify('Unable to load message notifications.')
      },
    )

    return unsubscribe
  }, [user.uid, notify])

  const unreadByContact = useMemo(() => {
    const result: Record<string, number> = {}

    conversations.forEach(conversation => {
      const otherUid = (conversation.participants || []).find(
        uid => uid !== user.uid,
      )

      if (!otherUid) return

      result[otherUid] = Number(conversation.unreadCounts?.[user.uid] ?? 0)
    })

    return result
  }, [conversations, user.uid])

  const totalUnread = useMemo(
    () =>
      Object.values(unreadByContact).reduce((sum, count) => sum + count, 0),
    [unreadByContact],
  )

  const today = (() => {
    const date = new Date()
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')

    return `${year}-${month}-${day}`
  })()

  const filtered = useMemo(
    () =>
      workspaces.filter(space => {
        const textMatch = `${space.name} ${space.location} ${space.type}`
          .toLowerCase()
          .includes(search.toLowerCase().trim())

        return textMatch && (category === 'All spaces' || space.type === category)
      }),
    [search, category],
  )

  const selectedSpace = workspaces.find(space => space.id === selected)
  const savedWorkspaces = workspaces.filter(space => saved.includes(space.id))
  const initials = profileName.trim().charAt(0).toUpperCase() || 'P'

  // De-duplicate people, apply the role and search filters, and list people
  // working in a similar field to me first.
  function buildPeopleList(source: PersonCard[]) {
    const unique = new globalThis.Map<string, PersonCard>()

    source.forEach(member => {
      if (member.uid !== user.uid && !unique.has(member.uid)) {
        unique.set(member.uid, member)
      }
    })

    const term = workTypeFilter.trim().toLowerCase()

    return Array.from(unique.values())
      .filter(member => {
        if (member.role && roleFilter !== 'all' && member.role !== roleFilter) {
          return false
        }

        if (!term) return true

        return [
          member.workType,
          member.displayName,
          member.title ?? '',
          member.organisation ?? '',
          (member.skills ?? []).join(' '),
          fieldCategory(member.workType),
        ]
          .join(' ')
          .toLowerCase()
          .includes(term)
      })
      .sort((a, b) => {
        const aSimilar = similarFields(profileWorkType, a.workType) ? 0 : 1
        const bSimilar = similarFields(profileWorkType, b.workType) ? 0 : 1

        return aSimilar - bSimilar || a.displayName.localeCompare(b.displayName)
      })
  }

  const incomingRequests = requests.filter(request => request.toUid === user.uid)
  const outgoingRequests = requests.filter(request => request.fromUid === user.uid)

  const acceptedRequests = requests.filter(
    request =>
      request.status === 'Accepted' &&
      (request.fromUid === user.uid || request.toUid === user.uid),
  )

  const chatContacts = useMemo(() => {
    const unique = new globalThis.Map<string, ChatContact>()

    acceptedRequests.forEach(request => {
      const contact =
        request.fromUid === user.uid
          ? { uid: request.toUid, name: request.toName }
          : { uid: request.fromUid, name: request.fromName }

      if (contact.uid) unique.set(contact.uid, contact)
    })

    return Array.from(unique.values())
  }, [acceptedRequests, user.uid])

  const mapWorkspaces: Workspace[] = filtered.map(space => ({
    id: String(space.id),
    name: space.name,
    location: space.location,
    address: `${space.location}, Nigeria`,
    latitude: space.latitude,
    longitude: space.longitude,
    category:
      space.type === 'Coworking'
        ? 'coworking'
        : space.type === 'Private office'
          ? 'private-office'
          : 'meeting-room',
    description: `Demo preview of ${space.name}.`,
    price: space.price,
    rating: space.rating,
    reviewCount: 0,
    image: space.image,
    amenities: space.facilities,
    capacity: 8,
    isVerified: false,
    isAvailable: true,
  }))

  async function saveProfile(
    role: Role,
    name: string,
    title: string,
    org: string,
    about: string,
  ) {
    const profile: MemberProfile = {
      uid: user.uid,
      name: name.trim(),
      role,
      title: title.trim() || roleLabel(role),
      workType: profileWorkType.trim(),
      skills: parseSkills(profileSkills),
      organisation: org.trim(),
      bio: about.trim(),
      visible,
    }

    if (!profile.name) {
      notify('Please enter your name.')
      return
    }

    if (profile.workType.length < 2) {
      notify('Please enter your work type, for example "UI/UX Designer".')
      return
    }

    if (profile.skills.length === 0) {
      notify('Please add at least one skill, for example "Figma, Branding".')
      return
    }

    try {
      await setDoc(doc(db, 'users', user.uid), profile, { merge: true })

      // Remember it on this device too, so a refresh never asks again.
      writeStorage(`powerpass_profile_${user.uid}`, profile)
      setProfileSkills(profile.skills.join(', '))

      setProfileRole(role)
      setProfileName(profile.name)
      setProfileTitle(profile.title)
      setOrganisation(profile.organisation)
      setBio(profile.bio)

      try {
        await syncAttendeeProfile(user.uid, bookedWorkspaceIds, {
          name: profile.name,
          workType: profile.workType,
          visible: profile.visible,
        })
      } catch (syncError) {
        console.error('Unable to sync workspace profile:', syncError)
      }

      notify('Your PowerPass profile has been saved.')
    } catch (error) {
      console.error(error)
      notify('Unable to save your profile. Please try again.')
    }
  }

  async function updateOwnProfile(patch: Partial<MemberProfile>) {
    const merged = {
      uid: user.uid,
      name: profileName,
      role: profileRole || 'freelancer',
      title: profileTitle,
      workType: profileWorkType,
      skills: parseSkills(profileSkills),
      organisation,
      bio,
      visible,
      ...patch,
    }

    try {
      await setDoc(doc(db, 'users', user.uid), merged, { merge: true })

      try {
        await syncAttendeeProfile(user.uid, bookedWorkspaceIds, {
          name: merged.name,
          workType: merged.workType,
          visible: merged.visible,
        })
      } catch (syncError) {
        console.error('Unable to sync workspace profile:', syncError)
      }
    } catch (error) {
      console.error(error)
      notify('Unable to update your profile.')
    }
  }

  function toggleSaved(id: number) {
    const exists = saved.includes(id)

    setSaved(current =>
      exists ? current.filter(item => item !== id) : [...current, id],
    )

    notify(exists ? 'Removed from saved spaces.' : 'Workspace saved.')
  }

  function openWorkspace(id: number) {
    setSelected(id)
    setBookingDate('')
    setGuestCount(1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function closeWorkspace() {
    setSelected(null)
    setBookingDate('')
    setGuestCount(1)
  }

  function navigate(tab: string) {
    setActiveTab(tab)
    setMobileMenu(false)
    setNotificationOpen(false)
    closeWorkspace()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSignOut() {
    setSigningOut(true)

    try {
      await signOut(auth)
    } catch {
      notify('Unable to sign out. Please try again.')
      setSigningOut(false)
    }
  }

  async function createBooking() {
    if (bookingSubmitting) return

    if (!user?.uid) {
      notify('Please sign in before creating a booking.')
      return
    }

    if (!selectedSpace) {
      notify('Please select a workspace first.')
      return
    }

    if (!bookingDate) {
      notify('Please select your booking date.')
      return
    }

    if (bookingDate < today) {
      notify('Choose a valid future booking date.')
      return
    }

    if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 8) {
      notify('Choose between 1 and 8 guests.')
      return
    }

    if (!profileName.trim()) {
      notify('Please add your name to your profile before booking.')
      return
    }

    if (profileWorkType.trim().length < 2) {
      notify('Please add your work type to your profile before booking.')
      return
    }

    setBookingSubmitting(true)

    try {
      const bookingId = await saveBookingToFirestore(
        {
          userId: user.uid,
          customerName: profileName.trim(),
          workspaceId: String(selectedSpace.id),
          workspaceName: selectedSpace.name,
          location: selectedSpace.location,
          date: bookingDate,
          guests: guestCount,
          total: selectedSpace.price * guestCount,
        },
        {
          name: profileName.trim(),
          workType: profileWorkType.trim(),
          visible,
        },
      )

      if (!bookingId) {
        throw new Error('Booking was not saved. No booking ID was returned.')
      }

      // Go straight to Booking History
      navigate('bookings')

      notify('Booking request created successfully!')
    } catch (error) {
      console.error('Booking creation failed:', error)

      const message =
        error instanceof Error ? error.message : 'Unknown error'

      notify(`Booking failed: ${message}`)
    } finally {
      setBookingSubmitting(false)
    }
  }

  async function cancelBooking(booking: Booking) {
    try {
      // Keep the attendee record if the user has another active booking
      // for the same workspace.
      const hasAnotherActiveBooking = bookings.some(
        item =>
          item.id !== booking.id &&
          item.status !== 'Cancelled' &&
          String(item.workspaceId) === String(booking.workspaceId),
      )

      await cancelBookingInFirestore(booking, !hasAnotherActiveBooking)

      notify('Booking request cancelled.')
    } catch (error) {
      console.error('Booking cancellation error:', error)
      notify('Unable to cancel this booking. Please try again.')
    }
  }

  async function deleteBooking(booking: Booking) {
    if (booking.status !== 'Cancelled') {
      notify('Only cancelled bookings can be deleted.')
      return
    }

    if (!window.confirm('Permanently delete this cancelled booking?')) return

    try {
      await deleteCancelledBooking(booking)
      notify('Cancelled booking deleted.')
    } catch (error) {
      console.error('Booking delete error:', error)
      notify('Unable to delete this booking. Please try again.')
    }
  }

  async function sendConnectionRequest(target: PersonCard) {
    const id = `REQ-${user.uid}-${target.uid}`
    const existing = requests.find(item => item.id === id)

    const theirs = requests.find(
      item =>
        item.fromUid === target.uid &&
        item.toUid === user.uid &&
        item.status !== 'Declined',
    )

    if (theirs) {
      notify('This person already sent you a request. Open Requests to respond.')
      return
    }

    if (existing && existing.status !== 'Declined') {
      notify('You already have an active request with this person.')
      return
    }

    if (!requestMessage.trim()) {
      notify('Please enter a short introduction message.')
      return
    }

    const request: ConnectionRequest = {
      id,
      fromUid: user.uid,
      fromName: profileName,
      fromRole: profileRole || 'freelancer',
      fromTitle: profileTitle || profileWorkType,
      toUid: target.uid,
      toName: target.displayName,
      message: requestMessage.trim(),
      status: 'Pending',
      createdAt: new Date().toISOString(),
    }

    try {
      // A declined request can only be replaced after it is removed.
      if (existing) {
        await deleteDoc(doc(db, 'connectionRequests', id))
      }

      await setDoc(doc(db, 'connectionRequests', id), request)
      setRequestTarget(null)
      notify('Connection request sent.')
    } catch (error) {
      console.error(error)
      notify('Unable to send request. Please try again.')
    }
  }

  async function respondToRequest(
    id: string,
    status: 'Accepted' | 'Declined',
  ) {
    try {
      const requestRef = doc(db, 'connectionRequests', id)
      const requestSnapshot = await getDoc(requestRef)

      if (!requestSnapshot.exists()) {
        notify('Connection request no longer exists.')
        return
      }

      const requestData = requestSnapshot.data()

      // The request must be Accepted FIRST: the rules check it before they
      // allow the accepted-connection record to be created.
      await updateDoc(requestRef, { status })

      if (status === 'Accepted') {
        try {
          const participants = [
            requestData.fromUid,
            requestData.toUid,
          ].sort()

          await setDoc(
            doc(db, 'acceptedConnections', participants.join('_')),
            {
              participants,
              createdAt: serverTimestamp(),
            },
          )
        } catch (connectionError) {
          console.error('Unable to save accepted connection record:', connectionError)
        }
      }

      notify(
        status === 'Accepted'
          ? 'Request accepted. You are now connected.'
          : 'Request declined.',
      )
    } catch (error) {
      console.error('Unable to update connection request:', error)
      notify('Unable to update this request.')
    }
  }

  async function shareWorkspace() {
    if (!selectedSpace) return

    const text = `Check out ${selectedSpace.name} in ${selectedSpace.location} on PowerPass.`

    try {
      if (navigator.share) {
        await navigator.share({
          title: selectedSpace.name,
          text,
        })
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text)
        notify('Workspace details copied.')
      } else {
        notify(text)
      }
    } catch {
      notify('Sharing was cancelled.')
    }
  }

  async function editProfile() {
    const value = window.prompt('Enter your display name:', profileName)

    if (value?.trim()) {
      setProfileName(value.trim())
      await updateOwnProfile({ name: value.trim() })
      notify('Display name updated.')
    }
  }

  async function editWorkType() {
    const value = window.prompt(
      'What kind of work do you do? (e.g. UI/UX Designer)',
      profileWorkType,
    )

    if (value === null) return

    const next = value.trim()

    if (next.length < 2 || next.length > 60) {
      notify('Work type must be between 2 and 60 characters.')
      return
    }

    setProfileWorkType(next)
    await updateOwnProfile({ workType: next })
    notify('Work type updated.')
  }

  async function editSkills() {
    const value = window.prompt(
      'Your skills, separated by commas (e.g. Figma, React, SEO):',
      profileSkills,
    )

    if (value === null) return

    const next = parseSkills(value)

    if (next.length === 0) {
      notify('Add at least one skill.')
      return
    }

    setProfileSkills(next.join(', '))
    await updateOwnProfile({ skills: next })
    notify('Skills updated.')
  }

  function renderWorkspaceCard(space: WorkspaceItem) {
    return (
      <article className="space-card" key={space.id}>
        <div className="space-image">
          <img src={space.image} alt={space.name} />
          <span className="score-pill">
            <span /> {space.score} PowerScore
          </span>

          <button
            className={`save-button ${saved.includes(space.id) ? 'is-saved' : ''}`}
            onClick={() => toggleSaved(space.id)}
            aria-label="Save workspace"
          >
            <Heart
              size={18}
              fill={saved.includes(space.id) ? 'currentColor' : 'none'}
            />
          </button>
        </div>

        <div className="space-info">
          <div className="space-title-row">
            <div>
              <h3>{space.name}</h3>
              <p>
                <MapPin size={14} /> {space.location}
              </p>
            </div>

            <div className="rating">
              <Star size={14} fill="currentColor" />
              {space.rating}
            </div>
          </div>

          <div className="facility-row">
            <span><Wifi size={14} /> Wi-Fi</span>
            <span><Zap size={14} /> Power</span>
            <span><Coffee size={14} /> Lounge</span>
          </div>

          <div className="space-footer">
            <div>
              <strong>₦{space.price.toLocaleString('en-NG')}</strong>
              <small> / day</small>
            </div>

            <button onClick={() => openWorkspace(space.id)}>
              View space <ArrowUpRight size={15} />
            </button>
          </div>
        </div>
      </article>
    )
  }

  function renderProfileCards(list: PersonCard[]) {
    return (
      <div className="people-grid">
        {list.length === 0 ? (
          <div className="empty-state">
            <Users size={28} />
            <h3>No people to show</h3>
            <p>Try a different search, or check back as more members join.</p>
          </div>
        ) : (
          list.map(member => {
            const pending = requests.some(
              item =>
                item.fromUid === user.uid &&
                item.toUid === member.uid &&
                item.status === 'Pending',
            )

            const incoming = requests.some(
              item =>
                item.fromUid === member.uid &&
                item.toUid === user.uid &&
                item.status === 'Pending',
            )

            const accepted = requests.some(
              item =>
                item.status === 'Accepted' &&
                (
                  (item.fromUid === user.uid && item.toUid === member.uid) ||
                  (item.fromUid === member.uid && item.toUid === user.uid)
                ),
            )

            const sharedId =
              attendeeWorkspaceByUid.get(member.uid) ?? member.workspaceId

            const sharedWorkspace = workspaces.find(
              space => String(space.id) === sharedId,
            )

            const similar = similarFields(profileWorkType, member.workType)

            return (
              <article className="person-card" key={member.uid}>
                <div className="person-avatar">
                  {member.displayName.slice(0, 2).toUpperCase()}
                </div>

                <div>
                  <strong>{member.displayName}</strong>
                  <p>
                    {member.role ? `${roleLabel(member.role)} · ` : ''}
                    {member.workType}
                  </p>
                  <small>
                    {sharedWorkspace
                      ? `Also booked ${sharedWorkspace.name}`
                      : similar
                        ? `Similar field · ${fieldCategory(member.workType)}`
                        : member.organisation || fieldCategory(member.workType)}
                  </small>
                  {member.skills && member.skills.length > 0 && (
                    <small style={{ display: 'block' }}>
                      {member.skills.slice(0, 3).join(' · ')}
                    </small>
                  )}
                </div>

                {accepted ? (
                  <button onClick={() => navigate('messages')}>Message</button>
                ) : incoming ? (
                  <button onClick={() => navigate('requests')}>Respond</button>
                ) : (
                  <button
                    onClick={() => {
                      setRequestTarget(member)
                      setRequestMessage(
                        `Hello ${member.displayName}, I would like to connect with you on PowerPass.`,
                      )
                    }}
                    disabled={pending}
                  >
                    {pending ? 'Requested' : 'Connect'}
                  </button>
                )}
              </article>
            )
          })
        )}
      </div>
    )
  }

  function renderBookings() {
    return (
      <section className="workspace-grid">
        {bookings.length === 0 ? (
          <div className="empty-state">
            <CalendarDays size={30} />
            <h3>No bookings yet</h3>
            <p>Your booking requests will appear here.</p>
            <button onClick={() => navigate('discover')}>
              Explore workspaces
            </button>
          </div>
        ) : (
          bookings.map(booking => {
            const token = booking.qrToken || ''

            const verificationUrl = token
              ? `${window.location.origin}/?booking=${encodeURIComponent(token)}`
              : ''

            return (
              <article className="space-card booking-list-card" key={booking.id}>
                <div className="space-info">
                  <div className="space-title-row">
                    <div>
                      <h3>{booking.workspaceName}</h3>
                      <p>
                        <MapPin size={14} /> {booking.location}
                      </p>
                    </div>

                    <span className="booking-status">
                      {booking.status === 'Pending'
                        ? 'Awaiting payment'
                        : booking.status}
                    </span>
                  </div>

                  <div className="facility-row">
                    <span><CalendarDays size={14} /> {booking.date}</span>
                    <span><Users size={14} /> {booking.guests} people</span>
                  </div>

                  {booking.status === 'Pending' && (
                    <p className="section-subtitle">
                      Your booking request has been created, but payment has not
                      been completed. Your workspace is not confirmed.
                    </p>
                  )}

                  {booking.status === 'Confirmed' && (
                    <p className="section-subtitle">
                      Your booking has been confirmed.
                    </p>
                  )}

                  <div className="space-footer">
                    <div>
                      <strong>₦{booking.total.toLocaleString('en-NG')}</strong>
                      <small> estimated total</small>
                    </div>

                    {booking.status === 'Pending' && (
                      <button onClick={() => void cancelBooking(booking)}>
                        <X size={15} /> Cancel
                      </button>
                    )}

                    {booking.status === 'Cancelled' && (
                      <button onClick={() => void deleteBooking(booking)}>
                        <Trash2 size={15} /> Delete
                      </button>
                    )}
                  </div>

                  <div className="booking-qr-section">
                    <div className="booking-qr-heading">
                      <div>
                        <span className="booking-qr-label">
                          <CheckCircle2 size={15} /> BOOKING QR CODE
                        </span>
                        <h4>Your booking pass</h4>
                      </div>

                      <span>Entry not verified</span>
                    </div>

                    {token ? (
                      <>
                        <div className="booking-qr-image">
                          <QRCodeSVG
                            value={verificationUrl}
                            size={190}
                            level="H"
                            includeMargin
                          />
                        </div>

                        <p className="booking-qr-hint">
                          This QR code identifies your booking. Staff must
                          independently confirm your booking and payment
                          before allowing entry.
                        </p>

                        <button
                          type="button"
                          onClick={() => {
                            if (navigator.clipboard) {
                              void navigator.clipboard.writeText(verificationUrl)
                              notify('Booking verification link copied.')
                            } else {
                              notify('Clipboard is not available in this browser.')
                            }
                          }}
                        >
                          <Share2 size={15} /> Copy verification link
                        </button>
                      </>
                    ) : (
                      <div className="booking-qr-placeholder">
                        <span className="booking-spinner" />
                        <p>Booking QR code is unavailable.</p>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            )
          })
        )}
      </section>
    )
  }

  function renderRequests() {
    return (
      <section className="detail-section">
        <h2>Incoming requests</h2>
        <p className="section-subtitle">
          Review professional connection requests sent to your profile.
        </p>

        {incomingRequests.length === 0 ? (
          <div className="empty-state">
            <Handshake size={28} />
            <h3>No incoming requests</h3>
            <p>New requests from other PowerPass members will appear here.</p>
          </div>
        ) : (
          incomingRequests.map(request => (
            <article className="person-card" key={request.id}>
              <div className="person-avatar">
                {request.fromName.slice(0, 2).toUpperCase()}
              </div>

              <div>
                <strong>{request.fromName}</strong>
                <p>{roleLabel(request.fromRole)} · {request.fromTitle}</p>
                <small>{request.message}</small>
              </div>

              <span className="booking-status">{request.status}</span>

              {request.status === 'Pending' && (
                <>
                  <button
                    onClick={() => void respondToRequest(request.id, 'Accepted')}
                  >
                    <CheckCircle2 size={15} /> Accept
                  </button>
                  <button
                    onClick={() => void respondToRequest(request.id, 'Declined')}
                  >
                    Decline
                  </button>
                </>
              )}
            </article>
          ))
        )}
      </section>
    )
  }

  function renderPage() {
    if (activeTab === 'bookings') {
      return (
        <>
          <section className="welcome-row">
            <div>
              <div className="eyebrow"><span /> YOUR ACTIVITY</div>
              <h1>My bookings.</h1>
              <p>Manage your workspace booking requests.</p>
            </div>
          </section>

          <section className="section-heading">
            <div>
              <h2>Booking history</h2>
              <p>{bookings.length} booking requests</p>
            </div>

            <button className="text-action" onClick={() => navigate('discover')}>
              Find a workspace <ArrowUpRight size={16} />
            </button>
          </section>

          {renderBookings()}
        </>
      )
    }

    if (activeTab === 'saved') {
      return (
        <>
          <section className="welcome-row">
            <div>
              <div className="eyebrow"><span /> YOUR COLLECTION</div>
              <h1>Saved spaces.</h1>
              <p>Workspaces you want to revisit.</p>
            </div>
          </section>

          <section className="workspace-grid">
            {savedWorkspaces.length ? (
              savedWorkspaces.map(renderWorkspaceCard)
            ) : (
              <div className="empty-state">
                <Heart size={30} />
                <h3>No saved spaces yet</h3>
                <p>Tap the heart on a workspace to save it here.</p>
                <button onClick={() => navigate('discover')}>
                  Discover spaces
                </button>
              </div>
            )}
          </section>
        </>
      )
    }

    if (activeTab === 'messages') {
      return (
        <>
          <section className="welcome-row">
            <div>
              <div className="eyebrow"><span /> YOUR CONNECTIONS</div>
              <h1>Messages.</h1>
              <p>Chat privately with your accepted PowerPass connections.</p>
            </div>
          </section>

          <MessagesPanel
            user={user}
            contacts={chatContacts}
            unreadByContact={unreadByContact}
            notify={notify}
          />
        </>
      )
    }

    if (activeTab === 'match' || activeTab === 'people') {
      return (
        <>
          <section className="welcome-row">
            <div>
              <div className="eyebrow"><span /> POWERPASS NETWORK</div>
              <h1>Find your people.</h1>
              <p>Meet freelancers and companies working in fields like yours.</p>
            </div>
          </section>

          <section className="detail-section">
            <div className="detail-score-card">
              <div className="score-icon">
                <Sparkles size={21} />
              </div>
              <div>
                <strong>PowerMatch</strong>
                <p>
                  People doing similar work to you appear first. Chat
                  eligibility starts after a request is accepted.
                </p>
              </div>
            </div>

            <div className="booking-field">
              <label>FIND BY WORK TYPE OR NAME</label>
              <input
                value={workTypeFilter}
                onChange={event => setWorkTypeFilter(event.target.value)}
                placeholder="e.g. Designer, Developer"
              />
            </div>

            <section className="filter-row">
              {(['all', 'freelancer', 'company'] as const).map(item => (
                <button
                  key={item}
                  className={`filter-chip ${roleFilter === item ? 'chosen' : ''}`}
                  onClick={() => setRoleFilter(item)}
                >
                  {item === 'all'
                    ? 'Everyone'
                    : item === 'freelancer'
                      ? 'Freelancers'
                      : 'Companies'}
                </button>
              ))}
            </section>
          </section>

          {renderProfileCards(buildPeopleList(people))}
        </>
      )
    }

    if (activeTab === 'requests') {
      return (
        <>
          <section className="welcome-row">
            <div>
              <div className="eyebrow"><span /> CONNECTION MANAGEMENT</div>
              <h1>Requests.</h1>
              <p>Manage incoming and outgoing professional requests.</p>
            </div>
          </section>

          {renderRequests()}

          <section className="detail-section">
            <h2>Sent requests</h2>

            {outgoingRequests.length === 0 ? (
              <p className="section-subtitle">You have not sent any requests.</p>
            ) : (
              outgoingRequests.map(item => (
                <article className="person-card" key={item.id}>
                  <div>
                    <strong>{item.toName}</strong>
                    <p>{item.message}</p>
                  </div>
                  <span className="booking-status">{item.status}</span>
                </article>
              ))
            )}
          </section>
        </>
      )
    }

    if (activeTab === 'profile') {
      return (
        <>
          <section className="welcome-row">
            <div>
              <div className="eyebrow"><span /> YOUR ACCOUNT</div>
              <h1>Your profile.</h1>
              <p>Manage your identity and professional visibility.</p>
            </div>
          </section>

          <section className="detail-section profile-panel">
            <div className="person-avatar profile-large-avatar">
              {initials}
            </div>

            <h2>{profileName}</h2>
            <p>{user.email}</p>

            <span className="section-subtitle">
              {profileRole ? roleLabel(profileRole) : 'Choose your account type'}
              {profileWorkType ? ` · ${profileWorkType}` : ''}
            </span>

            <div className="profile-actions">
              <button onClick={editProfile}>
                <Settings size={17} /> Edit display name
              </button>

              <button onClick={() => void editWorkType()}>
                <Laptop size={17} /> Edit work type
              </button>

              <button onClick={() => void editSkills()}>
                <Sparkles size={17} /> Edit skills
              </button>

              <button
                onClick={async () => {
                  const nextVisible = !visible
                  setVisible(nextVisible)
                  await updateOwnProfile({ visible: nextVisible })
                  notify(
                    nextVisible
                      ? 'Your profile is now discoverable.'
                      : 'Your profile is hidden from discovery.',
                  )
                }}
              >
                <Users size={17} />
                {visible ? 'Hide my profile' : 'Show my profile'}
              </button>

              <button onClick={handleSignOut} disabled={signingOut}>
                <LogOut size={17} />
                {signingOut ? 'Signing out...' : 'Sign out'}
              </button>
            </div>

            <p className="section-subtitle">
              {profileTitle} {organisation ? `· ${organisation}` : ''}
            </p>

            {parseSkills(profileSkills).length > 0 && (
              <p className="section-subtitle">
                Skills: {parseSkills(profileSkills).join(' · ')}
              </p>
            )}

            <p>{bio}</p>
          </section>
        </>
      )
    }

    return (
      <>
        <section className="welcome-row">
          <div>
            <div className="eyebrow">
              <span /> YOUR NEXT GREAT WORKDAY STARTS HERE
            </div>
            <h1>
              Find your space.
              <br />
              <span>Find your flow.</span>
            </h1>
            <p>
              Discover workspaces and the people building great things.
            </p>
          </div>

          <div className="welcome-decoration">
            <div className="deco-circle">P.</div>
          </div>
        </section>

        <section className="search-panel">
          <div className="search-field">
            <MapPin size={20} />
            <div>
              <label>LOCATION OR WORKSPACE</label>
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search Lagos, Yaba, Ikeja..."
              />
            </div>
          </div>

          <div className="search-divider" />

          <div className="search-field date-field">
            <CalendarDays size={20} />
            <div>
              <label>WHEN</label>
              <input
                type="date"
                min={today}
                value={searchDate}
                onChange={event => setSearchDate(event.target.value)}
                aria-label="Choose date"
              />
            </div>
          </div>

          <button
            className="search-button"
            onClick={() =>
              notify(
                searchDate && searchDate < today
                  ? 'Choose a future date.'
                  : `${filtered.length} demo workspaces found.`,
              )
            }
          >
            <Search size={18} /> Search spaces
          </button>
        </section>

        <section className="section-heading">
          <div>
            <h2>Explore workspaces</h2>
            <p>Demo listings around Lagos.</p>
          </div>

          <div className="view-switch">
            <button
              className={view === 'list' ? 'selected' : ''}
              onClick={() => setView('list')}
            >
              <LayoutGrid size={16} /> List
            </button>

            <button
              className={view === 'map' ? 'selected' : ''}
              onClick={() => setView('map')}
            >
              <MapIcon size={16} /> Map
            </button>
          </div>
        </section>

        <section className="filter-row">
          {categories.map(item => (
            <button
              key={item}
              className={`filter-chip ${category === item ? 'chosen' : ''}`}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}

          <button
            className="more-filter"
            onClick={() => {
              setCategory('All spaces')
              setSearch('')
              setSearchDate('')
              notify('Filters cleared.')
            }}
          >
            <SlidersHorizontal size={16} /> Clear filters
          </button>
        </section>

        {view === 'list' ? (
          <section className="workspace-grid">
            {filtered.length ? (
              filtered.map(renderWorkspaceCard)
            ) : (
              <div className="empty-state">
                No workspaces match your search.
              </div>
            )}
          </section>
        ) : (
          <section className="map-layout">
            <div className="map-canvas real-map-canvas">
              <WorkspaceMap
                workspaces={mapWorkspaces}
                onSelectWorkspace={id => openWorkspace(Number(id))}
              />
            </div>

            <div className="map-results">
              <h3>{filtered.length} spaces found</h3>

              {filtered.map(space => (
                <button
                  className="map-result"
                  key={space.id}
                  onClick={() => openWorkspace(space.id)}
                >
                  <img src={space.image} alt={space.name} />

                  <span>
                    <strong>{space.name}</strong>
                    <small>{space.location}</small>
                    <b>₦{space.price.toLocaleString('en-NG')} / day</b>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="people-section">
          <div className="section-heading">
            <div>
              <h2>People in your field</h2>
              <p>Freelancers and companies doing similar work.</p>
            </div>

            <button className="text-action" onClick={() => navigate('match')}>
              Explore people <ArrowUpRight size={16} />
            </button>
          </div>

          {renderProfileCards(buildPeopleList(people).slice(0, 6))}
        </section>

        <footer className="footer-note">
          © 2026 PowerPass
          <span>Find your space. Find your people. Find your flow.</span>
        </footer>
      </>
    )
  }

  if (profileLoading) {
    return (
      <div className={`app-shell ${dark ? 'dark' : ''}`}>
        <main className="main-content">
          <div className="page-container">
            <div className="empty-state">
              <Users size={28} />
              <h3>Preparing your PowerPass profile...</h3>
              <p>Connecting to your account.</p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (profileError) {
    return (
      <div className={`app-shell ${dark ? 'dark' : ''}`}>
        <main className="main-content">
          <div className="page-container">
            <div className="empty-state">
              <Users size={28} />
              <h3>We couldn't load your profile</h3>
              <p>
                Check your connection and try again. Your saved profile has not
                changed.
              </p>
              <button onClick={() => setProfileReload(value => value + 1)}>
                Try again
              </button>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // Profile setup. Also shown to existing members who have no work type yet.
  if (!profileRole || !profileWorkType.trim()) {
    return (
      <div className={`app-shell ${dark ? 'dark' : ''}`}>
        <main className="main-content">
          <div className="page-container">
            <section className="welcome-row">
              <div>
                <div className="eyebrow">
                  <span /> WELCOME TO POWERPASS
                </div>
                <h1>
                  How will you use <span>PowerPass?</span>
                </h1>
                <p>
                  Fill in your details, then choose the profile that best
                  describes what you want to do. You can update them later.
                </p>
              </div>
            </section>

            <section className="detail-section">
              <h2>Complete your profile</h2>
              <p className="section-subtitle">
                Your work type helps you find people doing similar work.
              </p>

              <div className="booking-field">
                <label>YOUR NAME</label>
                <input
                  value={profileName}
                  onChange={event => setProfileName(event.target.value)}
                  placeholder="Full name"
                />
              </div>

              <div className="booking-field">
                <label>WORK TYPE (REQUIRED)</label>
                <input
                  value={profileWorkType}
                  onChange={event => setProfileWorkType(event.target.value)}
                  placeholder="e.g. UI/UX Designer"
                  list="work-type-options"
                  maxLength={60}
                />
                <datalist id="work-type-options">
                  {workTypeSuggestions.map(option => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </div>

              <div className="booking-field">
                <label>YOUR SKILLS (REQUIRED, SEPARATE WITH COMMAS)</label>
                <input
                  value={profileSkills}
                  onChange={event => setProfileSkills(event.target.value)}
                  placeholder="e.g. Figma, Prototyping, Branding"
                  maxLength={300}
                />
              </div>

              <div className="booking-field">
                <label>PROFESSIONAL TITLE (OPTIONAL)</label>
                <input
                  value={profileTitle}
                  onChange={event => setProfileTitle(event.target.value)}
                  placeholder="e.g. Senior Product Designer"
                />
              </div>

              <div className="booking-field">
                <label>COMPANY OR ORGANISATION (OPTIONAL)</label>
                <input
                  value={organisation}
                  onChange={event => setOrganisation(event.target.value)}
                  placeholder="Organisation name"
                />
              </div>

              <div className="booking-field">
                <label>SHORT BIO (OPTIONAL)</label>
                <input
                  value={bio}
                  onChange={event => setBio(event.target.value)}
                  placeholder="What do you do?"
                />
              </div>
            </section>

            <div className="people-grid">
              <button
                className="person-card role-choice"
                onClick={() =>
                  void saveProfile(
                    'freelancer',
                    profileName,
                    profileTitle,
                    organisation,
                    bio,
                  )
                }
              >
                <Laptop size={28} />
                <span>
                  <strong>Freelancer</strong>
                  <small>
                    Find workspaces, discover opportunities and connect with
                    companies.
                  </small>
                </span>
                <ArrowUpRight />
              </button>

              <button
                className="person-card role-choice"
                onClick={() =>
                  void saveProfile(
                    'company',
                    profileName,
                    profileTitle,
                    organisation,
                    bio,
                  )
                }
              >
                <Building2 size={28} />
                <span>
                  <strong>Company</strong>
                  <small>
                    Represent an organisation, discover professionals and
                    connect with freelancers.
                  </small>
                </span>
                <ArrowUpRight />
              </button>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className={`app-shell ${dark ? 'dark' : ''}`}>
      <aside className={`sidebar ${mobileMenu ? 'mobile-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">P</div>
          <span>
            power<span className="brand-light">pass</span>
          </span>
          <button
            className="mobile-close"
            onClick={() => setMobileMenu(false)}
            aria-label="Close menu"
          >
            <X />
          </button>
        </div>

        <div className="workspace-label">WORKSPACE</div>

        <nav className="side-nav">
          <button
            className={`nav-link ${activeTab === 'discover' ? 'active' : ''}`}
            onClick={() => navigate('discover')}
          >
            <Compass size={19} /> Discover
          </button>

          <button
            className={`nav-link ${activeTab === 'bookings' ? 'active' : ''}`}
            onClick={() => navigate('bookings')}
          >
            <CalendarDays size={19} /> My bookings
          </button>

          <button
            className={`nav-link ${activeTab === 'saved' ? 'active' : ''}`}
            onClick={() => navigate('saved')}
          >
            <Bookmark size={19} /> Saved spaces
          </button>

          <button
            className={`nav-link ${activeTab === 'match' ? 'active' : ''}`}
            onClick={() => navigate('match')}
          >
            <Users size={19} /> People
          </button>

          <button
            className={`nav-link ${activeTab === 'requests' ? 'active' : ''}`}
            onClick={() => navigate('requests')}
          >
            <Handshake size={19} /> Requests
          </button>

          <button
            className={`nav-link ${activeTab === 'messages' ? 'active' : ''}`}
            onClick={() => navigate('messages')}
          >
            <MessageCircle size={19} /> Messages
            <UnreadBadge count={totalUnread} />
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon">
              <Users size={18} />
            </div>
            <strong>Work better together.</strong>
            <p>Find your people while finding your space.</p>
            <button onClick={() => navigate('match')}>
              Explore people <ArrowUpRight size={15} />
            </button>
          </div>

          <button
            className="profile-mini"
            onClick={() => navigate('profile')}
          >
            <div className="avatar">{initials}</div>
            <span>
              <strong>{profileName}</strong>
              <small>{roleLabel(profileRole)}</small>
            </span>
            <ChevronDown size={17} />
          </button>

          <button
            className="nav-link"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            <LogOut size={19} />
            {signingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      </aside>

      {mobileMenu && (
        <div
          className="mobile-overlay"
          onClick={() => setMobileMenu(false)}
        />
      )}

      <main className="main-content">
        <header className="topbar">
          <button
            className="mobile-menu"
            onClick={() => setMobileMenu(true)}
            aria-label="Open navigation menu"
          >
            <Menu />
          </button>

          <div className="breadcrumb">
            PowerPass <span>/</span>{' '}
            <strong>
              {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
            </strong>
          </div>

          <div className="top-actions">
            <button
              className="icon-button"
              onClick={() => setDark(value => !value)}
              title="Toggle theme"
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>

            <button
              className="icon-button notification"
              onClick={() => setNotificationOpen(value => !value)}
              title="Notifications"
            >
              <Bell size={19} />
            </button>

            <button
              className="top-avatar"
              onClick={() => navigate('profile')}
              aria-label="Open profile"
            >
              {initials}
            </button>
          </div>

          {notificationOpen && (
            <div className="notification-panel">
              <strong>Notifications</strong>
              {totalUnread > 0 ? (
                <>
                  <p>
                    You have {totalUnread} unread{' '}
                    {totalUnread === 1 ? 'message' : 'messages'}.
                  </p>
                  <button onClick={() => navigate('messages')}>
                    Open messages
                  </button>
                </>
              ) : (
                <>
                  <p>You are all caught up!</p>
                  <small>
                    New activity will appear here when notifications are connected.
                  </small>
                </>
              )}
              <button onClick={() => setNotificationOpen(false)}>
                Close
              </button>
            </div>
          )}
        </header>

        <div className="page-container">{renderPage()}</div>
      </main>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        <button
          className={`mobile-nav-item ${activeTab === 'discover' ? 'active' : ''}`}
          onClick={() => navigate('discover')}
        >
          <Compass size={21} />
          <span>Discover</span>
        </button>

        <button
          className={`mobile-nav-item ${activeTab === 'bookings' ? 'active' : ''}`}
          onClick={() => navigate('bookings')}
        >
          <CalendarDays size={21} />
          <span>Bookings</span>
        </button>

        <button
          className="mobile-nav-message"
          onClick={() => navigate('messages')}
          aria-label="Messages"
        >
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <MessageCircle size={24} />
            <UnreadBadge count={totalUnread} floating />
          </span>
          <span>Messages</span>
        </button>

        <button
          className={`mobile-nav-item ${activeTab === 'match' ? 'active' : ''}`}
          onClick={() => navigate('match')}
        >
          <Users size={21} />
          <span>People</span>
        </button>

        <button
          className={`mobile-nav-item ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => navigate('profile')}
        >
          <UserRound size={21} />
          <span>Profile</span>
        </button>
      </nav>

      {selectedSpace && (
        <div className="detail-overlay">
          <div className="detail-page">
            <header className="detail-topbar">
              <button className="detail-back" onClick={closeWorkspace}>
                <X size={19} />
                <span>Back to discovery</span>
              </button>

              <div className="detail-brand">
                power<span>pass</span>
              </div>

              <button className="detail-share" onClick={shareWorkspace}>
                <Share2 size={17} /> Share space
              </button>
            </header>

            <div className="detail-container">
              <div className="detail-breadcrumb">
                Discover <span>/</span> Workspaces <span>/</span>{' '}
                <strong>{selectedSpace.name}</strong>
              </div>

              <div className="detail-heading">
                <div>
                  <span className="detail-category">{selectedSpace.type}</span>
                  <h1>{selectedSpace.name}</h1>
                  <p>
                    <MapPin size={16} /> {selectedSpace.location}, Nigeria
                  </p>
                </div>

                <div className="detail-rating">
                  <Star size={17} fill="currentColor" />
                  <strong>{selectedSpace.rating}</strong>
                  <span>Demo rating</span>
                </div>
              </div>

              <section className="detail-gallery">
                <div className="gallery-main">
                  <img src={selectedSpace.image} alt={selectedSpace.name} />
                  <span className="gallery-label">Workspace preview</span>
                </div>

                <div className="gallery-side">
                  <img
                    src="https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=700"
                    alt="Workspace interior"
                  />
                  <img
                    src="https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=700"
                    alt="Meeting area"
                  />
                </div>
              </section>

              <div className="detail-layout">
                <div className="detail-main-column">
                  <section className="detail-section">
                    <div className="detail-score-card">
                      <div className="score-icon">
                        <Zap size={21} />
                      </div>
                      <div>
                        <strong>{selectedSpace.score}/100 PowerScore</strong>
                        <p>Demo workspace reliability score.</p>
                      </div>
                      <span className="score-status">Demo score</span>
                    </div>
                  </section>

                  <section className="detail-section">
                    <h2>A space to do your best work.</h2>
                    <p className="detail-description">
                      Explore {selectedSpace.name} and find a setting that
                      suits your workday. This is sample listing information.
                    </p>
                  </section>

                  <section className="detail-section">
                    <h2>What this space offers</h2>
                    <p className="section-subtitle">
                      Facilities listed in this demo
                    </p>

                    <div className="amenity-grid">
                      {selectedSpace.facilities.map(facility => (
                        <div key={facility}>
                          {facility === 'Wi-Fi' ? (
                            <Wifi />
                          ) : facility === 'Power' ? (
                            <Zap />
                          ) : facility === 'Coffee' ? (
                            <Coffee />
                          ) : (
                            <Monitor />
                          )}

                          <span>
                            <strong>{facility}</strong>
                            <small>Listed facility</small>
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="detail-section">
                    <h2>Location</h2>
                    <p className="section-subtitle">
                      {selectedSpace.location}, Nigeria
                    </p>

                    <div className="detail-location-placeholder">
                      <MapPin size={26} />
                      <strong>Workspace location</strong>
                      <span>See this demo listing on the interactive map.</span>
                      <button
                        onClick={() => {
                          closeWorkspace()
                          setView('map')
                          setActiveTab('discover')
                        }}
                      >
                        Open interactive map <ArrowUpRight size={15} />
                      </button>
                    </div>
                  </section>

                  <section className="detail-section">
                    <h2>People you might meet</h2>
                    <p className="section-subtitle">
                      Members who booked this workspace and chose to be
                      discoverable. Book this space to see them.
                    </p>
                    {renderProfileCards(
                      buildPeopleList(
                        members.filter(
                          member =>
                            member.workspaceId === String(selectedSpace.id),
                        ),
                      ),
                    )}
                  </section>
                </div>

                <aside className="booking-card">
                  <div className="booking-card-top">
                    <span>WORKSPACE BOOKING</span>
                    <h2>
                      ₦{selectedSpace.price.toLocaleString('en-NG')}
                      <small> / person / day</small>
                    </h2>
                    <p>Demo price · Final prices depend on the venue.</p>
                  </div>

                  <div className="booking-field">
                    <label>
                      <CalendarDays size={15} /> SELECT YOUR DATE
                    </label>
                    <input
                      type="date"
                      value={bookingDate}
                      min={today}
                      onChange={event => setBookingDate(event.target.value)}
                    />
                  </div>

                  <div className="booking-field">
                    <label>
                      <Users size={15} /> NUMBER OF PEOPLE
                    </label>
                    <select
                      value={guestCount}
                      onChange={event =>
                        setGuestCount(Number(event.target.value))
                      }
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8].map(number => (
                        <option key={number} value={number}>
                          {number} {number === 1 ? 'person' : 'people'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="booking-price-row">
                    <span>
                      ₦{selectedSpace.price.toLocaleString('en-NG')} × {guestCount}
                    </span>
                    <strong>
                      ₦{(selectedSpace.price * guestCount).toLocaleString('en-NG')}
                    </strong>
                  </div>

                  <div className="booking-price-row booking-total">
                    <strong>Estimated total</strong>
                    <strong>
                      ₦{(selectedSpace.price * guestCount).toLocaleString('en-NG')}
                    </strong>
                  </div>

                  <button
                    type="button"
                    className="detail-book-button"
                    onClick={() => void createBooking()}
                    disabled={bookingSubmitting}
                  >
                    {bookingSubmitting ? (
                      <>
                        Saving booking...
                        <span className="booking-spinner" />
                      </>
                    ) : (
                      <>
                        Create booking request
                        <ArrowUpRight size={18} />
                      </>
                    )}
                  </button>

                  <p className="booking-disclaimer">
                    Hackathon demo: no real payment is collected. Your booking
                    request is saved to your PowerPass account in Firestore.
                    It remains pending until the test-payment stage is completed.
                  </p>

                  <div className="booking-trust">
                    <span><Zap size={15} /> Workspace discovery</span>
                    <span><Heart size={15} /> Save spaces for later</span>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </div>
      )}

      {requestTarget && (
        <div className="detail-overlay">
          <div className="detail-page request-dialog">
            <header className="detail-topbar">
              <strong>Send connection request</strong>
              <button
                className="detail-back"
                onClick={() => setRequestTarget(null)}
              >
                <X size={18} /> Close
              </button>
            </header>

            <div className="detail-container">
              <h2>Connect with {requestTarget.displayName}</h2>
              <p>{requestTarget.workType || 'PowerPass member'}</p>

              <div className="booking-field">
                <label>INTRODUCTION MESSAGE</label>
                <textarea
                  value={requestMessage}
                  onChange={event => setRequestMessage(event.target.value)}
                  rows={4}
                  maxLength={500}
                />
              </div>

              <button
                className="detail-book-button"
                onClick={() => void sendConnectionRequest(requestTarget)}
              >
                Send request <Send size={17} />
              </button>

              <p className="booking-disclaimer">
                A connection request is separate from a workspace booking.
                Chat is available after acceptance.
              </p>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div className="toast-message" role="status">
          {notice}
        </div>
      )}
    </div>
  )
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [introFinished, setIntroFinished] = useState(false)

  const bookingToken = new URLSearchParams(window.location.search).get('booking')

  useEffect(() => {
    const timer = window.setTimeout(() => setIntroFinished(true), 1200)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, currentUser => {
      setUser(currentUser)
      setCheckingAuth(false)
    })

    return unsubscribe
  }, [])

  if (bookingToken) {
    return <BookingVerificationPage token={bookingToken} />
  }

  if (checkingAuth || !introFinished) {
    return (
      <main className="powerpass-intro">
        <div className="intro-orbit" />

        <div className="intro-content">
          <div className="intro-logo">
            <span className="intro-logo-mark">P</span>
            <span>
              power<span>pass</span>
            </span>
          </div>

          <p className="intro-tagline">YOUR SPACE. YOUR PEOPLE.</p>
          <p className="intro-caption">
            A better way to work, connect and grow.
          </p>

          <div className="intro-progress">
            <span />
          </div>
        </div>

        <div className="intro-footer">POWERPASS © 2026</div>
      </main>
    )
  }

  if (!user) return <AuthScreen />

  if (
    user.providerData.some(provider => provider.providerId === 'password') &&
    !user.emailVerified
  ) {
    return <AuthScreen user={user} />
  }

  return <Dashboard user={user} />
}

export default App