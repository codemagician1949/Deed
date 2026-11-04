//! Deed: activation registry and sale escrow for Top Level Account (TLA) names
//! that run a paid service.
//!
//! The name itself is a NEP-171 token in `registry.hos` and a keyless NEAR account
//! run by the audited `hos-wallet`. This contract adds two things on top:
//!
//! 1. **Activation**: the current owner binds `{runtime, config_hash, price, version}`
//!    to the name. Recorded only after a fresh `nft_token` read confirms the caller
//!    owns the name. The runtime serves jobs only while `activation.owner` equals the
//!    current owner, so a seller's old activation is dead after a sale (THREAT_MODEL D2).
//! 2. **Escrow sale**: the seller lists with `nft_transfer_call` (one tx, price in `msg`).
//!    The escrow owns the name while it's listed (TLA has no approvals). The rotation into
//!    the escrow already cleared the seller's grants and swept NEAR to the seller. `buy` (and
//!    `cancel`) first point payout back at the seller, then move the name, so anything paid in
//!    while listed is swept to the seller by that rotation (B3). `buy` pays the exact price and
//!    refunds the buyer if the transfer fails (C1). The seller and the royalty are paid in the same
//!    callback that confirms the transfer (v3; earlier versions held proceeds for a 5-minute window).
//! 3. **Job escrow** (v3): a customer pays `pay_job` and the contract holds the payment, bound to the
//!    current activation and to sha256 of the request. Only the runtime the activation names can
//!    `settle_job`; the contract re-reads the owner and pays the name's own wallet, or refunds the
//!    customer if the name changed hands. The runtime can `refund_job` at any time, and anyone can after
//!    `job_timeout_ns`, so a refund never depends on the operator.
//!
//!    `nft_on_transfer` only records state: the registry gives it a fixed 25 Tgas, too little
//!    for any cross-contract work (a failed receiver call makes the registry return the name).

use near_sdk::json_types::{U128, U64};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::serde_json;
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{
    env, ext_contract, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault,
    Promise, PromiseOrValue, PromiseResult,
};

pub const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
/// hos-wallet `REVERT_WINDOW_NS` (lib.rs L51 @ d85860a). Used by v2 sales only.
#[allow(dead_code)]
pub const DEFAULT_REVERT_WINDOW_NS: u64 = 5 * 60 * 1_000_000_000;
/// A pending job can be refunded by anyone after this long (15 min).
pub const DEFAULT_JOB_TIMEOUT_NS: u64 = 15 * 60 * 1_000_000_000;
/// Longest runtime URL accepted in an activation.
pub const MAX_RUNTIME_URL_LEN: usize = 200;
/// Hard cap on the resale royalty: 10%.
pub const MAX_ROYALTY_BPS: u16 = 1_000;

const GAS_VIEW: Gas = Gas::from_tgas(10);
const GAS_TRANSFER: Gas = Gas::from_tgas(120);
/// registry.set_payout_account → ext.set_payout → wallet (registry reserves 30 Tgas for its leg).
const GAS_SET_PAYOUT: Gas = Gas::from_tgas(50);
const GAS_CALLBACK: Gas = Gas::from_tgas(20);
/// The callback that checks the payout re-point, then starts the transfer and its own callback.
const GAS_AFTER_PAYOUT: Gas = Gas::from_tgas(150);
/// What `buy`/`cancel` need attached: the registry transfer chain + our callback + margin.
pub const GAS_REQUIRED_FOR_TRANSFER: Gas = Gas::from_tgas(200);

// ---------- external interfaces ----------

/// The subset of NEP-171 `Token` we read. Extra fields are ignored.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct TokenView {
    pub token_id: String,
    pub owner_id: AccountId,
}

#[allow(dead_code)]
#[ext_contract(ext_registry)]
trait Registry {
    fn nft_token(&self, token_id: String) -> Option<TokenView>;
    fn transfer_sub_account(&mut self, tla_id: AccountId, name: String, new_owner: AccountId);
    fn set_payout_account(&mut self, tla_id: AccountId, name: String, new_payout_account: AccountId);
}

// ---------- state ----------

#[derive(BorshStorageKey)]
#[near]
enum Key {
    Activations,
    Listings,
    Sales,
    LatestSale,
    Jobs,
    RuntimeUrls,
    MaxVersions,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Activation {
    pub owner: AccountId,
    pub runtime_id: AccountId,
    /// sha256 of the public service config (prompt, model, rules). Nothing secret.
    pub config_hash: String,
    /// Price per job, yoctoNEAR.
    pub price_yocto: U128,
    /// Strictly increasing per name across all owners.
    pub version: u32,
    /// Contract-wide unique, so an activation can never be confused with an older one.
    pub nonce: U64,
    pub activated_at_ns: U64,
}

/// What `get_activation` returns: the stored activation plus the runtime's public URL, if the owner
/// named one. A client pays only through that URL and checks the runtime reports the same id and config.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct ActivationView {
    pub owner: AccountId,
    pub runtime_id: AccountId,
    pub runtime_url: Option<String>,
    pub config_hash: String,
    pub price_yocto: U128,
    pub version: u32,
    pub nonce: U64,
    pub activated_at_ns: U64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum JobState {
    /// Payment held by this contract.
    Pending,
    /// A settle is reading the registry.
    Settling,
    /// Paid to the name's wallet; `answer_hash` = sha256 of the response bytes the runtime delivered.
    Settled { answer_hash: String },
    /// Returned to the payer.
    Refunded { reason: String },
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Job {
    pub id: U64,
    pub token_id: String,
    pub payer: AccountId,
    pub amount_yocto: U128,
    /// The runtime and activation the payment was made under; only that runtime can settle it.
    pub runtime_id: AccountId,
    pub activation_version: u32,
    pub activation_owner: AccountId,
    /// sha256 (hex) of the exact request bytes the payer will send to the runtime.
    pub request_hash: String,
    pub paid_at_ns: U64,
    pub state: JobState,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
#[serde(tag = "kind")]
pub enum ListingState {
    Active,
    Settling { buyer: AccountId },
    Cancelling,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Listing {
    pub token_id: String,
    pub seller: AccountId,
    pub price_yocto: U128,
    pub nonce: U64,
    pub listed_at_ns: U64,
    pub state: ListingState,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum SaleState {
    /// Name delivered to buyer; seller proceeds locked until `final_after_ns`.
    Pending,
    /// A claim is reading the registry.
    Claiming,
    /// Seller paid.
    Paid,
    /// Unused since v2 (kept so older stored sales still deserialize).
    Reverted,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Sale {
    pub id: U64,
    pub token_id: String,
    pub seller: AccountId,
    pub buyer: AccountId,
    pub price_yocto: U128,
    pub sold_at_ns: U64,
    pub final_after_ns: U64,
    pub state: SaleState,
    /// Resale cut to the Deed template creator, fixed at sale time (NEP-199 style).
    pub royalty_account: AccountId,
    pub royalty_yocto: U128,
}

#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct ListMsg {
    price_yocto: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Deed {
    registry: AccountId,
    revert_window_ns: u64,
    royalty_account: AccountId,
    royalty_bps: u16,
    next_nonce: u64,
    next_sale_id: u64,
    activations: LookupMap<String, Activation>,
    listings: IterableMap<String, Listing>,
    sales: LookupMap<u64, Sale>,
    /// token_id → id of its newest sale (used to block relisting while a sale is unclaimed).
    latest_sale: LookupMap<String, u64>,
    // ---- v3 ----
    job_timeout_ns: u64,
    next_job_id: u64,
    jobs: LookupMap<u64, Job>,
    /// token_id → public URL of the runtime named in its current activation.
    runtime_urls: LookupMap<String, String>,
    /// token_id → highest activation version ever recorded, kept after activations are dropped, so a
    /// later owner can never reuse a lower version.
    max_versions: LookupMap<String, u32>,
}

/// The v2 state layout, read once by `migrate`.
#[near(serializers = [borsh])]
pub struct DeedV2 {
    registry: AccountId,
    revert_window_ns: u64,
    royalty_account: AccountId,
    royalty_bps: u16,
    next_nonce: u64,
    next_sale_id: u64,
    activations: LookupMap<String, Activation>,
    listings: IterableMap<String, Listing>,
    sales: LookupMap<u64, Sale>,
    latest_sale: LookupMap<String, u64>,
}

fn is_hex64(s: &str) -> bool {
    s.len() == 64 && s.chars().all(|c| c.is_ascii_hexdigit())
}

// ---------- events (NEP-297) ----------

fn emit(event: &str, data: serde_json::Value) {
    let log = serde_json::json!({
        "standard": "deed",
        "version": "1.0.0",
        "event": event,
        "data": [data],
    });
    env::log_str(&format!("EVENT_JSON:{log}"));
}

/// `preflight.bot` → (`bot`, `preflight`); `preflight.deedbot.deedhq.testnet` →
/// (`deedbot.deedhq.testnet`, `preflight`). A leased name is always one label
/// (no dots, per the registry's `validate_name`) under its TLA account.
pub fn split_token_id(token_id: &str) -> (AccountId, String) {
    let (label, tla) = token_id
        .split_once('.')
        .unwrap_or_else(|| env::panic_str("token id must be <name>.<tla>"));
    require!(!label.is_empty() && !tla.is_empty(), "token id must be <name>.<tla>");
    let tla_id: AccountId = tla
        .parse()
        .unwrap_or_else(|_| env::panic_str("invalid tla id"));
    (tla_id, label.to_string())
}

/// Result of the single promise this callback waits on.
fn promise_ok() -> Option<Vec<u8>> {
    require!(env::promise_results_count() == 1, "expected one promise result");
    #[allow(deprecated)]
    match env::promise_result(0) {
        PromiseResult::Successful(bytes) => Some(bytes),
        PromiseResult::Failed => None,
    }
}

#[near]
impl Deed {
    #[init]
    pub fn new(
        registry: AccountId,
        royalty_account: AccountId,
        royalty_bps: u16,
        revert_window_ns: Option<U64>,
        job_timeout_ns: Option<U64>,
    ) -> Self {
        require!(royalty_bps <= MAX_ROYALTY_BPS, "royalty_bps must be at most 1000 (10%)");
        Self {
            registry,
            royalty_account,
            royalty_bps,
            // Kept only for sales made before v3; new sales pay the seller at once.
            revert_window_ns: revert_window_ns.map(|v| v.0).unwrap_or(0),
            next_nonce: 1,
            next_sale_id: 1,
            activations: LookupMap::new(Key::Activations),
            listings: IterableMap::new(Key::Listings),
            sales: LookupMap::new(Key::Sales),
            latest_sale: LookupMap::new(Key::LatestSale),
            job_timeout_ns: job_timeout_ns.map(|v| v.0).unwrap_or(DEFAULT_JOB_TIMEOUT_NS),
            next_job_id: 1,
            jobs: LookupMap::new(Key::Jobs),
            runtime_urls: LookupMap::new(Key::RuntimeUrls),
            max_versions: LookupMap::new(Key::MaxVersions),
        }
    }

    /// v2 → v3 upgrade: keeps every activation, listing and sale; adds the job escrow and runtime URLs;
    /// new sales pay the seller immediately.
    #[private]
    #[init(ignore_state)]
    pub fn migrate(job_timeout_ns: Option<U64>) -> Self {
        let old: DeedV2 = env::state_read().unwrap_or_else(|| env::panic_str("no v2 state to migrate"));
        Self {
            registry: old.registry,
            revert_window_ns: old.revert_window_ns,
            royalty_account: old.royalty_account,
            royalty_bps: old.royalty_bps,
            next_nonce: old.next_nonce,
            next_sale_id: old.next_sale_id,
            activations: old.activations,
            listings: old.listings,
            sales: old.sales,
            latest_sale: old.latest_sale,
            job_timeout_ns: job_timeout_ns.map(|v| v.0).unwrap_or(DEFAULT_JOB_TIMEOUT_NS),
            next_job_id: 1,
            jobs: LookupMap::new(Key::Jobs),
            runtime_urls: LookupMap::new(Key::RuntimeUrls),
            max_versions: LookupMap::new(Key::MaxVersions),
        }
    }

    // ===== activation =====

    /// Bind a service config to a name. Only the current registry owner can do this:
    /// the owner is read fresh from the registry in the same transaction.
    pub fn activate(
        &mut self,
        token_id: String,
        runtime_id: AccountId,
        config_hash: String,
        price_yocto: U128,
        version: u32,
        runtime_url: Option<String>,
    ) -> Promise {
        split_token_id(&token_id);
        require!(is_hex64(&config_hash), "config_hash must be a hex sha256");
        if let Some(u) = &runtime_url {
            require!(
                u.starts_with("https://") && u.len() <= MAX_RUNTIME_URL_LEN && !u.chars().any(|c| c.is_whitespace()),
                "runtime_url must be an https:// URL of at most 200 characters"
            );
        }
        require!(price_yocto.0 > 0, "price must be positive");
        require!(
            !self.listings.contains_key(&token_id),
            "name is listed for sale; cancel the listing before activating"
        );
        let floor = self.version_floor(&token_id);
        require!(version > floor, format!("version must be greater than {floor}"));
        let caller = env::predecessor_account_id();
        ext_registry::ext(self.registry.clone())
            .with_static_gas(GAS_VIEW)
            .nft_token(token_id.clone())
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_activate_owner(caller, token_id, runtime_id, config_hash, price_yocto, version, runtime_url),
            )
    }

    #[private]
    pub fn on_activate_owner(
        &mut self,
        caller: AccountId,
        token_id: String,
        runtime_id: AccountId,
        config_hash: String,
        price_yocto: U128,
        version: u32,
        runtime_url: Option<String>,
    ) -> ActivationView {
        let bytes = promise_ok().unwrap_or_else(|| env::panic_str("registry read failed; try again"));
        let token: Option<TokenView> = serde_json::from_slice(&bytes)
            .unwrap_or_else(|_| env::panic_str("unexpected registry response"));
        let owner = token
            .map(|t| t.owner_id)
            .unwrap_or_else(|| env::panic_str("name not found in registry"));
        require!(owner == caller, "only the current owner of the name can activate it");
        // Re-check after the async gap.
        require!(version > self.version_floor(&token_id), "a newer activation landed first");
        let activation = Activation {
            owner,
            runtime_id,
            config_hash,
            price_yocto,
            version,
            nonce: U64(self.take_nonce()),
            activated_at_ns: U64(env::block_timestamp()),
        };
        self.activations.insert(token_id.clone(), activation.clone());
        self.max_versions.insert(token_id.clone(), version);
        match &runtime_url {
            Some(u) => {
                self.runtime_urls.insert(token_id.clone(), u.clone());
            }
            None => {
                self.runtime_urls.remove(&token_id);
            }
        }
        let view = self.view_of(&token_id, activation);
        emit("activated", serde_json::json!({"token_id": token_id, "activation": view}));
        view
    }

    // ===== listing (NEP-171 receiver) =====

    /// Called by the registry after it has rotated the name to this contract.
    /// Return `true` to send the name back.
    pub fn nft_on_transfer(
        &mut self,
        sender_id: AccountId,
        previous_owner_id: AccountId,
        token_id: String,
        msg: String,
    ) -> PromiseOrValue<bool> {
        let _ = sender_id;
        require!(
            env::predecessor_account_id() == self.registry,
            "only the registry can deliver names"
        );
        let price = match serde_json::from_str::<ListMsg>(&msg) {
            Ok(m) if m.price_yocto.0 > 0 => m.price_yocto,
            _ => {
                emit("list_rejected", serde_json::json!({"token_id": token_id, "reason": "msg must be {\"price_yocto\":\"<positive>\"}"}));
                return PromiseOrValue::Value(true);
            }
        };
        if self.listings.contains_key(&token_id) {
            emit("list_rejected", serde_json::json!({"token_id": token_id, "reason": "already listed"}));
            return PromiseOrValue::Value(true);
        }
        if let Some(id) = self.latest_sale.get(&token_id) {
            let sale = self.sales.get(id).expect("sale index broken");
            if matches!(sale.state, SaleState::Pending | SaleState::Claiming) {
                emit("list_rejected", serde_json::json!({"token_id": token_id, "reason": "previous sale not settled yet; call claim_proceeds after the revert window"}));
                return PromiseOrValue::Value(true);
            }
        }
        split_token_id(&token_id);
        let listing = Listing {
            token_id: token_id.clone(),
            seller: previous_owner_id.clone(),
            price_yocto: price,
            nonce: U64(self.take_nonce()),
            listed_at_ns: U64(env::block_timestamp()),
            state: ListingState::Active,
        };
        self.listings.insert(token_id.clone(), listing.clone());
        // v3: the seller's activation stays while the name is listed, so the service keeps answering
        // for the seller (payments made while listed reach the seller at the sale, B3). It is dropped
        // the moment the sale completes; activation by the escrow itself is impossible.
        emit("listed", serde_json::json!({"listing": listing}));
        PromiseOrValue::Value(false)
    }

    // ===== buy =====

    /// Pay exactly the listed price. `listing_nonce` pins the exact listing you saw
    /// (THREAT_MODEL C4). Attach at least 200 Tgas.
    #[payable]
    pub fn buy(&mut self, token_id: String, expected_price: U128, listing_nonce: U64) -> Promise {
        let buyer = env::predecessor_account_id();
        let deposit = env::attached_deposit().as_yoctonear();
        let mut listing = self
            .listings
            .get(&token_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("name is not listed"));
        require!(listing.state == ListingState::Active, "a sale or cancel is already in progress");
        require!(listing.nonce == listing_nonce, "listing changed since you looked; refresh and retry");
        require!(listing.price_yocto == expected_price, "price changed since you looked; refresh and retry");
        require!(deposit == listing.price_yocto.0, "attach exactly the listed price");
        require!(buyer != listing.seller, "seller cannot buy their own listing");
        require!(
            env::prepaid_gas() >= GAS_REQUIRED_FOR_TRANSFER.saturating_add(Gas::from_tgas(30)),
            "attach at least 230 Tgas"
        );
        listing.state = ListingState::Settling { buyer: buyer.clone() };
        self.listings.insert(token_id.clone(), listing.clone());
        let (tla_id, label) = split_token_id(&token_id);
        // B3: point payout at the seller first, so the sale rotation sweeps any NEAR paid in
        // while the name was listed to the seller (not to this escrow). The transfer runs only if that
        // succeeded: a plain `.then` would run it after a failure too and strand the sweep here.
        self.payout_to(&tla_id, &label, &listing.seller).then(
            Self::ext(env::current_account_id())
                .with_static_gas(GAS_AFTER_PAYOUT)
                .on_buy_payout_set(token_id, buyer, U128(deposit)),
        )
    }

    #[private]
    pub fn on_buy_payout_set(&mut self, token_id: String, buyer: AccountId, paid: U128) -> PromiseOrValue<bool> {
        if promise_ok().is_none() {
            let mut listing = self.listings.get(&token_id).cloned().expect("listing vanished");
            listing.state = ListingState::Active;
            self.listings.insert(token_id.clone(), listing);
            let _ = Promise::new(buyer.clone()).transfer(NearToken::from_yoctonear(paid.0));
            emit(
                "sale_failed_refunded",
                serde_json::json!({"token_id": token_id, "buyer": buyer, "refund_yocto": paid, "reason": "payout re-point failed"}),
            );
            return PromiseOrValue::Value(false);
        }
        let (tla_id, label) = split_token_id(&token_id);
        PromiseOrValue::Promise(
            ext_registry::ext(self.registry.clone())
                .with_attached_deposit(ONE_YOCTO)
                .with_static_gas(GAS_TRANSFER)
                .transfer_sub_account(tla_id, label, buyer.clone())
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(GAS_CALLBACK)
                        .on_buy_resolved(token_id, buyer, paid),
                ),
        )
    }

    #[private]
    pub fn on_buy_resolved(&mut self, token_id: String, buyer: AccountId, paid: U128) -> bool {
        let mut listing = self.listings.get(&token_id).cloned().expect("listing vanished");
        if promise_ok().is_none() {
            // THREAT_MODEL C1: transfer failed → full refund, listing reopens.
            listing.state = ListingState::Active;
            self.listings.insert(token_id.clone(), listing);
            let _ = Promise::new(buyer.clone()).transfer(NearToken::from_yoctonear(paid.0));
            emit(
                "sale_failed_refunded",
                serde_json::json!({"token_id": token_id, "buyer": buyer, "refund_yocto": paid}),
            );
            return false;
        }
        self.listings.remove(&token_id);
        // The seller's service ends with the sale (THREAT_MODEL D2); jobs still pending under it are
        // refunded when settled or after the timeout.
        let dropped = self.activations.remove(&token_id);
        if let Some(a) = &dropped {
            // Keep the version high-water mark (also covers activations recorded before v3).
            let floor = a.version.max(self.max_versions.get(&token_id).copied().unwrap_or(0));
            self.max_versions.insert(token_id.clone(), floor);
        }
        self.runtime_urls.remove(&token_id);
        let id = self.next_sale_id;
        self.next_sale_id += 1;
        let now = env::block_timestamp();
        let mut sale = Sale {
            id: U64(id),
            token_id: token_id.clone(),
            seller: listing.seller,
            buyer,
            price_yocto: paid,
            sold_at_ns: U64(now),
            final_after_ns: U64(now),
            state: SaleState::Paid,
            royalty_account: self.royalty_account.clone(),
            royalty_yocto: U128(paid.0 / 10_000 * self.royalty_bps as u128),
        };
        // v3: the transfer is complete (on deployed House of Stake code it can't be undone), so the
        // seller and the royalty are paid now, in the same transaction as the sale.
        self.pay_proceeds(&sale);
        sale.state = SaleState::Paid;
        self.sales.insert(id, sale.clone());
        self.latest_sale.insert(token_id, id);
        emit("sold", serde_json::json!({"sale": sale, "activation_dropped": dropped.is_some()}));
        emit("proceeds_paid", serde_json::json!({"sale": sale}));
        true
    }

    // ===== a name back in the escrow after a sale =====

    /// If the escrow holds a sold name that isn't listed (the buyer sent it back with a plain transfer),
    /// anyone can return it to that sale's buyer. The seller was paid at the sale; nobody gets a refund
    /// (THREAT_MODEL C7). Attach at least 230 Tgas.
    pub fn recover_name(&mut self, token_id: String) -> Promise {
        require!(!self.listings.contains_key(&token_id), "name is listed; buy or cancel instead");
        let sale = self
            .latest_sale
            .get(&token_id)
            .and_then(|id| self.sales.get(id))
            .cloned()
            .unwrap_or_else(|| env::panic_str("no sale of this name"));
        require!(
            env::prepaid_gas() >= Gas::from_tgas(280),
            "attach at least 280 Tgas"
        );
        ext_registry::ext(self.registry.clone())
            .with_static_gas(GAS_VIEW)
            .nft_token(token_id.clone())
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_SET_PAYOUT.saturating_add(GAS_AFTER_PAYOUT).saturating_add(Gas::from_tgas(15)))
                    .on_recover_owner(token_id, sale.buyer),
            )
    }

    #[private]
    pub fn on_recover_owner(&mut self, token_id: String, buyer: AccountId) -> Promise {
        let owner = promise_ok()
            .and_then(|b| serde_json::from_slice::<Option<TokenView>>(&b).ok())
            .flatten()
            .map(|t| t.owner_id)
            .unwrap_or_else(|| env::panic_str("registry read failed; try again"));
        require!(owner == env::current_account_id(), "the escrow doesn't hold this name");
        require!(!self.listings.contains_key(&token_id), "name is listed");
        let (tla_id, label) = split_token_id(&token_id);
        self.payout_to(&tla_id, &label, &buyer).then(
            Self::ext(env::current_account_id())
                .with_static_gas(GAS_AFTER_PAYOUT)
                .on_recover_payout_set(token_id, buyer),
        )
    }

    #[private]
    pub fn on_recover_payout_set(&mut self, token_id: String, buyer: AccountId) -> Promise {
        require!(promise_ok().is_some(), "payout re-point failed; try again");
        let (tla_id, label) = split_token_id(&token_id);
        emit("name_recovered", serde_json::json!({"token_id": token_id, "to": buyer}));
        ext_registry::ext(self.registry.clone())
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_TRANSFER)
            .transfer_sub_account(tla_id, label, buyer)
    }

    // ===== proceeds =====

    /// For sales made before v3 only (they held proceeds for a 5-minute window). Anyone may call once
    /// the window has passed. Always pays the seller (and royalty); if the name is back in this escrow
    /// unlisted, it is recorded as the buyer's listing.
    pub fn claim_proceeds(&mut self, sale_id: U64) -> Promise {
        let mut sale = self
            .sales
            .get(&sale_id.0)
            .cloned()
            .unwrap_or_else(|| env::panic_str("no such sale"));
        require!(sale.state == SaleState::Pending, "sale already settled or being claimed");
        require!(
            env::block_timestamp() >= sale.final_after_ns.0,
            "revert window still open; try again after final_after_ns"
        );
        sale.state = SaleState::Claiming;
        self.sales.insert(sale_id.0, sale.clone());
        ext_registry::ext(self.registry.clone())
            .with_static_gas(GAS_VIEW)
            .nft_token(sale.token_id.clone())
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_claim_owner(sale_id),
            )
    }

    #[private]
    pub fn on_claim_owner(&mut self, sale_id: U64) -> SaleState {
        let mut sale = self.sales.get(&sale_id.0).cloned().expect("sale vanished");
        let owner = promise_ok()
            .and_then(|b| serde_json::from_slice::<Option<TokenView>>(&b).ok())
            .flatten()
            .map(|t| t.owner_id);
        let Some(owner) = owner else {
            sale.state = SaleState::Pending;
            self.sales.insert(sale_id.0, sale);
            emit("claim_retry", serde_json::json!({"sale_id": sale_id, "reason": "registry read failed"}));
            return SaleState::Pending;
        };
        // The sale completed when the name reached the buyer, so the seller is always paid.
        // (On the deployed House of Stake code nothing can undo a completed transfer_sub_account:
        // `Revert` is only used when an nft_transfer_call receiver refuses the token. The window above
        // is kept as insurance against future registry changes.)
        sale.state = SaleState::Paid;
        self.pay_proceeds(&sale);
        emit("proceeds_paid", serde_json::json!({"sale": sale}));
        // If the name is sitting in this escrow unlisted (the buyer sent it back with a plain transfer,
        // or a future registry reverted it), it belongs to the buyer: record it as the buyer's listing at
        // the sale price so they can take it back with `cancel`. Nobody ends up with both the money and the name.
        if owner == env::current_account_id() && !self.listings.contains_key(&sale.token_id) {
            let listing = Listing {
                token_id: sale.token_id.clone(),
                seller: sale.buyer.clone(),
                price_yocto: sale.price_yocto,
                nonce: U64(self.take_nonce()),
                listed_at_ns: U64(env::block_timestamp()),
                state: ListingState::Active,
            };
            self.listings.insert(sale.token_id.clone(), listing.clone());
            emit("returned_to_buyer_listing", serde_json::json!({"sale_id": sale_id, "listing": listing}));
        }
        self.sales.insert(sale_id.0, sale.clone());
        sale.state
    }

    // ===== cancel =====

    /// Seller takes the name back. Attach 1 yocto and at least 230 Tgas.
    #[payable]
    pub fn cancel(&mut self, token_id: String) -> Promise {
        require!(env::attached_deposit() == ONE_YOCTO, "attach exactly 1 yoctoNEAR");
        let mut listing = self
            .listings
            .get(&token_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("name is not listed"));
        require!(env::predecessor_account_id() == listing.seller, "only the seller can cancel");
        require!(listing.state == ListingState::Active, "a sale or cancel is already in progress");
        require!(
            env::prepaid_gas() >= GAS_REQUIRED_FOR_TRANSFER.saturating_add(Gas::from_tgas(30)),
            "attach at least 230 Tgas"
        );
        listing.state = ListingState::Cancelling;
        self.listings.insert(token_id.clone(), listing.clone());
        let (tla_id, label) = split_token_id(&token_id);
        self.payout_to(&tla_id, &label, &listing.seller).then(
            Self::ext(env::current_account_id())
                .with_static_gas(GAS_AFTER_PAYOUT)
                .on_cancel_payout_set(token_id),
        )
    }

    #[private]
    pub fn on_cancel_payout_set(&mut self, token_id: String) -> PromiseOrValue<bool> {
        let mut listing = self.listings.get(&token_id).cloned().expect("listing vanished");
        if promise_ok().is_none() {
            listing.state = ListingState::Active;
            self.listings.insert(token_id.clone(), listing);
            emit("cancel_failed", serde_json::json!({"token_id": token_id, "reason": "payout re-point failed"}));
            return PromiseOrValue::Value(false);
        }
        let (tla_id, label) = split_token_id(&token_id);
        PromiseOrValue::Promise(
            ext_registry::ext(self.registry.clone())
                .with_attached_deposit(ONE_YOCTO)
                .with_static_gas(GAS_TRANSFER)
                .transfer_sub_account(tla_id, label, listing.seller.clone())
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(GAS_CALLBACK)
                        .on_cancel_resolved(token_id),
                ),
        )
    }

    #[private]
    pub fn on_cancel_resolved(&mut self, token_id: String) -> bool {
        let mut listing = self.listings.get(&token_id).cloned().expect("listing vanished");
        if promise_ok().is_none() {
            listing.state = ListingState::Active;
            self.listings.insert(token_id.clone(), listing);
            emit("cancel_failed", serde_json::json!({"token_id": token_id}));
            return false;
        }
        self.listings.remove(&token_id);
        emit("cancelled", serde_json::json!({"token_id": token_id, "seller": listing.seller}));
        true
    }

    // ===== views =====

    pub fn get_registry(&self) -> AccountId {
        self.registry.clone()
    }
    /// NEP-199-style royalty info: who gets what share of a resale.
    pub fn get_royalty(&self) -> (AccountId, u16) {
        (self.royalty_account.clone(), self.royalty_bps)
    }
    pub fn get_revert_window_ns(&self) -> U64 {
        U64(self.revert_window_ns)
    }
    pub fn get_activation(&self, token_id: String) -> Option<ActivationView> {
        self.activations.get(&token_id).cloned().map(|a| self.view_of(&token_id, a))
    }
    pub fn get_job(&self, job_id: U64) -> Option<Job> {
        self.jobs.get(&job_id.0).cloned()
    }
    pub fn get_job_timeout_ns(&self) -> U64 {
        U64(self.job_timeout_ns)
    }
    pub fn get_listing(&self, token_id: String) -> Option<Listing> {
        self.listings.get(&token_id).cloned()
    }
    pub fn get_listings(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<Listing> {
        self.listings
            .values()
            .skip(from_index.unwrap_or(0) as usize)
            .take(limit.unwrap_or(50).min(100) as usize)
            .cloned()
            .collect()
    }
    pub fn get_sale(&self, sale_id: U64) -> Option<Sale> {
        self.sales.get(&sale_id.0).cloned()
    }
    pub fn get_latest_sale(&self, token_id: String) -> Option<Sale> {
        self.latest_sale
            .get(&token_id)
            .and_then(|id| self.sales.get(id))
            .cloned()
    }

    // ===== job escrow =====

    /// Pay for one job. The payment stays in this contract until the runtime the current activation
    /// names settles it (paid to the name's wallet) or it is refunded. `request_hash` is sha256 (hex)
    /// of the exact request bytes you will send to the runtime; it binds this payment to your question.
    /// Attach at least the activation's price. Returns the job id.
    #[payable]
    pub fn pay_job(&mut self, token_id: String, request_hash: String) -> U64 {
        require!(is_hex64(&request_hash), "request_hash must be a hex sha256");
        let a = self
            .activations
            .get(&token_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("this Deed is not switched on"));
        let paid = env::attached_deposit().as_yoctonear();
        require!(paid >= a.price_yocto.0, format!("attach at least the price ({} yocto)", a.price_yocto.0));
        let id = self.next_job_id;
        self.next_job_id += 1;
        let job = Job {
            id: U64(id),
            token_id: token_id.clone(),
            payer: env::predecessor_account_id(),
            amount_yocto: U128(paid),
            runtime_id: a.runtime_id.clone(),
            activation_version: a.version,
            activation_owner: a.owner.clone(),
            request_hash,
            paid_at_ns: U64(env::block_timestamp()),
            state: JobState::Pending,
        };
        self.jobs.insert(id, job.clone());
        emit("job_paid", serde_json::json!({"job": job}));
        U64(id)
    }

    /// The runtime delivered the answer. Only the runtime the job was paid under can call this. If the
    /// activation the job was paid under is still current and its owner still owns the name (or listed
    /// it), the payment goes to the name's own wallet; otherwise it is refunded to the payer.
    pub fn settle_job(&mut self, job_id: U64, answer_hash: String) -> PromiseOrValue<JobState> {
        require!(is_hex64(&answer_hash), "answer_hash must be a hex sha256");
        let mut job = self.jobs.get(&job_id.0).cloned().unwrap_or_else(|| env::panic_str("no such job"));
        require!(env::predecessor_account_id() == job.runtime_id, "only the runtime this job was paid to can settle it");
        require!(job.state == JobState::Pending, "job is not pending");
        let current = self.activations.get(&job.token_id).map(|a| a.version);
        if current != Some(job.activation_version) {
            return PromiseOrValue::Value(self.refund(job, "the Deed's activation changed before the answer was delivered"));
        }
        job.state = JobState::Settling;
        self.jobs.insert(job_id.0, job.clone());
        PromiseOrValue::Promise(
            ext_registry::ext(self.registry.clone())
                .with_static_gas(GAS_VIEW)
                .nft_token(job.token_id.clone())
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(GAS_CALLBACK)
                        .on_settle_owner(job_id, answer_hash),
                ),
        )
    }

    #[private]
    pub fn on_settle_owner(&mut self, job_id: U64, answer_hash: String) -> JobState {
        let mut job = self.jobs.get(&job_id.0).cloned().expect("job vanished");
        let owner = promise_ok()
            .and_then(|b| serde_json::from_slice::<Option<TokenView>>(&b).ok())
            .flatten()
            .map(|t| t.owner_id);
        let Some(owner) = owner else {
            job.state = JobState::Pending;
            self.jobs.insert(job_id.0, job);
            emit("job_settle_retry", serde_json::json!({"job_id": job_id, "reason": "registry read failed"}));
            return JobState::Pending;
        };
        let listed_by_owner = owner == env::current_account_id()
            && self.listings.get(&job.token_id).map(|l| l.seller == job.activation_owner).unwrap_or(false);
        let still_current = self.activations.get(&job.token_id).map(|a| a.version) == Some(job.activation_version);
        if !(still_current && (owner == job.activation_owner || listed_by_owner)) {
            return self.refund(job, "the name changed hands before the answer was delivered");
        }
        job.state = JobState::Settled { answer_hash };
        self.jobs.insert(job_id.0, job.clone());
        // The Deed's own wallet earns it; on a later sale the protocol sweeps it to the then-owner's payout.
        let _ = Promise::new(job.token_id.parse::<AccountId>().unwrap_or_else(|_| env::panic_str("bad token id")))
            .transfer(NearToken::from_yoctonear(job.amount_yocto.0));
        emit("job_settled", serde_json::json!({"job": job}));
        job.state
    }

    /// Return a pending job's payment to the payer. The runtime it was paid to can do this at any time
    /// (its answer failed); anyone can once `job_timeout_ns` has passed, so a refund never depends on
    /// the operator.
    pub fn refund_job(&mut self, job_id: U64) -> JobState {
        let job = self.jobs.get(&job_id.0).cloned().unwrap_or_else(|| env::panic_str("no such job"));
        require!(job.state == JobState::Pending, "job is not pending");
        let caller = env::predecessor_account_id();
        let timed_out = env::block_timestamp() >= job.paid_at_ns.0.saturating_add(self.job_timeout_ns);
        require!(
            caller == job.runtime_id || timed_out,
            "only the runtime can refund before the timeout; anyone can after it"
        );
        let reason = if caller == job.runtime_id { "refunded by the runtime" } else { "not answered in time" };
        self.refund(job, reason)
    }

    fn refund(&mut self, mut job: Job, reason: &str) -> JobState {
        job.state = JobState::Refunded { reason: reason.to_string() };
        self.jobs.insert(job.id.0, job.clone());
        let _ = Promise::new(job.payer.clone()).transfer(NearToken::from_yoctonear(job.amount_yocto.0));
        emit("job_refunded", serde_json::json!({"job": job}));
        job.state
    }

    /// Highest version this name has ever been activated with (current or dropped).
    fn version_floor(&self, token_id: &str) -> u32 {
        let current = self.activations.get(token_id).map(|a| a.version).unwrap_or(0);
        current.max(self.max_versions.get(token_id).copied().unwrap_or(0))
    }

    fn view_of(&self, token_id: &str, a: Activation) -> ActivationView {
        ActivationView {
            owner: a.owner,
            runtime_id: a.runtime_id,
            runtime_url: self.runtime_urls.get(token_id).cloned(),
            config_hash: a.config_hash,
            price_yocto: a.price_yocto,
            version: a.version,
            nonce: a.nonce,
            activated_at_ns: a.activated_at_ns,
        }
    }

    fn pay_proceeds(&self, sale: &Sale) {
        let royalty = sale.royalty_yocto.0;
        let to_seller = sale.price_yocto.0 - royalty;
        let _ = Promise::new(sale.seller.clone()).transfer(NearToken::from_yoctonear(to_seller));
        if royalty > 0 && sale.royalty_account != sale.seller {
            let _ = Promise::new(sale.royalty_account.clone()).transfer(NearToken::from_yoctonear(royalty));
        } else if royalty > 0 {
            let _ = Promise::new(sale.seller.clone()).transfer(NearToken::from_yoctonear(royalty));
        }
    }

    fn payout_to(&self, tla_id: &AccountId, label: &str, to: &AccountId) -> Promise {
        ext_registry::ext(self.registry.clone())
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_SET_PAYOUT)
            .set_payout_account(tla_id.clone(), label.to_string(), to.clone())
    }

    fn take_nonce(&mut self) -> u64 {
        let n = self.next_nonce;
        self.next_nonce += 1;
        n
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_tla_names() {
        let (tla, label) = split_token_id("preflight.bot");
        assert_eq!(tla.as_str(), "bot");
        assert_eq!(label, "preflight");
    }

    #[test]
    fn splits_names_under_account_tlas() {
        let (tla, label) = split_token_id("preflight.deedbot.deedhq.testnet");
        assert_eq!(tla.as_str(), "deedbot.deedhq.testnet");
        assert_eq!(label, "preflight");
    }

    #[test]
    #[should_panic(expected = "token id must be <name>.<tla>")]
    fn rejects_bare_names() {
        split_token_id("bot");
    }
}
