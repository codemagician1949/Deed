// The final verdict a client should act on: the stricter of the model's verdict and the deterministic
// flags' rating. The model is told never to contradict a flag, but it sometimes does (a full-access key,
// flagged high, was answered "CHECK FIRST"), so the flags set a floor in code. The model's signed text
// is left untouched; the floor is applied next to it and marked as raised.
import type { RiskFlag } from "./risk"

export type Verdict = "SAFE TO SIGN" | "CHECK FIRST" | "DO NOT SIGN"
const RANK: Verdict[] = ["SAFE TO SIGN", "CHECK FIRST", "DO NOT SIGN"]

export function modelVerdict(text: string): Verdict | null {
  const m = text.match(/Verdict:\s*(SAFE TO SIGN|CHECK FIRST|DO NOT SIGN)/i)
  return m ? (m[1].toUpperCase() as Verdict) : null
}

export function flagFloor(flags: Pick<RiskFlag, "severity">[]): Verdict {
  return flags.some((f) => f.severity === "high") ? "DO NOT SIGN" : flags.some((f) => f.severity === "medium") ? "CHECK FIRST" : "SAFE TO SIGN"
}

export function finalVerdict(text: string, flags: Pick<RiskFlag, "severity">[]): { model: Verdict | null; floor: Verdict; final: Verdict; raised: boolean } {
  const model = modelVerdict(text)
  const floor = flagFloor(flags)
  const final = RANK[Math.max(RANK.indexOf(floor), model ? RANK.indexOf(model) : RANK.indexOf("CHECK FIRST"))]
  return { model, floor, final, raised: final !== model }
}
