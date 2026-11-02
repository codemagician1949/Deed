import { motion } from "motion/react"
import { Eye, PlugZap } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useWallet } from "@/lib/wallet"
import { useDeeds } from "@/lib/data"

export function ConnectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { previewAs } = useWallet()
  const deeds = useDeeds()
  const owners = Array.from(new Set(deeds.map((d) => d.owner).filter((o) => !o.startsWith("deed-escrow"))))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-3xl font-normal">Connect a wallet</DialogTitle>
          <DialogDescription>
            Your wallet is how Deed knows which names you own. Nothing moves unless you approve it in your wallet.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border p-4">
          <PlugZap className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="text-sm">
            <div className="font-medium">NEAR wallets arrive with the testnet launch</div>
            <p className="text-muted-foreground">
              Until then you can look around as one of the sample owners. Preview mode can't sign or send anything.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Preview as</div>
          {owners.map((o, i) => (
            <motion.div key={o} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}>
              <Button
                variant="outline"
                className="h-11 w-full justify-start rounded-xl"
                onClick={() => {
                  previewAs(o)
                  onOpenChange(false)
                }}
              >
                <Eye /> <span className="font-mono text-xs">{o}</span>
              </Button>
            </motion.div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
