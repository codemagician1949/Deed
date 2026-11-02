//! TEST ONLY. A stand-in for `registry.hos` that mirrors the rules Deed relies on
//! (see docs/SPIKE.md, tla-contracts @ d85860a):
//! - `transfer_sub_account` / `nft_transfer_call`: 1 yocto, caller must be owner (`OnlyOwner`),
//!   receiver must not be a registered name (`TransferToRegisteredName`), blocked while the
//!   name holds allow-listed FTs (`SubAccountHoldsTokens`).
//! - Every rotation re-points payout to the new owner and records the sweep target (outgoing payout).
//! - `nft_transfer_call` calls `nft_on_transfer` and gives the name back if the receiver returns true.
//! - `hos_revert` simulates House of Stake reverting the last rotation inside its window.
//! The real contracts are exercised separately by the verifier against mainnet bytecode.

use near_sdk::store::{LookupMap, LookupSet};
use near_sdk::{env, ext_contract, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue, PromiseResult};

const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Entry {
    pub owner: AccountId,
    pub payout: AccountId,
    pub previous_owner: Option<AccountId>,
    pub rotation_seq: u64,
}

#[near(serializers = [json])]
pub struct TokenView {
    pub token_id: String,
    pub owner_id: AccountId,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Sweep {
    pub token_id: String,
    pub to: AccountId,
    pub rotation_seq: u64,
}

#[allow(dead_code)]
#[ext_contract(ext_receiver)]
trait Receiver {
    fn nft_on_transfer(&mut self, sender_id: AccountId, previous_owner_id: AccountId, token_id: String, msg: String) -> bool;
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MockRegistry {
    entries: LookupMap<String, Entry>,
    registered: LookupSet<AccountId>,
    ft_blocked: LookupSet<String>,
    sweeps: Vec<Sweep>,
}

#[near]
impl MockRegistry {
    #[init]
    pub fn new() -> Self {
        Self {
            entries: LookupMap::new(b"e"),
            registered: LookupSet::new(b"r"),
            ft_blocked: LookupSet::new(b"f"),
            sweeps: Vec::new(),
        }
    }

    // ----- test controls -----
    pub fn mint(&mut self, token_id: String, owner: AccountId) {
        let name: AccountId = token_id.parse().unwrap();
        self.registered.insert(name);
        self.entries.insert(token_id, Entry { owner: owner.clone(), payout: owner, previous_owner: None, rotation_seq: 1 });
    }
    pub fn set_ft_blocked(&mut self, token_id: String, blocked: bool) {
        if blocked { self.ft_blocked.insert(token_id); } else { self.ft_blocked.remove(&token_id); }
    }
    pub fn hos_revert(&mut self, token_id: String) {
        let mut e = self.entries.get(&token_id).cloned().expect("TokenNotFound");
        let prev = e.previous_owner.take().unwrap_or_else(|| env::panic_str("NOTHING_TO_REVERT"));
        e.owner = prev.clone();
        e.payout = prev;
        e.rotation_seq += 1;
        self.entries.insert(token_id, e);
    }

    // ----- registry surface -----
    pub fn nft_token(&self, token_id: String) -> Option<TokenView> {
        self.entries.get(&token_id).map(|e| TokenView { token_id: token_id.clone(), owner_id: e.owner.clone() })
    }
    pub fn get_entry(&self, token_id: String) -> Option<Entry> {
        self.entries.get(&token_id).cloned()
    }
    pub fn get_sweeps(&self) -> Vec<Sweep> {
        self.sweeps.clone()
    }

    #[payable]
    pub fn transfer_sub_account(&mut self, tla_id: AccountId, name: String, new_owner: AccountId) {
        let token_id = format!("{name}.{tla_id}");
        self.check_transfer(&token_id, &new_owner);
        self.rotate(&token_id, &new_owner);
    }

    #[payable]
    pub fn nft_transfer_call(&mut self, receiver_id: AccountId, token_id: String, approval_id: Option<u64>, memo: Option<String>, msg: String) -> Promise {
        let _ = memo;
        require!(approval_id.is_none(), "ApprovalsNotSupported");
        self.check_transfer(&token_id, &receiver_id);
        let from = self.entries.get(&token_id).unwrap().owner.clone();
        self.rotate(&token_id, &receiver_id);
        ext_receiver::ext(receiver_id.clone())
            .with_static_gas(Gas::from_tgas(100))
            .nft_on_transfer(from.clone(), from.clone(), token_id.clone(), msg)
            .then(Self::ext(env::current_account_id()).with_static_gas(Gas::from_tgas(15)).resolve_transfer(token_id, from, receiver_id))
    }

    #[private]
    pub fn resolve_transfer(&mut self, token_id: String, from: AccountId, to: AccountId) -> PromiseOrValue<bool> {
        #[allow(deprecated)]
        let give_back = match env::promise_result(0) {
            PromiseResult::Successful(b) => near_sdk::serde_json::from_slice::<bool>(&b).unwrap_or(true),
            PromiseResult::Failed => true,
        };
        if give_back && self.entries.get(&token_id).map(|e| &e.owner) == Some(&to) {
            self.rotate(&token_id, &from);
            return PromiseOrValue::Value(false);
        }
        PromiseOrValue::Value(true)
    }

    #[payable]
    pub fn set_payout_account(&mut self, tla_id: AccountId, name: String, new_payout_account: AccountId) {
        require!(env::attached_deposit() == ONE_YOCTO, "ONE_YOCTO");
        let token_id = format!("{name}.{tla_id}");
        let mut e = self.entries.get(&token_id).cloned().expect("SubAccountNotFound");
        require!(env::predecessor_account_id() == e.owner, "OnlyOwner");
        e.payout = new_payout_account;
        self.entries.insert(token_id, e);
    }

    fn check_transfer(&self, token_id: &str, new_owner: &AccountId) {
        require!(env::attached_deposit() == ONE_YOCTO, "ONE_YOCTO");
        let e = self.entries.get(token_id).expect("SubAccountNotFound");
        require!(env::predecessor_account_id() == e.owner, "OnlyOwner");
        require!(*new_owner != e.owner, "SameOwner");
        require!(!self.registered.contains(new_owner), "TransferToRegisteredName");
        require!(!self.ft_blocked.contains(token_id), "SubAccountHoldsTokens");
    }

    fn rotate(&mut self, token_id: &str, to: &AccountId) {
        let mut e = self.entries.get(token_id).cloned().unwrap();
        e.rotation_seq += 1;
        // hos-wallet: sweep to the OUTGOING payout, then re-point payout to the new owner.
        self.sweeps.push(Sweep { token_id: token_id.to_string(), to: e.payout.clone(), rotation_seq: e.rotation_seq });
        e.previous_owner = Some(e.owner.clone());
        e.owner = to.clone();
        e.payout = to.clone();
        self.entries.insert(token_id.to_string(), e);
    }
}
