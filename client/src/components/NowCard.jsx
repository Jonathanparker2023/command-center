import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'

const energyColors = {
  low: '#6b7280',
  moderate: '#a78bfa',
  high: '#34d399',
}

export default function NowCard({ task, loading, onComplete }) {
  const [showReflect, setShowReflect] = useState(false)
  const [outcome, setOutcome] = useState(null)
  const [energy, setEnergy] = useState(null)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-1 h-1 rounded-full bg-white/20 animate-pulse" />
      </div>
    )
  }

  if (!task) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-white/20 text-sm tracking-widest uppercase">Nothing queued</p>
        <p className="text-white/10 text-xs">Tell the assistant what you're working on</p>
      </div>
    )
  }

  const handleDone = async () => {
    if (!outcome || !energy) return
    await onComplete({ outcome, rating: outcome === 'completed' ? 5 : 3, energy_level: energy, note: '' })
    setShowReflect(false)
    setOutcome(null)
    setEnergy(null)
  }

  const startTime = task.scheduled_start
    ? new Date(task.scheduled_start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={task.id}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col items-center justify-center h-full px-8 gap-8"
      >
        {/* Source label */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="text-white/25 text-xs tracking-[0.2em] uppercase"
        >
          {task.source === 'calendar' ? 'Scheduled' : task.source?.replace('_', ' ')}
          {startTime && ` · ${startTime}`}
        </motion.p>

        {/* Main task */}
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="text-center font-light leading-tight"
          style={{ fontSize: 'clamp(2rem, 6vw, 3.5rem)', letterSpacing: '-0.02em', color: '#f5f5f5' }}
        >
          {task.title}
        </motion.h1>

        {/* Energy dot */}
        {task.energy_required && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
            className="flex items-center gap-2"
          >
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: energyColors[task.energy_required] || '#6b7280' }}
            />
            <span className="text-white/30 text-xs capitalize">{task.energy_required} energy</span>
          </motion.div>
        )}

        {/* Action buttons */}
        {!showReflect ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex gap-3"
          >
            <button
              onClick={() => setShowReflect(true)}
              className="glass px-6 py-2.5 rounded-full text-sm text-white/60 hover:text-white/90 transition-all duration-200"
            >
              Done
            </button>
            <button
              onClick={() => onComplete({ outcome: 'skipped', rating: 2, energy_level: 'moderate', note: '' })}
              className="px-6 py-2.5 rounded-full text-sm text-white/25 hover:text-white/50 transition-all duration-200"
            >
              Skip
            </button>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-5 w-full max-w-sm"
          >
            <p className="text-white/40 text-xs tracking-widest uppercase">How'd it go?</p>
            <div className="flex gap-2">
              {['completed', 'partial', 'blocked'].map(o => (
                <button
                  key={o}
                  onClick={() => setOutcome(o)}
                  className={`px-4 py-2 rounded-full text-xs capitalize transition-all duration-200 ${
                    outcome === o ? 'bg-white/15 text-white' : 'glass text-white/40 hover:text-white/70'
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {['low', 'moderate', 'high'].map(e => (
                <button
                  key={e}
                  onClick={() => setEnergy(e)}
                  className={`px-4 py-2 rounded-full text-xs capitalize transition-all duration-200 ${
                    energy === e ? 'text-white' : 'text-white/30 hover:text-white/60'
                  }`}
                  style={energy === e ? { background: energyColors[e] + '33', border: `1px solid ${energyColors[e]}44` } : {}}
                >
                  {e}
                </button>
              ))}
            </div>
            <button
              onClick={handleDone}
              disabled={!outcome || !energy}
              className="px-8 py-2.5 rounded-full text-sm text-white/80 transition-all duration-200 disabled:opacity-20"
              style={outcome && energy ? { background: 'rgba(255,255,255,0.1)' } : {}}
            >
              Confirm
            </button>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
