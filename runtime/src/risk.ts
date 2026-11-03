// Deterministic risk flags for a NEAR transaction someone is about to sign.
// These run before the model, never depend on it, and are what the answer must always include.

export interface ProposedAction {
  /** near-api-js / wallet-selector style: "FunctionCall" | "Transfer" | "AddKey" | "DeleteKey" | "DeleteAccount" | "DeployContract" | "Stake" | ... */
  type: string
  params?: Record<string, unknown>
}
export interface ProposedTx {
  signer_id?: string
  receiver_id: string
  actions: ProposedAction[]
}

export type Severity = "high" | "medium" | "info"
export interface RiskFlag {
  code: string
  severity: Severity
  message: string
}

const YOCTO = 10n ** 24n
const big = (v: unknown) => {
  try {
    return BigInt(String(v ?? "0"))
  } catch {
    return 0n
  }
}
const isMax = (v: unknown) => {
  const s = String(v ?? "")
  return s.length >= 30 || s === "340282366920938463463374607431768211455" // u128::MAX
}

export function riskFlags(tx: ProposedTx): RiskFlag[] {
  const flags: RiskFlag[] = []
  const add = (code: string, severity: Severity, message: string) => flags.push({ code, severity, message })
  if (!tx || typeof tx.receiver_id !== "string" || !Array.isArray(tx.actions) || tx.actions.length === 0) {
    return [{ code: "malformed", severity: "high", message: "The transaction has no receiver or no actions. Don't sign something you can't read." }]
  }
  let total = 0n
  for (const a of tx.actions) {
    const p = a.params ?? {}
    switch (a.type) {
      case "AddKey": {
        const access = JSON.stringify(p.accessKey ?? p.access_key ?? {})
        if (access.includes("FullAccess") || access.includes('"fullAccess"') || !access.includes("FunctionCall")) {
          add("full_access_key", "high", "Adds a FULL-ACCESS key: whoever holds it can take everything in the account.")
        } else {
          add("function_call_key", "medium", "Adds a limited key that can call a contract on your behalf and spend gas allowance.")
        }
        break
      }
      case "DeleteAccount":
        add("delete_account", "high", `Deletes the account and sends everything to ${String(p.beneficiaryId ?? p.beneficiary_id ?? "another account")}.`)
        break
      case "DeployContract":
        add("deploy_contract", "high", "Replaces the code of the account. The new code can do anything the account can.")
        break
      case "DeleteKey":
        add("delete_key", "medium", "Removes an access key. If it's your last key you can lose access.")
        break
      case "Stake":
        add("stake", "medium", "Stakes NEAR with a validator key.")
        break
      case "Transfer":
        total += big(p.deposit)
        break
      case "FunctionCall": {
        const method = String(p.methodName ?? p.method_name ?? "")
        const args = (p.args ?? {}) as Record<string, unknown>
        total += big(p.deposit)
        if (/approve|allowance|storage_withdraw/i.test(method) && Object.values(args).some(isMax)) {
          add("unlimited_approval", "high", `Calls ${method} with an unlimited amount: the receiver could move all of that token.`)
        }
        if (/^(ft_transfer|ft_transfer_call|nft_transfer|nft_transfer_call|mt_transfer|mt_batch_transfer)$/.test(method)) {
          add("moves_assets", "info", `Moves tokens or NFTs out via ${method} to ${String(args.receiver_id ?? tx.receiver_id)}.`)
        }
        if (method === "nft_approve" || method === "nft_revoke_all") add("nft_approval", "medium", `${method} changes who may move your NFT.`)
        if (/^(w_execute|execute|exec|multicall|batch)/i.test(method)) {
          add("opaque_call", "medium", `${method} runs other actions inside it. Read the inner actions before signing.`)
        }
        if (big(p.gas) >= 300n * 10n ** 12n) add("max_gas", "info", "Attaches the maximum gas. Normal for complex calls, but the call can do a lot.")
        break
      }
      default:
        add("unknown_action", "medium", `Unfamiliar action type "${a.type}".`)
    }
  }
  if (total >= 10n * YOCTO) add("large_value", "high", `Sends ${Number(total / 10n ** 21n) / 1000} NEAR in total.`)
  // 1 yoctoNEAR is a security deposit many calls require, not a payment; only report >= 0.001 NEAR.
  else if (total >= 10n ** 21n) add("value", "info", `Sends ${Number(total / 10n ** 21n) / 1000} NEAR in total.`)
  if (!/\.(near|testnet)$/.test(tx.receiver_id) && !/^[0-9a-f]{64}$/.test(tx.receiver_id) && !/^0x[0-9a-f]{40}$/.test(tx.receiver_id)) {
    add("unusual_receiver", "medium", `The receiver ${tx.receiver_id} is not a .near/.testnet name. Check it's the one you mean.`)
  }
  return flags
}
