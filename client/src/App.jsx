import { useState } from 'react'
import { motion } from 'framer-motion'
import NowCard from './components/NowCard'
import ChatDrawer from './components/ChatDrawer'
import { useNow } from './hooks/useNow'
import './index.css'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Morning'
  if (h < 17) return 'Afternoon'
  return 'Evening'
}

export default function App() {
  const [chatOpen, setChatOpen] = useState(false)
  const { data, loading, complete } = useNow()

  return (
    <div className="flex flex-col h-full select-none">
      {/* Top bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex items-center justify-between px-6 pt-8 pb-2 shrink-0"
      >
        <div>
          <p className="text-white/20 text-xs tracking-widest uppercase">{getGreeting()}</p>
          <p className="text-white/60 text-sm font-medium mt-0.5">Jon</p>
        </div>

        <div className="flex items-center gap-2">
          {data?.queue_length > 0 && (
            <span className="text-white/20 text-xs">{data.queue_length} queued</span>
          )}
        </div>
      </motion.div>

      {/* Main NOW card — takes up all remaining space */}
      <div className="flex-1 min-h-0">
        <NowCard
          task={data?.task}
          loading={loading}
          onComplete={complete}
        />
      </div>

      {/* Bottom bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="shrink-0 px-6 pb-8 pt-4 flex items-center justify-center"
      >
        <button
          onClick={() => setChatOpen(true)}
          className="glass flex items-center gap-3 px-5 py-3 rounded-full transition-all duration-200 hover:bg-white/8 active:scale-95"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span className="text-white/40 text-sm">Ask anything</span>
        </button>
      </motion.div>

      <ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  )
}
