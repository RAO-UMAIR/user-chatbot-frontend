import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api'

function getStoredSession() {
  try {
    return JSON.parse(localStorage.getItem('chatbot_session')) || null
  } catch {
    return null
  }
}

function getUserId(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(payload)).sub
  } catch {
    return null
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = Array.isArray(data.detail)
      ? data.detail.map((item) => item.msg || item.message || JSON.stringify(item)).join(', ')
      : data.detail || data.message
    throw new Error(detail || `Request failed (${response.status})`)
  }
  return data
}

function App() {
  const [session, setSession] = useState(getStoredSession)
  const [authMode, setAuthMode] = useState('login')

  const signIn = (data, fallbackUser) => {
    const nextSession = {
      token: data.access_token,
      userId: data.id || getUserId(data.access_token),
      username: data.username || fallbackUser,
    }
    localStorage.setItem('chatbot_session', JSON.stringify(nextSession))
    setSession(nextSession)
  }

  const signOut = () => {
    localStorage.removeItem('chatbot_session')
    setSession(null)
    setAuthMode('login')
  }

  return session?.token ? (
    <ChatApp session={session} onSignOut={signOut} />
  ) : (
    <AuthScreen mode={authMode} setMode={setAuthMode} onSignIn={signIn} />
  )
}

function AuthScreen({ mode, setMode, onSignIn }) {
  const [form, setForm] = useState({ username: '', email: '', phone: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value })

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await request(
        mode === 'login' ? '/users/login' : '/users/signup',
        { method: 'POST', body: JSON.stringify(mode === 'login'
          ? { email: form.email, password: form.password }
          : form) },
      )
      onSignIn(data, form.username || form.email.split('@')[0])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-intro">
        <div className="brand-mark">✦</div>
        <p className="eyebrow">YOUR PERSONAL AI</p>
        <h1>Ideas become<br /><span>conversations.</span></h1>
        <p className="intro-copy">A calm, thoughtful space to ask questions, explore ideas, and get things done.</p>
        <div className="intro-orbit" aria-hidden="true"><span>✦</span><i /><b /></div>
      </div>
      <section className="auth-card">
        <div className="mobile-brand"><span className="brand-mark">✦</span> Umair's Chatbot</div>
        <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
        <p className="auth-subtitle">{mode === 'login' ? "Continue your conversation with Umair's Chatbot." : 'Start exploring a smarter way to think.'}</p>
        <form onSubmit={submit}>
          {mode === 'signup' && <Field label="Full name" name="username" value={form.username} onChange={update} placeholder="Your name" />}
          <Field label="Email address" name="email" type="email" value={form.email} onChange={update} placeholder="you@example.com" />
          {mode === 'signup' && <Field label="Phone number" name="phone" type="tel" value={form.phone} onChange={update} placeholder="+1 555 000 0000" />}
          <Field label="Password" name="password" type="password" value={form.password} onChange={update} placeholder="At least 8 characters" />
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="primary-button" disabled={loading}>{loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'} <span>→</span></button>
        </form>
        <p className="auth-switch">{mode === 'login' ? "New to Umair's Chatbot?" : 'Already have an account?'} <button onClick={() => { setError(''); setMode(mode === 'login' ? 'signup' : 'login') }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p>
      </section>
    </main>
  )
}

function Field({ label, name, type = 'text', value, onChange, placeholder }) {
  return <label className="field"><span>{label}</span><input required name={name} type={type} value={value} onChange={onChange} placeholder={placeholder} /></label>
}

function conversationTitle(messages) {
  const firstUserMessage = messages.find((item) => item.sender === 'user')?.message || ''
  return firstUserMessage ? firstUserMessage.replace(/\s+/g, ' ').trim().slice(0, 35) : 'New conversation'
}

function ChatApp({ session, onSignOut }) {
  const [chatId, setChatId] = useState(null)
  const [messages, setMessages] = useState([])
  const [conversations, setConversations] = useState([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [starting, setStarting] = useState(true)
  const [error, setError] = useState('')
  const bottomRef = useRef(null)

  const authOptions = { headers: { Authorization: `Bearer ${session.token}` } }

  const startChat = useCallback(async () => {
    setStarting(true)
    setError('')
    try {
      const data = await request(`/chat/start/${session.userId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
      })
      setChatId(data.chat_id)
      setMessages([])
      setConversations((current) => [...current, {
        id: data.chat_id,
        title: 'New conversation',
        messages: [],
      }])
    } catch (err) {
      setError(err.message)
    } finally {
      setStarting(false)
    }
  }, [session.token, session.userId])

  const selectChat = useCallback(async (id) => {
    setStarting(true)
    setError('')
    try {
      const data = await request(`/chat/history/${id}`, {
        headers: { Authorization: `Bearer ${session.token}` },
      })
      setChatId(id)
      setMessages(data.messages || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setStarting(false)
    }
  }, [session.token])

  const loadChats = useCallback(async () => {
    try {
      const data = await request('/chat/get_chat_messages', {
        headers: { Authorization: `Bearer ${session.token}` },
      })
      const loaded = (data.messages || []).map((chat) => ({
        id: chat.chat_id,
        title: conversationTitle(chat.messages || []),
        messages: chat.messages || [],
      }))
      setConversations(loaded)
      if (loaded.length > 0) {
        await selectChat(loaded[loaded.length - 1].id)
      } else {
        await startChat()
      }
    } catch (err) {
      setError(err.message)
      setStarting(false)
    }
  }, [selectChat, startChat, session.token])

  useEffect(() => {
    const timer = window.setTimeout(loadChats, 0)
    return () => window.clearTimeout(timer)
  }, [loadChats])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  const send = async (event) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text || !chatId || loading) return
    setDraft('')
    setMessages((current) => [...current, { sender: 'user', message: text }])
    setLoading(true)
    setError('')
    try {
      const data = await request(`/chat/send/${chatId}`, {
        method: 'POST',
        ...authOptions,
        body: JSON.stringify({ message: text, history: [] }),
      })
      setMessages((current) => [...current, { sender: 'ai', message: data.ai_response }])
      setConversations((current) => current.map((conversation) => conversation.id === chatId
        ? {
          ...conversation,
          title: conversationTitle([...conversation.messages, { sender: 'user', message: text }]),
          messages: [...conversation.messages, { sender: 'user', message: text }, { sender: 'ai', message: data.ai_response }],
        }
        : conversation))
    } catch (err) {
      setError(err.message)
      setMessages((current) => current.slice(0, -1))
    } finally {
      setLoading(false)
    }
  }

  return <main className="chat-shell">
    <aside className="sidebar">
      <div className="sidebar-top"><div className="brand"><span className="brand-mark">✦</span> Umair's Chatbot</div><button className="icon-button" onClick={startChat} aria-label="Start a new chat">＋</button></div>
      <button className="new-chat" onClick={startChat}>＋ <span>New conversation</span></button>
      <div className="sidebar-label">History</div>
      {conversations.map((conversation) => <button className={`conversation ${conversation.id === chatId ? 'active' : ''}`} key={conversation.id} onClick={() => selectChat(conversation.id)}><span className="conversation-icon">◌</span> {conversation.title}</button>)}
      <div className="sidebar-spacer" />
      <div className="sidebar-note">Your conversations are private and secure.</div>
      <div className="profile"><div className="avatar">{(session.username || 'U')[0].toUpperCase()}</div><div><strong>{session.username}</strong><small>Personal account</small></div><button className="logout" onClick={onSignOut} title="Sign out">↗</button></div>
    </aside>
    <section className="chat-main">
      <header className="chat-header"><div><span className="online-dot" /> Umair's Chatbot <small>AI assistant</small></div><button className="mobile-logout" onClick={onSignOut}>Sign out</button></header>
      <div className="message-area">
        {starting ? <div className="empty-state"><div className="sparkle">✦</div><h1>Welcome, {session.username}</h1><p>What would you like to explore today?</p></div> : messages.length === 0 ? <div className="empty-state"><div className="sparkle">✦</div><h1>How can I help?</h1><p>Ask me anything. I’m here to help you think, create, and discover.</p><div className="suggestions"><button onClick={() => setDraft('Help me brainstorm some ideas')}>Brainstorm ideas <span>↗</span></button><button onClick={() => setDraft('Explain something to me')}>Explain something <span>↗</span></button></div></div> : messages.map((item, index) => <div className={`message-row ${item.sender}`} key={`${index}-${item.message}`}><div className="message-avatar">{item.sender === 'ai' ? '✦' : (session.username || 'U')[0].toUpperCase()}</div><div className="message-content"><small>{item.sender === 'ai' ? "Umair's Chatbot" : 'You'}</small><p>{item.message}</p></div></div>)}
        {loading && <div className="message-row ai"><div className="message-avatar">✦</div><div className="message-content"><small>Umair's Chatbot</small><div className="typing"><i /><i /><i /></div></div></div>}
        <div ref={bottomRef} />
      </div>
      <div className="composer-wrap"><form className="composer" onSubmit={send}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(event) } }} placeholder="Message Umair's Chatbot…" rows="1" disabled={starting} /><button disabled={!draft.trim() || loading || starting} aria-label="Send message">↑</button></form><p>Press Enter to send · Shift + Enter for a new line</p>{error && <div className="chat-error">{error}</div>}</div>
    </section>
  </main>
}

export default App
