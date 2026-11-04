import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { NearConnector as NearConnectorT } from "@hot-labs/near-connect"
import { TGAS } from "./near"

/**
 * Wallet state, backed by NEAR Connect (testnet). Wallets run in sandboxed iframes; nothing is
 * signed without the user approving it in their wallet.
 *
 * "Preview as" lets a reviewer without a testnet wallet look at the owner console for any account.
 * It is read-only and clearly labelled: it can't sign or send anything.
 */
export interface CallParams {
  receiverId: string
  method: string
  args: object
  depositYocto?: string
  tgas?: number
}

interface WalletState {
  account: string | null
  preview: boolean
  ready: boolean
  connect: () => Promise<void>
  previewAs: (account: string) => void
  disconnect: () => Promise<void>
  /** Sends one function call and returns the transaction hash. */
  call: (p: CallParams) => Promise<string>
  /** Same, plus the call's decoded return value (e.g. the job id from pay_job). */
  callValue: (p: CallParams) => Promise<{ hash: string; value: unknown }>
  /** Sends NEAR to an account and returns the transaction hash. */
  transfer: (receiverId: string, yocto: string) => Promise<string>
  /** NEP-413 signature by the connected account (proves who is asking). */
  signMessage: (message: string, recipient: string) => Promise<{ public_key: string; signature: string; nonce: string }>
}

const Ctx = createContext<WalletState | null>(null)

// Set by WalletProvider: re-reads the connected account from NEAR Connect; true if one is connected.
let refresh: (c: NearConnectorT) => Promise<boolean> = async () => false

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const [ready, setReady] = useState(false)
  const connectorRef = useRef<NearConnectorT | null>(null)
  refresh = async (c) => {
    try {
      const { accounts } = await c.getConnectedWallet()
      if (accounts[0]) {
        setAccount(accounts[0].accountId)
        setPreview(false)
        return true
      }
    } catch {
      /* not connected */
    }
    return false
  }

  useEffect(() => {
    let cancelled = false
    // Loaded lazily so the wallet code stays out of the first paint.
    import("@hot-labs/near-connect").then(async ({ NearConnector }) => {
      if (cancelled) return
      const c = new NearConnector({ network: "testnet", features: { testnet: true, signAndSendTransaction: true } })
      connectorRef.current = c
      c.on("wallet:signIn", (t) => {
        setAccount(t.accounts[0]?.accountId ?? null)
        setPreview(false)
      })
      c.on("wallet:signOut", () => setAccount(null))
      await refresh(c)
      if (!cancelled) setReady(true)
    })
    // Some wallets (Meteor Web) finish signing in inside their own window and report back late or not at
    // all; the connection is saved either way. Re-read it whenever the user comes back to this tab.
    const onFocus = () => connectorRef.current && void refresh(connectorRef.current)
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onFocus)
    return () => {
      cancelled = true
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onFocus)
    }
  }, [])

  const connect = useCallback(async () => {
    const c = connectorRef.current
    if (!c) throw new Error("Wallet library is still loading. Try again in a second.")
    // Poll the saved connection while the wallet window is open, in case its sign-in event never arrives.
    let done = false
    const poll = (async () => {
      for (let i = 0; i < 90 && !done; i++) {
        await new Promise((r) => setTimeout(r, 2000))
        if (await refresh(c)) return
      }
    })()
    try {
      await c.connect()
    } finally {
      done = (await refresh(c)) || done
    }
    void poll
  }, [])

  const disconnect = useCallback(async () => {
    if (preview) {
      setAccount(null)
      setPreview(false)
      return
    }
    await connectorRef.current?.disconnect().catch(() => undefined)
    setAccount(null)
  }, [preview])

  const callValue = useCallback(
    async ({ receiverId, method, args, depositYocto = "0", tgas = 100 }: CallParams) => {
      if (preview) throw new Error("Preview mode can't sign. Connect a NEAR testnet wallet to do this.")
      const c = connectorRef.current
      if (!c || !account) throw new Error("Connect a NEAR testnet wallet first.")
      const wallet = await c.wallet()
      const out = await wallet.signAndSendTransaction({
        signerId: account,
        receiverId,
        actions: [{ type: "FunctionCall", params: { methodName: method, args, gas: TGAS(tgas), deposit: depositYocto } }],
      } as never)
      const status = JSON.stringify((out as { status?: unknown })?.status ?? {})
      const hash = (out as { transaction?: { hash?: string } })?.transaction?.hash ?? ""
      if (status.includes("Failure")) {
        const m = status.match(/panicked: ([^"\\]+)/)
        throw Object.assign(new Error(m ? m[1] : "The transaction failed on chain."), { hash })
      }
      const sv = (out as { status?: { SuccessValue?: string } })?.status?.SuccessValue
      let value: unknown = null
      try {
        value = sv ? JSON.parse(atob(sv)) : null
      } catch {
        value = null
      }
      return { hash, value }
    },
    [account, preview],
  )
  const call = useCallback(async (p: CallParams) => (await callValue(p)).hash, [callValue])

  const transfer = useCallback(
    async (receiverId: string, yocto: string) => {
      if (preview) throw new Error("Preview mode can't sign. Connect a NEAR testnet wallet to pay.")
      const c = connectorRef.current
      if (!c || !account) throw new Error("Connect a NEAR testnet wallet first.")
      const wallet = await c.wallet()
      const out = await wallet.signAndSendTransaction({
        signerId: account,
        receiverId,
        actions: [{ type: "Transfer", params: { deposit: yocto } }],
      } as never)
      const hash = (out as { transaction?: { hash?: string } })?.transaction?.hash ?? ""
      if (JSON.stringify((out as { status?: unknown })?.status ?? {}).includes("Failure")) throw new Error("The payment failed on chain.")
      return hash
    },
    [account, preview],
  )

  const signMessage = useCallback(
    async (message: string, recipient: string) => {
      if (preview) throw new Error("Preview mode can't sign. Connect a NEAR testnet wallet.")
      const c = connectorRef.current
      if (!c || !account) throw new Error("Connect a NEAR testnet wallet first.")
      const wallet = await c.wallet()
      const nonce = crypto.getRandomValues(new Uint8Array(32))
      const signed = await wallet.signMessage({ message, recipient, nonce, signerId: account } as never)
      const s = signed as unknown as { publicKey: string; signature: string; accountId: string }
      if (s.accountId && s.accountId !== account) throw new Error(`Signed by ${s.accountId}, not ${account}.`)
      return { public_key: s.publicKey, signature: s.signature, nonce: btoa(String.fromCharCode(...nonce)) }
    },
    [account, preview],
  )

  const value = useMemo<WalletState>(
    () => ({
      account,
      preview,
      ready,
      connect,
      disconnect,
      call,
      callValue,
      transfer,
      signMessage,
      previewAs: (a) => {
        setAccount(a)
        setPreview(true)
      },
    }),
    [account, preview, ready, connect, disconnect, call, callValue, transfer, signMessage],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWallet() {
  const v = useContext(Ctx)
  if (!v) throw new Error("useWallet must be used inside <WalletProvider>")
  return v
}
