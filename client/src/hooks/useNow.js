import { useState, useEffect, useCallback } from 'react'

export function useNow() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch('/api/now')
      const json = await res.json()
      setData(json)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch_()
    const interval = setInterval(fetch_, 60_000)
    return () => clearInterval(interval)
  }, [fetch_])

  const complete = useCallback(async ({ outcome, rating, energy_level, note }) => {
    if (!data?.task?.id) return
    setLoading(true)
    await fetch('/api/now/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: data.task.id, outcome, rating, energy_level, note }),
    })
    await fetch_()
  }, [data, fetch_])

  return { data, loading, refresh: fetch_, complete }
}
