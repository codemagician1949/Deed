// Evaluates Preflight's deterministic risk flags on the labelled set (runtime/eval/cases.json).
// Mapping: any "high" flag → danger; else any "medium" → check; else safe.
// A "dangerous miss" is a danger case rated safe; a "false alarm" is a safe case rated check/danger.
//   bun run eval            # flags only (offline, free)
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { riskFlags, type ProposedTx } from "../src/risk"

type Label = "safe" | "check" | "danger"
const { cases } = JSON.parse(readFileSync(join(import.meta.dir, "cases.json"), "utf8")) as {
  cases: { id: string; label: Label; why: string; tx: ProposedTx }[]
}
const rate = (codes: { severity: string }[]): Label =>
  codes.some((f) => f.severity === "high") ? "danger" : codes.some((f) => f.severity === "medium") ? "check" : "safe"

const rows = cases.map((c) => {
  const t0 = performance.now()
  const flags = riskFlags(c.tx)
  const ms = performance.now() - t0
  return { ...c, got: rate(flags), flags: flags.map((f) => `${f.severity}:${f.code}`), ms }
})
const order: Label[] = ["safe", "check", "danger"]
const confusion = Object.fromEntries(order.map((l) => [l, Object.fromEntries(order.map((g) => [g, rows.filter((r) => r.label === l && r.got === g).length]))]))
const dangerousMisses = rows.filter((r) => r.label === "danger" && r.got === "safe")
const underRated = rows.filter((r) => order.indexOf(r.got) < order.indexOf(r.label))
const falseAlarms = rows.filter((r) => r.label === "safe" && r.got !== "safe")
const exact = rows.filter((r) => r.got === r.label).length

let md = `# Preflight risk-flag evaluation\n\nDeterministic flags only ([src/risk.ts](../src/risk.ts)), on ${rows.length} labelled transactions ([cases.json](cases.json): ${rows.filter((r) => r.label === "safe").length} safe, ${rows.filter((r) => r.label === "check").length} check, ${rows.filter((r) => r.label === "danger").length} danger). The set and labels were written by the team, so this is a sanity check, not an independent benchmark. The AI explanation is evaluated separately (it needs paid inference).\n\n**Read with care:** the first run ([RESULTS-v1.md](RESULTS-v1.md): 14/24, 1 dangerous miss, 2 false alarms) found real bugs, which were fixed in src/risk.ts. Because the fixes were made looking at these same cases, this result is optimistic; a held-out set written by independent testers is the fair measure and is still to do. Cases still rated differently from their label are left as they are, not relabelled.\n\n`
md += `- Exact match: **${exact}/${rows.length}**\n- Dangerous misses (danger rated safe): **${dangerousMisses.length}**${dangerousMisses.length ? ` (${dangerousMisses.map((r) => r.id).join(", ")})` : ""}\n- Under-rated (any case rated lower than its label): **${underRated.length}**${underRated.length ? ` (${underRated.map((r) => r.id).join(", ")})` : ""}\n- False alarms (safe rated check/danger): **${falseAlarms.length}**${falseAlarms.length ? ` (${falseAlarms.map((r) => r.id).join(", ")})` : ""}\n- Latency: ${Math.max(...rows.map((r) => r.ms)).toFixed(2)} ms max per transaction (in-process); inference cost for flags: none\n\n`
md += `| label \\ rated | safe | check | danger |\n|---|---|---|---|\n` + order.map((l) => `| ${l} | ${order.map((g) => confusion[l][g]).join(" | ")} |`).join("\n") + "\n\n"
md += `| case | label | rated | flags | why |\n|---|---|---|---|---|\n` + rows.map((r) => `| ${r.id} | ${r.label} | ${r.got === r.label ? r.got : `**${r.got}**`} | ${r.flags.join(", ") || "—"} | ${r.why} |`).join("\n") + "\n"
writeFileSync(join(import.meta.dir, "RESULTS.md"), md)
console.log(md.split("\n\n| label")[0])
console.log(`\nwrote runtime/eval/RESULTS.md`)
process.exit(dangerousMisses.length ? 1 : 0)
