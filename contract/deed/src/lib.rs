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
//!    refunds the buyer if the transfer fails (C1). Seller proceeds unlock only after House of
//!    Stake's 5-min revert window (C5).
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
/// hos-wallet `REVERT_WINDOW_NS` (lib.rs L51 @ d85860a).
pub const DEFAULT_REVERT_WINDOW_NS: u64 = 5 * 60 * 1_000_000_000;
/// Hard cap on the resale royalty: 10%.
pub const MAX_ROYALTY_BPS: u16 = 1_000;

const GAS_VIEW: Gas = Gas::from_tgas(10);
const GAS_TRANSFER: Gas = Gas::from_tgas(120);
/// registry.set_payout_account → ext.set_payout → wallet (registry reserves 30 Tgas for its leg).
const GAS_SET_PAYOUT: Gas = Gas::from_tgas(50);
const GAS_CALLBACK: Gas = Gas::from_tgas(20);
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
    /// House of Stake reverted the transfer inside the window; buyer refunded.
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
    ) -> Self {
        require!(royalty_bps <= MAX_ROYALTY_BPS, "royalty_bps must be at most 1000 (10%)");
        Self {
            registry,
            royalty_account,
            royalty_bps,
            revert_window_ns: revert_window_ns.map(|v| v.0).unwrap_or(DEFAULT_REVERT_WINDOW_NS),
            next_nonce: 1,
            next_sale_id: 1,
            activations: LookupMap::new(Key::Activations),
            listings: IterableMap::new(Key::Listings),
            sales: LookupMap::new(Key::Sales),
            latest_sale: LookupMap::new(Key::LatestSale),
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
    ) -> Promise {
        split_token_id(&token_id);
        require!(
            config_hash.len() == 64 && config_hash.chars().all(|c| c.is_ascii_hexdigit()),
            "config_hash must be a hex sha256"
        );
        require!(price_yocto.0 > 0, "price must be positive");
        require!(
            !self.listings.contains_key(&token_id),
            "name is listed for sale; cancel the listing before activating"
        );
        if let Some(prev) = self.activations.get(&token_id) {
            require!(
                version > prev.version,
                format!("version must be greater than {}", prev.version)
            );
        }
        let caller = env::predecessor_account_id();
        ext_registry::ext(self.registry.clone())
            .with_static_gas(GAS_VIEW)
            .nft_token(token_id.clone())
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_activate_owner(caller, token_id, runtime_id, config_hash, price_yocto, version),
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
    ) -> Activation {
        let bytes = promise_ok().unwrap_or_else(|| env::panic_str("registry read failed; try again"));
        let token: Option<TokenView> = serde_json::from_slice(&bytes)
            .unwrap_or_else(|_| env::panic_str("unexpected registry response"));
        let owner = token
            .map(|t| t.owner_id)
            .unwrap_or_else(|| env::panic_str("name not found in registry"));
        require!(owner == caller, "only the current owner of the name can activate it");
        // Re-check after the async gap.
        if let Some(prev) = self.activations.get(&token_id) {
            require!(version > prev.version, "a newer activation landed first");
        }
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
        emit(
            "activated",
            serde_json::json!({"token_id": token_id, "activation": activation}),
        );
        activation
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
        // The seller's activation is dead the moment the owner changes; drop it so
        // nothing can read it as current.
        let dropped = self.activations.remove(&token_id);
        emit(
            "listed",
            serde_json::json!({"listing": listing, "activation_dropped": dropped.is_some()}),
        );
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
        // while the name was listed to the seller (not to this escrow).
        self.payout_to(&tla_id, &label, &listing.seller)
            .then(
                ext_registry::ext(self.registry.clone())
                    .with_attached_deposit(ONE_YOCTO)
                    .with_static_gas(GAS_TRANSFER)
                    .transfer_sub_account(tla_id, label, buyer.clone()),
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_buy_resolved(token_id, buyer, U128(deposit)),
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
        let id = self.next_sale_id;
        self.next_sale_id += 1;
        let now = env::block_timestamp();
        let sale = Sale {
            id: U64(id),
            token_id: token_id.clone(),
            seller: listing.seller,
            buyer,
            price_yocto: paid,
            sold_at_ns: U64(now),
            final_after_ns: U64(now.saturating_add(self.revert_window_ns)),
            state: SaleState::Pending,
            royalty_account: self.royalty_account.clone(),
            royalty_yocto: U128(paid.0 / 10_000 * self.royalty_bps as u128),
        };
        self.sales.insert(id, sale.clone());
        self.latest_sale.insert(token_id, id);
        emit("sold", serde_json::json!({"sale": sale}));
        true
    }

    // ===== proceeds =====

    /// Anyone may call once the revert window has passed. Pays the seller, or, if
    /// House of Stake reverted the transfer back to this contract, refunds the buyer
    /// and reopens the listing for the seller (THREAT_MODEL C5).
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
        // Relisting is blocked while this sale is unclaimed, so the escrow can only own
        // the name now if the transfer to the buyer was reverted.
        if owner == env::current_account_id() {
            sale.state = SaleState::Reverted;
            let _ = Promise::new(sale.buyer.clone()).transfer(NearToken::from_yoctonear(sale.price_yocto.0));
            let listing = Listing {
                token_id: sale.token_id.clone(),
                seller: sale.seller.clone(),
                price_yocto: sale.price_yocto,
                nonce: U64(self.take_nonce()),
                listed_at_ns: U64(env::block_timestamp()),
                state: ListingState::Active,
            };
            self.listings.insert(sale.token_id.clone(), listing.clone());
            emit("sale_reverted_refunded", serde_json::json!({"sale": sale, "relisted": listing}));
        } else {
            sale.state = SaleState::Paid;
            let royalty = sale.royalty_yocto.0;
            let to_seller = sale.price_yocto.0 - royalty;
            let _ = Promise::new(sale.seller.clone()).transfer(NearToken::from_yoctonear(to_seller));
            if royalty > 0 && sale.royalty_account != sale.seller {
                let _ = Promise::new(sale.royalty_account.clone())
                    .transfer(NearToken::from_yoctonear(royalty));
            } else if royalty > 0 {
                let _ = Promise::new(sale.seller.clone()).transfer(NearToken::from_yoctonear(royalty));
            }
            emit("proceeds_paid", serde_json::json!({"sale": sale}));
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
        self.payout_to(&tla_id, &label, &listing.seller)
            .then(
                ext_registry::ext(self.registry.clone())
                    .with_attached_deposit(ONE_YOCTO)
                    .with_static_gas(GAS_TRANSFER)
                    .transfer_sub_account(tla_id, label, listing.seller.clone()),
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_cancel_resolved(token_id),
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
    pub fn get_activation(&self, token_id: String) -> Option<Activation> {
        self.activations.get(&token_id).cloned()
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
