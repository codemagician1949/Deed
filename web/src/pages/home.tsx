import { Link } from "react-router-dom"
import { motion, useScroll, useTransform } from "motion/react"
import { ArrowRight, BadgeCheck, Coins, Fingerprint, KeyRound, ScrollText, ShieldCheck, Sparkles, Store } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Aurora, SampleBadge } from "@/components/bits"
import { DeedCard } from "@/components/deed-card"
import { AnimatedNumber, Page, Reveal, Stagger, StaggerItem, ease } from "@/components/motion"
import { SaleStory } from "@/components/sale-story"
import { useDeeds } from "@/lib/data"

const WORDS = ["own", "prove", "sell"]

export function HomePage() {
  const { deeds, loading, error } = useDeeds()
  const hero = deeds.find((d) => d.status !== "listed") ?? deeds[0]
  const { scrollYProgress } = useScroll()
  const cardY = useTransform(scrollYProgress, [0, 0.3], [0, 80])
  const cardRotate = useTransform(scrollYProgress, [0, 0.3], [0, -4])

  const totals = deeds.reduce(
    (a, d) => ({ earned: a.earned + d.stats.earnedNear, jobs: a.jobs + d.stats.jobs }),
    { earned: 0, jobs: 0 },
  )

  return (
    <Page>
      {/* HERO */}
      <section className="relative">
        <Aurora />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-20 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pt-16">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease }}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur"
            >
              <Sparkles className="size-3.5 text-primary" /> Built on NEAR · NFTs that do something
            </motion.div>

            <h1 className="font-heading text-5xl leading-[0.95] tracking-tight sm:text-7xl">
              {"An AI business you can".split(" ").map((w, i) => (
                <motion.span
                  key={i}
                  className="mr-[0.22em] inline-block"
                  initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.8, delay: 0.1 + i * 0.07, ease }}
                >
                  {w}
                </motion.span>
              ))}
              <br />
              {WORDS.map((w, i) => (
                <motion.span
                  key={w}
                  className="text-gold-gradient mr-[0.22em] inline-block italic"
                  initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.8, delay: 0.5 + i * 0.15, ease }}
                >
                  {w}
                  {i < WORDS.length - 1 ? "," : "."}
                </motion.span>
              ))}
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.9, ease }}
              className="mt-6 max-w-xl text-lg text-muted-foreground"
            >
              A Deed is a name like <span className="font-medium text-foreground">preflight.bot</span> that is also a
              wallet and a working AI service. It earns money while you hold it. When you sell it, the earnings, the
              keys and the track record move to the buyer in one step, and you can't keep a back door.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 1.05, ease }}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <Button size="lg" className="h-11 rounded-full px-5 text-sm" render={<Link to="/market" />}>
                <Store /> Browse Deeds
              </Button>
              <Button size="lg" variant="outline" className="h-11 rounded-full px-5 text-sm" render={<a href="#sale" />}>
                Watch a sale <ArrowRight />
              </Button>
            </motion.div>

            <motion.dl
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.3, duration: 0.8 }}
              className="mt-10 flex flex-wrap gap-x-10 gap-y-4"
            >
              <div>
                <dt className="text-xs text-muted-foreground">Paid into Deeds</dt>
                <dd className="font-heading text-3xl">
                  <AnimatedNumber value={totals.earned} decimals={1} suffix=" NEAR" />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Payments received</dt>
                <dd className="font-heading text-3xl">
                  <AnimatedNumber value={totals.jobs} />
                </dd>
              </div>
              <div className="self-end pb-1">
                <SampleBadge />
              </div>
            </motion.dl>
          </div>

          <motion.div
            style={{ y: cardY, rotate: cardRotate }}
            initial={{ opacity: 0, scale: 0.92, rotateX: 18 }}
            animate={{ opacity: 1, scale: 1, rotateX: 0 }}
            transition={{ duration: 1.1, delay: 0.3, ease }}
            className="relative mx-auto w-full max-w-sm"
          >
            <FloatingChip className="-top-6 -left-8" delay={1.2} icon={Coins} text="Has its own wallet" />
            <FloatingChip className="top-[50%] -right-12" delay={1.4} icon={KeyRound} text="Keys move on sale" />
            <FloatingChip className="-bottom-5 left-2" delay={1.6} icon={ScrollText} text="Public track record" />
            {hero ? <DeedCard deed={hero} /> : <CardSkeleton failed={!!error} />}
          </motion.div>
        </div>
      </section>

      {/* WHAT IT IS */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-heading text-4xl tracking-tight sm:text-5xl">One thing, three jobs</h2>
          <p className="mt-4 text-muted-foreground">
            On most blockchains an NFT is a picture that points at a wallet somewhere else. On NEAR, the NFT{" "}
            <em>is</em> the account. Deed puts a business inside it.
          </p>
        </Reveal>
        <Stagger className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Fingerprint,
              title: "A name",
              body: "preflight.bot is easy to remember and impossible to fake. It's who the service is.",
            },
            {
              icon: Coins,
              title: "A wallet",
              body: "Customers pay the name directly. The money sits in the account until it goes to the owner.",
            },
            {
              icon: BadgeCheck,
              title: "A track record",
              body: "Every job, payment and owner is on a public page. Buyers see what they're getting.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <StaggerItem key={title}>
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="h-full rounded-3xl border border-border bg-card p-6"
              >
                <div className="mb-5 flex size-11 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                  <Icon className="size-5" />
                </div>
                <h3 className="font-heading text-2xl">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </motion.div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* THE SALE */}
      <section id="sale" className="relative scroll-mt-24 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal className="mb-10 max-w-2xl">
            <div className="mb-3 text-xs font-medium tracking-[0.2em] text-primary uppercase">The moment that matters</div>
            <h2 className="font-heading text-4xl tracking-tight sm:text-5xl">What happens when you sell</h2>
            <p className="mt-4 text-muted-foreground">
              Selling a business usually means trusting the seller to hand over every password. Here, the account itself
              takes the keys away. Press play.
            </p>
          </Reveal>
          <Reveal>
            <SaleStory />
          </Reveal>
        </div>
      </section>

      {/* TRUST */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <Reveal>
            <h2 className="font-heading text-4xl tracking-tight sm:text-5xl">
              Don't trust us. <span className="text-gold-gradient italic">Watch it fail.</span>
            </h2>
            <p className="mt-4 text-muted-foreground">
              We wrote down every way a seller could try to keep money or access after a sale, then wrote a test that
              tries each one for real. You can see every attempt and the exact error that stopped it.
            </p>
            <Button className="mt-6 rounded-full" render={<Link to="/proof" />}>
              <ShieldCheck /> See the safety proof
            </Button>
          </Reveal>
          <Reveal delay={0.1}>
            <AttackTicker />
          </Reveal>
        </div>
      </section>

      {/* MARKET PREVIEW */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <Reveal className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-heading text-4xl tracking-tight sm:text-5xl">Deeds right now</h2>
            <p className="mt-2 text-muted-foreground">Read live from NEAR testnet. Each one has its own wallet, earnings and history.</p>
          </div>
          <Button variant="outline" className="rounded-full" render={<Link to="/market" />}>
            See all <ArrowRight />
          </Button>
        </Reveal>
        {loading && deeds.length === 0 && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <CardSkeleton />
          </div>
        )}
        {error && deeds.length === 0 && <p className="text-sm text-destructive">Couldn't reach NEAR testnet: {error}. Refresh to try again.</p>}
        <Stagger className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {deeds.map((d) => (
            <StaggerItem key={d.id}>
              <DeedCard deed={d} compact />
            </StaggerItem>
          ))}
        </Stagger>
      </section>
    </Page>
  )
}

function CardSkeleton({ failed = false }: { failed?: boolean }) {
  return (
    <div className="h-[430px] w-full rounded-3xl border border-border bg-card/60 p-5">
      {failed ? (
        <p className="pt-40 text-center text-sm text-muted-foreground">Couldn't reach NEAR testnet. Refresh to try again.</p>
      ) : (
        <div className="h-full animate-pulse space-y-4">
          <div className="h-24 rounded-2xl bg-muted" />
          <div className="h-4 w-3/4 rounded bg-muted" />
          <div className="h-14 rounded bg-muted" />
          <div className="grid grid-cols-3 gap-2">
            <div className="h-16 rounded-xl bg-muted" />
            <div className="h-16 rounded-xl bg-muted" />
            <div className="h-16 rounded-xl bg-muted" />
          </div>
        </div>
      )}
    </div>
  )
}

function FloatingChip({
  className,
  delay,
  icon: Icon,
  text,
}: {
  className: string
  delay: number
  icon: typeof Coins
  text: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1, y: [0, -8, 0] }}
      transition={{
        opacity: { delay, duration: 0.5 },
        scale: { delay, duration: 0.5 },
        y: { delay: delay + 0.5, duration: 4, repeat: Infinity, ease: "easeInOut" },
      }}
      className={`absolute z-10 hidden items-center gap-2 rounded-full border border-border bg-background/85 px-3 py-1.5 text-xs shadow-xl backdrop-blur sm:flex ${className}`}
    >
      <Icon className="size-3.5 text-primary" /> {text}
    </motion.div>
  )
}

// Every row has a passing test against the real House of Stake wallet code (see /proof).
const TICKER = [
  ["Old owner's AI agent tries to spend", "spend refused by the wallet"],
  ["Old owner tries to sign in as the name", "NOT_AN_OWNER"],
  ["Old owner tries to sell it again", "OnlyOwner"],
  ["Old owner switches the service back on", "only the current owner"],
  ["Seller grabs the money before it's final", "revert window still open"],
]

function AttackTicker() {
  return (
    <div className="space-y-2 rounded-3xl border border-border bg-card p-4 font-mono text-xs">
      {TICKER.map(([what, err], i) => (
        <motion.div
          key={what}
          initial={{ opacity: 0, x: 20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.15 * i, duration: 0.5, ease }}
          className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2.5"
        >
          <span className="truncate font-sans text-sm">{what}</span>
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 * i + 0.4, type: "spring", stiffness: 400, damping: 15 }}
            className="shrink-0 rounded-md bg-destructive/15 px-2 py-0.5 text-destructive"
          >
            ✕ {err}
          </motion.span>
        </motion.div>
      ))}
    </div>
  )
}
