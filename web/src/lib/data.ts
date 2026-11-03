import { useCallback, useEffect, useState } from "react"
import { loadDeed, loadDeedIds, type LiveDeed } from "./live"

/** Every page reads live NEAR testnet data through these hooks. */
export const DATA_SOURCE = "testnet" as const

// Results are cached briefly and in-flight requests are shared, so several components asking for
// the same Deed at once cause one set of network calls (the public APIs are rate-limited).
const cache = new Map<string, { at: number; deed: Promise<LiveDeed | null> }>()
let idsCache: { at: number; ids: Promise<string[]> } | null = null
const FRESH_MS = 20_000

function getDeed(id: string, force = false): Promise<LiveDeed | null> {
  const hit = cache.get(id)
  if (!force && hit && Date.now() - hit.at < FRESH_MS) return hit.deed
  const deed = loadDeed(id)
  cache.set(id, { at: Date.now(), deed })
  deed.catch(() => cache.delete(id))
  return deed
}

async function getAll(force = false): Promise<LiveDeed[]> {
  if (force || !idsCache || Date.now() - idsCache.at > FRESH_MS) {
    const ids = loadDeedIds()
    idsCache = { at: Date.now(), ids }
    ids.catch(() => (idsCache = null))
  }
  const deeds = await Promise.all((await idsCache.ids).map((id) => getDeed(id, force)))
  return deeds.filter((d): d is LiveDeed => !!d)
}

function useLoad<T>(fn: (force: boolean) => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const run = useCallback(
    (force = false) => {
      setLoading(true)
      setError(null)
      return fn(force)
        .then((d) => setData(d))
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setLoading(false))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  )
  useEffect(() => {
    void run()
  }, [run])
  return { data, error, loading, reload: () => run(true) }
}

export function useDeeds() {
  const r = useLoad(getAll, [])
  return { deeds: r.data ?? [], loading: r.loading, error: r.error, reload: r.reload }
}

export function useDeed(id: string | undefined) {
  const r = useLoad((force) => (id ? getDeed(id, force) : Promise.resolve(null)), [id])
  return { deed: r.data ?? null, loading: r.loading, error: r.error, reload: r.reload }
}
