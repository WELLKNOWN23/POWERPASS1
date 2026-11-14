
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { User } from 'firebase/auth'
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore'
import { ArrowLeft, MessageCircle, Send } from 'lucide-react'
import { db } from '../firebase'

type Contact = {
  uid: string
  name: string
}

type ChatConversation = {
  id: string
  participants: string[]
  lastMessage?: string
  updatedAt?: Timestamp | null
}

type ChatMessage = {
  id: string
  senderId: string
  text: string
  createdAt?: Timestamp | null
}

type MessagesProps = {
  user: User
  contacts: Contact[]
  notify: (message: string) => void
}

function getConversationId(firstUid: string, secondUid: string) {
  return [firstUid, secondUid].sort().join('_')
}

function formatMessageTime(timestamp?: Timestamp | null) {
  if (!timestamp) return ''

  return timestamp.toDate().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function Messages({ user, contacts, notify }: MessagesProps) {
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messageText, setMessageText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const selectedConversationId = selectedContact
    ? getConversationId(user.uid, selectedContact.uid)
    : ''

  // Listen for conversations belonging to the signed-in user.
  useEffect(() => {
    const conversationsQuery = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', user.uid),
    )

    const unsubscribe = onSnapshot(
      conversationsQuery,
      snapshot => {
        const items = snapshot.docs.map(item => ({
          id: item.id,
          ...item.data(),
        })) as ChatConversation[]

        items.sort((a, b) => {
          const aTime = a.updatedAt?.toMillis() ?? 0
          const bTime = b.updatedAt?.toMillis() ?? 0
          return bTime - aTime
        })

        setConversations(items)
        setLoading(false)
      },
      error => {
        console.error('Conversation listener error:', error)
        setLoading(false)
        notify('Unable to load conversations. Check your Firestore rules.')
      },
    )

    return unsubscribe
  }, [user.uid, notify])

  // Listen for messages in the selected conversation.
  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([])
      return
    }

    const messagesQuery = query(
      collection(db, 'conversations', selectedConversationId, 'messages'),
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
        console.error('Message listener error:', error)
        notify('Unable to load messages. Check your Firestore rules.')
      },
    )

    return unsubscribe
  }, [selectedConversationId, notify])

  // Open an existing conversation or create a new one.
  async function openConversation(contact: Contact) {
    if (!contact.uid || contact.uid === user.uid) return

    const conversationId = getConversationId(user.uid, contact.uid)

    try {
      await setDoc(
        doc(db, 'conversations', conversationId),
        {
          participants: [user.uid, contact.uid].sort(),
          updatedAt: serverTimestamp(),
          lastMessageSenderId: user.uid,
        },
        { merge: true },
      )

      setSelectedContact(contact)
      setMessageText('')
    } catch (error) {
      console.error('Open conversation error:', error)
      notify('Unable to open this conversation. Check your Firestore rules.')
    }
  }

  // Send a message to the selected connection.
  async function sendMessage() {
    const text = messageText.trim()

    if (!text || !selectedContact || sending) return

    if (text.length > 4000) {
      notify('Messages cannot be longer than 4,000 characters.')
      return
    }

    setSending(true)

    const conversationId = getConversationId(user.uid, selectedContact.uid)

    try {
      await addDoc(
        collection(db, 'conversations', conversationId, 'messages'),
        {
          senderId: user.uid,
          text,
          createdAt: serverTimestamp(),
          readBy: [user.uid],
        },
      )

      await updateDoc(doc(db, 'conversations', conversationId), {
        lastMessage: text,
        updatedAt: serverTimestamp(),
        lastMessageSenderId: user.uid,
      })

      setMessageText('')
    } catch (error) {
      console.error('Send message error:', error)
      notify('Message could not be sent. Check your Firestore rules.')
    } finally {
      setSending(false)
    }
  }

  const availableContacts = contacts.filter(
    contact => contact.uid && contact.uid !== user.uid,
  )

  return (
    <section style={styles.wrapper}>
      <div style={styles.heading}>
        <div>
          <div style={styles.eyebrow}>YOUR CONNECTIONS</div>
          <h1 style={styles.title}>Messages.</h1>
          <p style={styles.subtitle}>
            Chat with people whose connection requests you have accepted.
          </p>
        </div>
      </div>

      <div style={styles.chatLayout}>
        <aside style={styles.contactPanel}>
          <h2 style={styles.panelTitle}>Your connections</h2>

          {loading ? (
            <p style={styles.muted}>Loading conversations...</p>
          ) : availableContacts.length === 0 ? (
            <div style={styles.empty}>
              <MessageCircle size={28} />
              <strong>No accepted connections yet</strong>
              <p>Accept a connection request before starting a chat.</p>
            </div>
          ) : (
            availableContacts.map(contact => {
              const conversation = conversations.find(
                item => item.id === getConversationId(user.uid, contact.uid),
              )

              const active = selectedContact?.uid === contact.uid

              return (
                <button
                  key={contact.uid}
                  type="button"
                  onClick={() => void openConversation(contact)}
                  style={{
                    ...styles.contactButton,
                    ...(active ? styles.contactActive : {}),
                  }}
                >
                  <span style={styles.avatar}>
                    {contact.name.slice(0, 2).toUpperCase()}
                  </span>

                  <span style={styles.contactText}>
                    <strong>{contact.name}</strong>
                    <small>
                      {conversation?.lastMessage || 'Start a conversation'}
                    </small>
                  </span>
                </button>
              )
            })
          )}
        </aside>

        <div style={styles.chatPanel}>
          {!selectedContact ? (
            <div style={styles.chatEmpty}>
              <div style={styles.chatEmptyIcon}>
                <MessageCircle size={30} />
              </div>
              <h2>Your conversations</h2>
              <p>Select an accepted connection to start chatting.</p>
            </div>
          ) : (
            <>
              <header style={styles.chatHeader}>
                <button
                  type="button"
                  onClick={() => setSelectedContact(null)}
                  style={styles.backButton}
                  aria-label="Back to connections"
                >
                  <ArrowLeft size={19} />
                </button>

                <span style={styles.avatar}>
                  {selectedContact.name.slice(0, 2).toUpperCase()}
                </span>

                <div>
                  <strong>{selectedContact.name}</strong>
                  <small style={styles.onlineText}>
                    PowerPass connection
                  </small>
                </div>
              </header>

              <div style={styles.messageList}>
                {messages.length === 0 ? (
                  <div style={styles.firstMessage}>
                    <MessageCircle size={25} />
                    <strong>No messages yet</strong>
                    <p>Send a message to start the conversation.</p>
                  </div>
                ) : (
                  messages.map(message => {
                    const mine = message.senderId === user.uid

                    return (
                      <div
                        key={message.id}
                        style={{
                          ...styles.messageRow,
                          justifyContent: mine ? 'flex-end' : 'flex-start',
                        }}
                      >
                        <div
                          style={{
                            ...styles.bubble,
                            ...(mine ? styles.myBubble : styles.theirBubble),
                          }}
                        >
                          <p style={styles.messageText}>{message.text}</p>
                          <small
                            style={{
                              ...styles.messageTime,
                              color: mine ? '#d9f5e8' : '#777',
                            }}
                          >
                            {formatMessageTime(message.createdAt)}
                          </small>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              <form
                style={styles.composer}
                onSubmit={event => {
                  event.preventDefault()
                  void sendMessage()
                }}
              >
                <input
                  value={messageText}
                  onChange={event => setMessageText(event.target.value)}
                  placeholder={`Message ${selectedContact.name}...`}
                  maxLength={4000}
                  style={styles.messageInput}
                />

                <button
                  type="submit"
                  disabled={!messageText.trim() || sending}
                  style={{
                    ...styles.sendButton,
                    opacity: !messageText.trim() || sending ? 0.55 : 1,
                  }}
                >
                  <Send size={17} />
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  wrapper: { width: '100%' },
  heading: { marginBottom: 24 },
  eyebrow: {
    color: '#16845b',
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  title: { fontSize: 36, margin: '0 0 8px' },
  subtitle: { margin: 0, color: '#888', lineHeight: 1.6 },
  chatLayout: {
    display: 'grid',
    gridTemplateColumns: 'minmax(220px, 300px) minmax(0, 1fr)',
    minHeight: 520,
    border: '1px solid #e8e8e8',
    borderRadius: 18,
    overflow: 'hidden',
    background: '#fff',
  },
  contactPanel: {
    borderRight: '1px solid #e8e8e8',
    padding: 18,
    minWidth: 0,
  },
  panelTitle: { fontSize: 16, margin: '0 0 16px' },
  muted: { color: '#888', fontSize: 13 },
  empty: {
    display: 'grid',
    justifyItems: 'center',
    gap: 10,
    textAlign: 'center',
    padding: '30px 8px',
    color: '#888',
    fontSize: 13,
  },
  contactButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    width: '100%',
    padding: 11,
    border: 0,
    borderRadius: 12,
    background: 'transparent',
    textAlign: 'left',
    cursor: 'pointer',
    color: 'inherit',
    marginBottom: 5,
  },
  contactActive: { background: '#eaf6f0', color: '#125d40' },
  avatar: {
    width: 42,
    height: 42,
    flexShrink: 0,
    display: 'grid',
    placeItems: 'center',
    borderRadius: '50%',
    background: '#e4f3eb',
    color: '#14734d',
    fontWeight: 800,
    fontSize: 13,
  },
  contactText: { display: 'grid', gap: 5, minWidth: 0 },
  chatPanel: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    minHeight: 520,
  },
  chatEmpty: {
    flex: 1,
    display: 'grid',
    alignContent: 'center',
    justifyItems: 'center',
    textAlign: 'center',
    padding: 25,
    color: '#888',
  },
  chatEmptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    display: 'grid',
    placeItems: 'center',
    background: '#eaf6f0',
    color: '#16845b',
    marginBottom: 12,
  },
  chatHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: 15,
    borderBottom: '1px solid #e8e8e8',
  },
  backButton: {
    border: 0,
    background: 'transparent',
    cursor: 'pointer',
    padding: 5,
    color: 'inherit',
  },
  onlineText: {
    display: 'block',
    marginTop: 4,
    color: '#16845b',
    fontSize: 11,
  },
  messageList: {
    flex: 1,
    padding: 18,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    minHeight: 300,
  },
  firstMessage: {
    margin: 'auto',
    display: 'grid',
    justifyItems: 'center',
    gap: 9,
    color: '#888',
    textAlign: 'center',
    fontSize: 13,
  },
  messageRow: { display: 'flex', width: '100%' },
  bubble: {
    maxWidth: '75%',
    padding: '10px 13px 7px',
    borderRadius: 15,
    overflowWrap: 'anywhere',
  },
  myBubble: {
    background: '#14734d',
    color: '#fff',
    borderBottomRightRadius: 4,
  },
  theirBubble: {
    background: '#f0f2f1',
    color: '#222',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    margin: 0,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
  },
  messageTime: {
    display: 'block',
    textAlign: 'right',
    fontSize: 10,
    marginTop: 5,
  },
  composer: {
    display: 'flex',
    gap: 9,
    padding: 14,
    borderTop: '1px solid #e8e8e8',
  },
  messageInput: {
    flex: 1,
    minWidth: 0,
    border: '1px solid #ddd',
    borderRadius: 12,
    padding: '12px 14px',
    outline: 'none',
  },
  sendButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    border: 0,
    borderRadius: 12,
    padding: '0 16px',
    background: '#14734d',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
  },
}
