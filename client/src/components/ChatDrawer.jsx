import { motion, AnimatePresence } from 'framer-motion'
import { useState, useRef, useEffect } from 'react'
import { useVoice } from '../hooks/useVoice'

export default function ChatDrawer({ open, onClose }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  const { listening, speaking, startListening, stopSpeaking, speak } = useVoice({
    onTranscript: (text) => {
      setInput(text)
      sendMessage(text)
    },
  })

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 400)
      loadHistory()
    }
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadHistory() {
    try {
      const res = await fetch('/api/chat/history')
      const data = await res.json()
      setMessages(data.slice(-20))
    } catch (e) {}
  }

  async function sendMessage(text) {
    const msg = (text || input).trim()
    if (!msg) return
    setInput('')
    setLoading(true)

    const userMsg = { role: 'user', content: msg, created_at: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      })
      const data = await res.json()
      const aiMsg = { role: 'assistant', content: data.reply, created_at: new Date().toISOString() }
      setMessages(prev => [...prev, aiMsg])
      speak(data.reply)
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong.', created_at: new Date().toISOString() }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { stopSpeaking(); onClose() }}
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.6)' }}
          />

          {/* Drawer */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 flex flex-col"
            style={{ height: '72dvh', maxWidth: 680, margin: '0 auto', borderRadius: '20px 20px 0 0' }}
          >
            <div className="glass flex flex-col h-full" style={{ borderRadius: '20px 20px 0 0' }}>
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-2 shrink-0">
                <div className="w-10 h-1 rounded-full bg-white/15" />
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-5 py-2 flex flex-col gap-4">
                {messages.length === 0 && (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-white/20 text-sm">Ask me anything</p>
                  </div>
                )}
                {messages.map((m, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className="max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed"
                      style={
                        m.role === 'user'
                          ? { background: 'rgba(255,255,255,0.1)', color: '#f0f0f0', borderBottomRightRadius: 6 }
                          : { background: 'rgba(255,255,255,0.04)', color: '#bbb', borderBottomLeftRadius: 6 }
                      }
                    >
                      {m.content}
                    </div>
                  </motion.div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="glass px-4 py-3 rounded-2xl" style={{ borderBottomLeftRadius: 6 }}>
                      <div className="flex gap-1">
                        {[0, 1, 2].map(i => (
                          <div key={i} className="w-1 h-1 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input row */}
              <div className="shrink-0 px-4 py-3 flex items-center gap-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                {/* Voice button */}
                <button
                  onMouseDown={startListening}
                  onTouchStart={startListening}
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all duration-200"
                  style={listening
                    ? { background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)' }
                    : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }
                  }
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={listening ? '#ef4444' : 'rgba(255,255,255,0.5)'} strokeWidth="2" strokeLinecap="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                </button>

                {/* Text input */}
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder={listening ? 'Listening...' : 'Message'}
                  className="flex-1 bg-transparent text-sm text-white/80 placeholder-white/20 outline-none"
                />

                {/* Send button */}
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || loading}
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 disabled:opacity-20"
                  style={{ background: input.trim() ? 'rgba(255,255,255,0.12)' : 'transparent' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
