// NEAR AI Cloud verifiable inference: one chat completion inside a TEE, then the enclave's
// signature over sha256(exact request bytes) and sha256(exact response bytes), checked locally.
import { CONFIG, SERVICE } from "./config"
import type { Answer, Inference } from "./jobs"
import type { ProposedTx, RiskFlag } from "./risk"
import { checkSignature } from "./tee"


// Attested enclave signing addresses per model, refreshed every 10 minutes. This is evidence about
// NEAR AI's enclaves, not about ownership, so a short cache is fine (owner reads are never cached).
const attestCache = new Map<string, { at: number; addresses: Set<string> }>()
async function attestedAddresses(model: string): Promise<Set<string>> {
  const hit = attestCache.get(model)
  if (hit && Date.now() - hit.at < 600_000) return hit.addresses
  const r = await fetch(`${CONFIG.nearAiBase}/attestation/report?model=${encodeURIComponent(model)}&signing_algo=ecdsa`, {
    headers: { authorization: `Bearer ${CONFIG.nearAiKey}` },
    signal: AbortSignal.timeout(30_000),
  })
  if (!r.ok) throw new Error(`attestation HTTP ${r.status}`)
  const report = (await r.json()) as { model_attestations?: { model_name?: string; signing_address?: string }[] }
  const addresses = new Set(
    (report.model_attestations ?? [])
      .filter((a) => !a.model_name || a.model_name === model)
      .map((a) => (a.signing_address ?? "").toLowerCase())
      .filter(Boolean),
  )
  attestCache.set(model, { at: Date.now(), addresses })
  return addresses
}

export const nearAi: Inference = {
  async explain(tx: ProposedTx, flags: RiskFlag[]): Promise<Answer> {
    if (!CONFIG.nearAiKey) throw new Error("NEARAI_API_KEY is not set on this runtime")
    const requestBody = JSON.stringify({
      model: SERVICE.model,
      messages: [
        { role: "system", content: SERVICE.system_prompt },
        { role: "user", content: JSON.stringify({ transaction: tx, risk_flags: flags }) },
      ],
      max_tokens: SERVICE.max_tokens,
      temperature: SERVICE.temperature,
    })
    const res = await fetch(`${CONFIG.nearAiBase}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${CONFIG.nearAiKey}`, "x-no-aliasing": "true" },
      body: requestBody,
      signal: AbortSignal.timeout(60_000),
    })
    const responseBody = await res.text()
    if (!res.ok) throw new Error(`NEAR AI HTTP ${res.status}: ${responseBody.slice(0, 160)}`)
    const json = JSON.parse(responseBody) as { id: string; model?: string; choices: { message: { content: string } }[] }
    const explanation = json.choices?.[0]?.message?.content?.trim() ?? ""
    if (!explanation) throw new Error("empty answer from the model")

    // The signature is published shortly after the completion; poll briefly.
    let signature: Answer["signature"] = null
    for (let i = 0; i < 5 && !signature; i++) {
      const s = await fetch(`${CONFIG.nearAiBase}/signature/${encodeURIComponent(json.id)}?model=${encodeURIComponent(SERVICE.model)}&signing_algo=ecdsa`, {
        headers: { authorization: `Bearer ${CONFIG.nearAiKey}` },
        signal: AbortSignal.timeout(15_000),
      })
      if (s.ok) signature = (await s.json()) as NonNullable<Answer["signature"]>
      else await Bun.sleep(800 * (i + 1))
    }
    const check = signature
      ? checkSignature({
          model: SERVICE.model,
          requestBody,
          responseBody,
          text: signature.text,
          signature: signature.signature,
          signingAddress: signature.signing_address,
        })
      : null
    if (check && signature) {
      check.attested = await attestedAddresses(SERVICE.model)
        .then((set) => set.has(signature!.signing_address.toLowerCase()))
        .catch(() => null)
    }
    return { explanation, model: json.model ?? SERVICE.model, chatId: json.id, requestBody, responseBody, signature, check }
  },
}
