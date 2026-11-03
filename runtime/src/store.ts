// JSON job ledger shared by the server and the refund tool (separate processes).
// Every operation re-reads the file, and writes are atomic (temp file + rename), so one process
// never overwrites what another recorded (e.g. a refund tx) and a crash never leaves a half file
// that would forget which payments were already used.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import type { Job, Store } from "./jobs"

export function fileStore(path: string): Store {
  mkdirSync(dirname(path), { recursive: true })
  const load = (): Map<string, Job> => {
    const m = new Map<string, Job>()
    if (existsSync(path)) for (const j of JSON.parse(readFileSync(path, "utf8")) as Job[]) m.set(j.id, j)
    return m
  }
  return {
    get: (id) => load().get(id),
    put: (job) => {
      const jobs = load()
      jobs.set(job.id, structuredClone(job))
      const tmp = `${path}.${process.pid}.tmp`
      writeFileSync(tmp, JSON.stringify([...jobs.values()], null, 2))
      renameSync(tmp, path)
    },
    list: () => [...load().values()],
  }
}
