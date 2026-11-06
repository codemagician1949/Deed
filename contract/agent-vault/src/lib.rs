//! An AI agent's wallet that can't be talked into paying a reported account.
//!
//! The vault is its own NEAR account. The agent holds only a **function-call access key on the vault
//! account, limited to `pay`** (no full-access key). With that key the agent can't transfer NEAR
//! directly, add or delete keys, deploy code, attach a deposit, or call any other method or contract:
//! the protocol refuses before any code runs. All the agent can do is ask the vault to pay, and `pay`:
//!
//! 1. caps each payment (`per_payment_cap`) and the total per UTC day (`daily_budget`);
//! 2. reads the shared blocklist (`reports` contract) for the receiver, and refuses if it was reported
//!    by a reporter the owner trusts, or by at least `min_reporters` distinct reporters, unless the
//!    owner explicitly allowed that receiver;
//! 3. only then transfers, and gives the budget back if the transfer fails.
//!
//! The owner (a normal account with its own keys) changes limits, trusted reporters and overrides,
//! and withdraws. The off-chain wrapper (`agent/guard.ts`) adds the softer checks (new accounts, code
//! that changed recently, first payment to someone) and asks a human on "warn"; this contract is the
//! part that holds even if the agent skips the wrapper.

use near_sdk::json_types::{U128, U64};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::store::LookupSet;
use near_sdk::{env, ext_contract, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseResult};

const NS_PER_DAY: u64 = 86_400 * 1_000_000_000;
const GAS_VIEW: Gas = Gas::from_tgas(10);
const GAS_ON_STATUS: Gas = Gas::from_tgas(25);
const GAS_ON_PAID: Gas = Gas::from_tgas(8);
pub const MAX_MEMO_LEN: usize = 140;

/// The subset of `reports::Status` we read.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct ReportView {
    pub reporter: AccountId,
    pub reason: String,
    pub evidence: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct StatusView {
    pub reports: Vec<ReportView>,
    #[serde(default)]
    pub dispute: Option<near_sdk::serde_json::Value>,
}

#[ext_contract(ext_reports)]
pub trait ReportsView {
    fn get_status(&self, account_id: AccountId) -> StatusView;
}

#[derive(BorshStorageKey)]
#[near]
enum Key {
    Allowed,
}

#[near(serializers = [json])]
pub struct Config {
    pub owner: AccountId,
    pub reports: AccountId,
    pub per_payment_cap: U128,
    pub daily_budget: U128,
    pub trusted_reporters: Vec<AccountId>,
    pub min_reporters: u32,
    pub spent_today: U128,
    pub day: U64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct AgentVault {
    owner: AccountId,
    reports: AccountId,
    per_payment_cap: u128,
    daily_budget: u128,
    trusted_reporters: Vec<AccountId>,
    min_reporters: u32,
    /// Day index (block time / 1 day) that `spent_today` belongs to.
    day: u64,
    spent_today: u128,
    /// Receivers the owner allowed in spite of reports.
    allowed: LookupSet<AccountId>,
}

fn emit(event: &str, data: near_sdk::serde_json::Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        near_sdk::serde_json::json!({"standard": "deed_agent_vault", "version": "1.0.0", "event": event, "data": [data]})
    ));
}

/// Why a status means "blocked", or None. Same rule as the runtime's `/v1/check` (counterparty.ts).
pub fn blocked_reason(s: &StatusView, trusted: &[AccountId], min_reporters: u32) -> Option<String> {
    if let Some(r) = s.reports.iter().find(|r| trusted.contains(&r.reporter)) {
        return Some(format!("reported by {} (trusted): {} [evidence: {}]", r.reporter, r.reason, r.evidence));
    }
    if min_reporters > 0 && s.reports.len() as u32 >= min_reporters {
        return Some(format!("reported by {} accounts (limit {min_reporters}), first: {}", s.reports.len(), s.reports[0].reason));
    }
    None
}

fn promise_ok() -> Option<Vec<u8>> {
    require!(env::promise_results_count() == 1, "expected one promise result");
    #[allow(deprecated)]
    match env::promise_result(0) {
        PromiseResult::Successful(bytes) => Some(bytes),
        PromiseResult::Failed => None,
    }
}

#[near]
impl AgentVault {
    #[init]
    pub fn new(owner: AccountId, reports: AccountId, per_payment_cap: U128, daily_budget: U128, trusted_reporters: Vec<AccountId>, min_reporters: u32) -> Self {
        require!(per_payment_cap.0 > 0 && per_payment_cap.0 <= daily_budget.0, "need 0 < per_payment_cap <= daily_budget");
        Self {
            owner,
            reports,
            per_payment_cap: per_payment_cap.0,
            daily_budget: daily_budget.0,
            trusted_reporters,
            min_reporters,
            day: env::block_timestamp() / NS_PER_DAY,
            spent_today: 0,
            allowed: LookupSet::new(Key::Allowed),
        }
    }

    fn spent_now(&self) -> u128 {
        if env::block_timestamp() / NS_PER_DAY == self.day { self.spent_today } else { 0 }
    }

    fn check_limits(&self, amount: u128) {
        require!(amount > 0, "amount must be positive");
        require!(amount <= self.per_payment_cap, format!("over the per-payment cap of {} yoctoNEAR", self.per_payment_cap));
        let spent = self.spent_now();
        require!(spent + amount <= self.daily_budget, format!("over today's budget: {} of {} yoctoNEAR already spent", spent, self.daily_budget));
        // NEAR locked for the contract's own storage can't be paid out.
        let locked = env::storage_byte_cost().as_yoctonear() * env::storage_usage() as u128;
        let available = env::account_balance().as_yoctonear().saturating_sub(locked);
        require!(available >= amount, format!("the vault has {available} yoctoNEAR available after storage; top it up"));
    }

    /// The agent's one action. Callable by the vault account itself (the agent's function-call key)
    /// or by the owner. Refused on chain for a reported receiver (see the crate docs).
    pub fn pay(&mut self, receiver_id: AccountId, amount: U128, memo: String) -> Promise {
        let caller = env::predecessor_account_id();
        require!(caller == env::current_account_id() || caller == self.owner, "only the vault's agent key or its owner can pay");
        require!(receiver_id != env::current_account_id(), "can't pay the vault itself");
        require!(memo.len() <= MAX_MEMO_LEN, format!("memo is at most {MAX_MEMO_LEN} bytes"));
        self.check_limits(amount.0);
        ext_reports::ext(self.reports.clone())
            .with_static_gas(GAS_VIEW)
            .get_status(receiver_id.clone())
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_ON_STATUS).on_status(receiver_id, amount, memo))
    }

    #[private]
    pub fn on_status(&mut self, receiver_id: AccountId, amount: U128, memo: String) -> Promise {
        let status: StatusView = promise_ok()
            .and_then(|b| near_sdk::serde_json::from_slice(&b).ok())
            .unwrap_or_else(|| env::panic_str("couldn't read the blocklist; not paying"));
        if !self.allowed.contains(&receiver_id) {
            if let Some(why) = blocked_reason(&status, &self.trusted_reporters, self.min_reporters) {
                env::panic_str(&format!("BLOCKED: {receiver_id} is on the shared blocklist, {why}"));
            }
        }
        // Re-check the limits here: this is the step that commits, so two pays in flight can't both spend.
        self.check_limits(amount.0);
        let today = env::block_timestamp() / NS_PER_DAY;
        if today != self.day {
            self.day = today;
            self.spent_today = 0;
        }
        self.spent_today += amount.0;
        emit("payment_sent", near_sdk::serde_json::json!({"receiver_id": receiver_id, "amount": amount, "memo": memo, "reports": status.reports.len()}));
        Promise::new(receiver_id)
            .transfer(NearToken::from_yoctonear(amount.0))
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_ON_PAID).on_paid(amount, U64(today)))
    }

    /// Give the budget back if the transfer failed (the NEAR itself comes back to the vault).
    #[private]
    pub fn on_paid(&mut self, amount: U128, day: U64) -> bool {
        let ok = promise_ok().is_some();
        if !ok {
            if day.0 == self.day {
                self.spent_today = self.spent_today.saturating_sub(amount.0);
            }
            emit("payment_failed", near_sdk::serde_json::json!({"amount": amount}));
        }
        ok
    }

    // ----- owner -----

    fn only_owner(&self) {
        near_sdk::assert_one_yocto();
        require!(env::predecessor_account_id() == self.owner, "only the owner");
    }

    #[payable]
    pub fn set_limits(&mut self, per_payment_cap: U128, daily_budget: U128) {
        self.only_owner();
        require!(per_payment_cap.0 > 0 && per_payment_cap.0 <= daily_budget.0, "need 0 < per_payment_cap <= daily_budget");
        self.per_payment_cap = per_payment_cap.0;
        self.daily_budget = daily_budget.0;
    }

    #[payable]
    pub fn set_reporters(&mut self, trusted_reporters: Vec<AccountId>, min_reporters: u32) {
        self.only_owner();
        self.trusted_reporters = trusted_reporters;
        self.min_reporters = min_reporters;
    }

    /// Let the agent pay `account_id` in spite of reports (the owner checked it themselves).
    #[payable]
    pub fn allow_receiver(&mut self, account_id: AccountId, allowed: bool) {
        self.only_owner();
        if allowed {
            self.allowed.insert(account_id);
        } else {
            self.allowed.remove(&account_id);
        }
    }

    #[payable]
    pub fn withdraw(&mut self, amount: U128) -> Promise {
        self.only_owner();
        Promise::new(self.owner.clone()).transfer(NearToken::from_yoctonear(amount.0))
    }

    // ----- views -----

    pub fn get_config(&self) -> Config {
        Config {
            owner: self.owner.clone(),
            reports: self.reports.clone(),
            per_payment_cap: U128(self.per_payment_cap),
            daily_budget: U128(self.daily_budget),
            trusted_reporters: self.trusted_reporters.clone(),
            min_reporters: self.min_reporters,
            spent_today: U128(self.spent_now()),
            day: U64(self.day),
        }
    }

    pub fn is_allowed(&self, account_id: AccountId) -> bool {
        self.allowed.contains(&account_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    const NEAR: u128 = 1_000_000_000_000_000_000_000_000;

    fn vault_ctx(pred: AccountId) {
        testing_env!(VMContextBuilder::new()
            .current_account_id("vault.testnet".parse().unwrap())
            .predecessor_account_id(pred)
            .account_balance(NearToken::from_near(10))
            .build());
    }

    fn vault() -> AgentVault {
        vault_ctx(accounts(0));
        AgentVault::new(accounts(0), "reports.testnet".parse().unwrap(), U128(NEAR / 2), U128(NEAR), vec![accounts(1)], 3)
    }

    fn report(by: usize) -> ReportView {
        ReportView { reporter: accounts(by), reason: "drainer".into(), evidence: "tx:X".into() }
    }

    #[test]
    fn rule_blocks_on_a_trusted_reporter_or_enough_reporters() {
        let trusted = vec![accounts(1)];
        let s = |r: Vec<ReportView>| StatusView { reports: r, dispute: None };
        assert!(blocked_reason(&s(vec![]), &trusted, 3).is_none());
        assert!(blocked_reason(&s(vec![report(2)]), &trusted, 3).is_none(), "one untrusted stranger can't block");
        assert!(blocked_reason(&s(vec![report(1)]), &trusted, 3).unwrap().contains("trusted"));
        assert!(blocked_reason(&s(vec![report(2), report(3), report(4)]), &trusted, 3).unwrap().contains("3 accounts"));
        assert!(blocked_reason(&s(vec![report(2), report(3), report(4)]), &trusted, 0).is_none(), "min_reporters 0 turns the count rule off");
    }

    #[test]
    #[should_panic(expected = "only the vault's agent key or its owner")]
    fn strangers_cant_pay() {
        let mut v = vault();
        vault_ctx(accounts(2));
        let _ = v.pay(accounts(3), U128(1), String::new());
    }

    #[test]
    #[should_panic(expected = "per-payment cap")]
    fn per_payment_cap_holds() {
        let mut v = vault();
        vault_ctx("vault.testnet".parse().unwrap());
        let _ = v.pay(accounts(3), U128(NEAR / 2 + 1), String::new());
    }

    #[test]
    #[should_panic(expected = "over today's budget")]
    fn daily_budget_holds() {
        let mut v = vault();
        v.spent_today = NEAR / 2 + 1;
        vault_ctx("vault.testnet".parse().unwrap());
        let _ = v.pay(accounts(3), U128(NEAR / 2), String::new());
    }

    #[test]
    #[should_panic(expected = "available after storage")]
    fn storage_reserve_is_not_spendable() {
        let mut v = vault();
        testing_env!(VMContextBuilder::new()
            .current_account_id("vault.testnet".parse().unwrap())
            .predecessor_account_id("vault.testnet".parse().unwrap())
            .account_balance(NearToken::from_millinear(300))
            .storage_usage(20_000) // 0.2 NEAR locked
            .build());
        let _ = v.pay(accounts(3), U128(NEAR / 5), String::new());
    }

    #[test]
    #[should_panic(expected = "only the owner")]
    fn the_agent_cant_raise_its_own_limits() {
        let mut v = vault();
        testing_env!(VMContextBuilder::new()
            .current_account_id("vault.testnet".parse().unwrap())
            .predecessor_account_id("vault.testnet".parse().unwrap())
            .attached_deposit(NearToken::from_yoctonear(1))
            .build());
        v.set_limits(U128(100 * NEAR), U128(100 * NEAR));
    }
}
