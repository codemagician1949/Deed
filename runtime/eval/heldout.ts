// Held-out evaluation: transactions and labels written by someone outside the team, frozen in git
// BEFORE anything is run on them, so nobody can tune the flags or relabel after seeing results.
//
//   bun run eval/heldout.ts freeze eval/heldout.json    # writes eval/heldout.lock.json; commit both, then:
//   bun run eval/heldout.ts run eval/heldout.json       # flags only (free, offline)
//   bun run eval/heldout.ts run eval/heldout.json --ai  # also asks the model (needs NEARAI_API_KEY; costs inference)
//
// `run` refuses unless the cases file is committed, unchanged since that commit, and matches the lock.
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { riskFlags, type ProposedTx } from "../src/risk"

type Label = "safe" | "check" | "danger"
type Case = { id: string; label: Label; why: string; tx: ProposedTx }
const [cmd, file] = process.argv.slice(2)
if (!["freeze", "run"].includes(cmd ?? "") || !file) {
  console.error("Usage: bun run eval/heldout.ts freeze|run <cases.json> [--ai]")
  process.exit(2)
}
const bytes = readFileSync(file)
const sha = createHash("sha256").update(bytes).digest("hex")
const set = JSON.parse(bytes.toString("utf8")) as { author?: string; written_at?: string; cases: Case[] }
const lockPath = join(dirname(file), basename(file, ".json") + ".lock.json")
const git = (...a: string[]) => spawnSync("git", a, { encoding: "utf8" })

for (const c of set.cases) {
  if (!["safe", "check", "danger"].includes(c.label)) throw new Error(`${c.id}: label must be safe, check or danger`)
  if (!c.tx?.receiver_id || !Array.isArray(c.tx.actions)) throw new Error(`${c.id}: tx needs receiver_id and actions`)
}

if (cmd === "freeze") {
  writeFileSync(lockPath, JSON.stringify({ file: basename(file), sha256: sha, cases: set.cases.length, author: set.author ?? null, frozen_at: new Date().toISOString() }, null, 2) + "\n")
  console.log(`Froze ${set.cases.length} cases (sha256 ${sha.slice(0, 16)}…) in ${lockPath}.\nCommit both files now, before running anything:\n  git add ${file} ${lockPath} && git commit -m "eval: freeze held-out set"`)
  process.exit(0)
}

// run: the labels must have been committed, unchanged, before this run.
const lock = JSON.parse(readFileSync(lockPath, "utf8")) as { sha256: string; frozen_at: string }
if (lock.sha256 !== sha) throw new Error("The cases file changed after it was frozen. Re-freeze and commit before running.")
const committed = git("log", "-1", "--format=%H %cI", "--", file).stdout.trim()
if (!committed || git("diff", "--quiet", "HEAD", "--", file, lockPath).status !== 0)
  throw new Error("Commit the cases file and its lock first (labels must be fixed in git history before the run).")

const ai = process.argv.includes("--ai")
const rate = (codes: { severity: string }[]): Label =>
  codes.some((f) => f.severity === "high") ? "danger" : codes.some((f) => f.severity === "medium") ? "check" : "safe"
const verdict = (text: string): Label | null =>
  /Verdict:\s*DO NOT SIGN/i.test(text) ? "danger" : /Verdict:\s*CHECK FIRST/i.test(text) ? "check" : /Verdict:\s*SAFE TO SIGN/i.test(text) ? "safe" : null
const nearAi = ai ? (await import("../src/nearai")).nearAi : null

type Row = Case & { flags: string[]; byFlags: Label; flagMs: number; byAi?: Label | null; aiMs?: number; aiError?: string; tokens?: number }
const rows: Row[] = []
for (const c of set.cases) {
  const t0 = performance.now()
  const flags = riskFlags(c.tx)
  const row: Row = { ...c, flags: flags.map((f) => `${f.severity}:${f.code}`), byFlags: rate(flags), flagMs: performance.now() - t0 }
  if (nearAi) {
    const t1 = performance.now()
    try {
      const a = await nearAi.explain(c.tx, flags)
      row.byAi = verdict(a.explanation)
      row.tokens = (JSON.parse(a.responseBody) as { usage?: { total_tokens?: number } }).usage?.total_tokens
    } catch (e) {
      row.aiError = e instanceof Error ? e.message : String(e)
    }
    row.aiMs = performance.now() - t1
  }
  rows.push(row)
}

const order: Label[] = ["safe", "check", "danger"]
function metrics(get: (r: Row) => Label | null | undefined) {
  const scored = rows.filter((r) => get(r))
  return {
    exact: scored.filter((r) => get(r) === r.label).length,
    scored: scored.length,
    dangerousMisses: scored.filter((r) => r.label === "danger" && get(r) === "safe").map((r) => r.id),
    underRated: scored.filter((r) => order.indexOf(get(r)!) < order.indexOf(r.label)).map((r) => r.id),
    falseAlarms: scored.filter((r) => r.label === "safe" && get(r) !== "safe").map((r) => r.id),
  }
}
const f = metrics((r) => r.byFlags)
const m = ai ? metrics((r) => r.byAi) : null
const pct = (xs: number[], p: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))] : 0)
const line = (name: string, x: ReturnType<typeof metrics>) =>
  `| ${name} | ${x.exact}/${x.scored} | **${x.dangerousMisses.length}**${x.dangerousMisses.length ? ` (${x.dangerousMisses.join(", ")})` : ""} | ${x.underRated.length} | ${x.falseAlarms.length}${x.falseAlarms.length ? ` (${x.falseAlarms.join(", ")})` : ""} |`

let md = `# Held-out evaluation\n\n${rows.length} transactions written and labelled by **${set.author ?? "(author not given)"}**, frozen in git at ${committed.split(" ")[1]} (commit ${committed.slice(0, 10)}, sha256 \`${sha.slice(0, 16)}…\`) before this run on ${new Date().toISOString()}. Nothing in src/risk.ts or the prompt was changed after seeing these cases.\n\n`
md += `| Rater | Exact | Dangerous misses | Under-rated | False alarms |\n|---|---|---|---|---|\n${line("Deterministic flags (free)", f)}\n${m ? line("Model verdict (" + (await import("../src/config")).SERVICE.model + ")", m) + "\n" : ""}\n`
md += `- Flags latency: ${Math.max(...rows.map((r) => r.flagMs)).toFixed(2)} ms max, no inference cost.\n`
if (ai) {
  const ms = rows.filter((r) => r.aiMs !== undefined).map((r) => r.aiMs!)
  const tok = rows.map((r) => r.tokens ?? 0)
  md += `- Model: ${rows.filter((r) => r.aiError).length} failed answers, ${rows.filter((r) => !r.aiError && !r.byAi).length} answers without a verdict line; latency p50 ${(pct(ms, 0.5) / 1000).toFixed(1)} s, p95 ${(pct(ms, 0.95) / 1000).toFixed(1)} s; ${tok.reduce((a, b) => a + b, 0)} tokens in total (${Math.round(tok.reduce((a, b) => a + b, 0) / rows.length)} per case; cost at NEAR AI's price for the model).\n`
}
md += `\n| case | label | flags | model | flag codes | why (author's) |\n|---|---|---|---|---|---|\n`
md += rows.map((r) => `| ${r.id} | ${r.label} | ${r.byFlags === r.label ? r.byFlags : `**${r.byFlags}**`} | ${ai ? (r.aiError ? "error" : r.byAi === r.label ? r.byAi : `**${r.byAi ?? "none"}**`) : "—"} | ${r.flags.join(", ") || "—"} | ${r.why} |`).join("\n") + "\n"
const out = join(dirname(file), basename(file, ".json") + "-RESULTS.md")
writeFileSync(out, md)
console.log(md.split("\n| case")[0])
console.log(`wrote ${out}`)
