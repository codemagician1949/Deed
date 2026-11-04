import { useState } from "react"
import { motion } from "motion/react"
import { Eye, Loader2, Wallet } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useWallet } from "@/lib/wallet"
import { useDeeds } from "@/lib/data"
import { CONFIG } from "@/lib/config"

export function ConnectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { connect, previewAs, ready } = useWallet()
  const { deeds } = useDeeds()
  const [busy, setBusy] = useState(false)
  const owners = Array.from(new Set(deeds.flatMap((d) => [d.owner, d.listing?.seller ?? ""]).filter((o) => o && o !== CONFIG.deed)))

  const onConnect = async () => {
    setBusy(true)
    try {
      onOpenChange(false)
      await connect()
    } catch (e) {
      toast.error("Couldn't connect", { description: e instanceof Error ? e.message : "Try another wallet." })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-3xl font-normal">Connect a wallet</DialogTitle>
          <DialogDescription>
            Your wallet is how Deed knows which names you own. Nothing moves unless you approve it in your wallet. Deed runs on
            NEAR <b>testnet</b>; testnet coins have no cash value.
          </DialogDescription>
        </DialogHeader>

        <Button className="h-11 w-full rounded-xl" onClick={onConnect} disabled={!ready || busy}>
          {busy || !ready ? <Loader2 className="animate-spin" /> : <Wallet />} Connect a NEAR testnet wallet
        </Button>
        <p className="-mt-2 text-center text-[11px] text-muted-foreground">
          Meteor, Intear and other NEAR wallets. No wallet yet? Create a free testnet account in{" "}
          <a className="underline" href="https://wallet.meteorwallet.app" target="_blank" rel="noreferrer">
            Meteor Wallet
          </a>{" "}
          (switch its network to Testnet), then get test NEAR from{" "}
          <a className="underline" href="https://near-faucet.io" target="_blank" rel="noreferrer">
            near-faucet.io
          </a>
          .
        </p>

        {owners.length > 0 && (
          <div className="space-y-2 border-t border-border pt-4">
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Or look around as an owner</div>
            <p className="text-xs text-muted-foreground">Read-only preview: shows the owner's view of real data, but can't sign anything.</p>
            {owners.map((o, i) => (
              <motion.div key={o} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}>
                <Button
                  variant="outline"
                  className="h-10 w-full justify-start rounded-xl"
                  onClick={() => {
                    previewAs(o)
                    onOpenChange(false)
                  }}
                >
                  <Eye /> <span className="truncate font-mono text-xs">{o}</span>
                </Button>
              </motion.div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
