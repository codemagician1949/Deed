import { useRef } from "react"
import { motion, useScroll, useTransform } from "motion/react"
import { Coins, HandCoins, Power, Signature } from "lucide-react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Aurora } from "@/components/bits"
import { Page, Reveal } from "@/components/motion"
import { SaleStory } from "@/components/sale-story"

const STEPS = [
  {
    icon: Signature,
    title: "Claim a name",
    body: "Pick a name like preflight.bot. It becomes three things at once: the service's identity, its wallet and the token you own.",
  },
  {
    icon: Power,
    title: "Switch the service on",
    body: "You approve which AI service runs under your name and what it charges. Only the current owner can do this.",
  },
  {
    icon: Coins,
    title: "It earns",
    body: "Customers, people or AI agents, pay the name directly for each job. Every answer is signed by a secure enclave so anyone can check it.",
  },
  {
    icon: HandCoins,
    title: "Sell it whenever you like",
    body: "List it at your price. When someone buys, the name, its record and future earnings go to them. You get the price and everything you earned.",
  },
]

const FAQ = [
  {
    q: "What stops the seller from keeping access?",
    a: "The account has no passwords or keys of its own. It's run by an audited wallet program, and every time ownership changes, that program wipes every permission the old owner or their AI agents had. Deed also checks who the owner is live, on every job.",
  },
  {
    q: "What happens to money the service earned before the sale?",
    a: "It goes to the seller automatically, in the same step as the transfer. The buyer starts fresh, and everything earned after that is theirs.",
  },
  {
    q: "What if I pay and the transfer fails?",
    a: "Your payment waits in escrow. If the name doesn't arrive, the escrow sends every coin back to you in the same step.",
  },
  {
    q: "Why does the seller wait 5 minutes to get paid?",
    a: "The network operator can undo the very last transfer of a name within 5 minutes, for emergencies. So the seller's money unlocks only once the sale is final. If it's undone, you're refunded.",
  },
  {
    q: "Can the seller take the secret recipe?",
    a: "There isn't one. The service's settings are public, with a fingerprint on the page. What you buy is the name, the paying customers and the proven track record.",
  },
  {
    q: "Is this real money?",
    a: "Deed runs on the NEAR testnet, where coins have no cash value. It's built so the same contracts can move to mainnet later.",
  },
]

export function HowPage() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 70%", "end 60%"] })
  const progress = useTransform(scrollYProgress, [0, 1], [0, 1])

  return (
    <Page>
      <section className="relative">
        <Aurora hue={160} />
        <div className="relative mx-auto max-w-3xl px-4 pt-10 pb-16 text-center sm:px-6">
          <Reveal>
            <h1 className="font-heading text-5xl tracking-tight sm:text-7xl">How Deed works</h1>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">Four steps, and none of them needs you to trust a stranger.</p>
          </Reveal>
        </div>
      </section>

      <section ref={ref} className="relative mx-auto max-w-3xl px-4 pb-20 sm:px-6">
        <div className="absolute top-0 bottom-0 left-[39px] w-0.5 bg-border sm:left-[47px]">
          <motion.div className="h-full w-full origin-top bg-primary" style={{ scaleY: progress }} />
        </div>
        <div className="space-y-14">
          {STEPS.map((s, i) => (
            <Reveal key={s.title} className="relative flex gap-6">
              <motion.div
                whileInView={{ scale: [0.6, 1.1, 1] }}
                viewport={{ once: true, margin: "-120px" }}
                transition={{ duration: 0.6 }}
                className="relative z-10 flex size-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-card shadow-lg sm:size-16"
              >
                <s.icon className="size-5 text-primary sm:size-6" />
              </motion.div>
              <div className="pt-1">
                <div className="text-xs font-medium tracking-widest text-muted-foreground uppercase">Step {i + 1}</div>
                <h2 className="mt-1 font-heading text-3xl sm:text-4xl">{s.title}</h2>
                <p className="mt-2 text-muted-foreground">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <Reveal className="mb-8 text-center">
          <h2 className="font-heading text-4xl sm:text-5xl">See a sale, step by step</h2>
        </Reveal>
        <Reveal>
          <SaleStory />
        </Reveal>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-28 sm:px-6">
        <Reveal>
          <h2 className="mb-6 font-heading text-4xl sm:text-5xl">Good questions</h2>
          <Accordion className="rounded-3xl border border-border bg-card px-5">
            {FAQ.map((f) => (
              <AccordionItem key={f.q} value={f.q}>
                <AccordionTrigger className="text-base">{f.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </section>
    </Page>
  )
}
