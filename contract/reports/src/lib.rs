//! Shared blocklist for agents that pay.
//!
//! Anyone can report an account with a reason and evidence (a transaction hash or a link), backed
//! by a refundable bond so reports cost something. Each reporter can hold one report per account
//! and withdraw it (getting the bond back). The reported account can attach one public dispute
//! statement; a dispute doesn't remove reports, it is shown to whoever reads them.
//!
//! This contract only records. It doesn't decide what is "blocked": each reader applies its own
//! rule. `agent-vault` blocks a receiver reported by one of the reporters its owner trusts, or by
//! at least `min_reporters` distinct reporters, so a single stranger with a bond can't block an
//! account for everybody.

use near_sdk::json_types::{U128, U64};
use near_sdk::store::LookupMap;
use near_sdk::{env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise};

pub const MAX_REASON_LEN: usize = 280;
pub const MAX_EVIDENCE_LEN: usize = 200;
pub const MAX_STATEMENT_LEN: usize = 500;
/// At most this many reports are stored per account (a full account is clearly reported already).
pub const MAX_REPORTS_PER_ACCOUNT: usize = 25;

#[derive(BorshStorageKey)]
#[near]
enum Key {
    Reports,
    Disputes,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Report {
    pub reporter: AccountId,
    pub reason: String,
    pub evidence: String,
    pub at_ns: U64,
    pub bond: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Dispute {
    pub statement: String,
    pub at_ns: U64,
}

/// What a reader needs to apply its own rule, in one view call.
#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct Status {
    pub account_id: AccountId,
    pub reports: Vec<Report>,
    pub dispute: Option<Dispute>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Reports {
    bond: NearToken,
    reports: LookupMap<AccountId, Vec<Report>>,
    disputes: LookupMap<AccountId, Dispute>,
}

fn emit(event: &str, data: near_sdk::serde_json::Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        near_sdk::serde_json::json!({"standard": "deed_reports", "version": "1.0.0", "event": event, "data": [data]})
    ));
}

#[near]
impl Reports {
    #[init]
    pub fn new(bond_yocto: U128) -> Self {
        require!(bond_yocto.0 > 0, "bond must be positive");
        Self { bond: NearToken::from_yoctonear(bond_yocto.0), reports: LookupMap::new(Key::Reports), disputes: LookupMap::new(Key::Disputes) }
    }

    /// Report `account_id`. Attach exactly the bond (`get_bond`); it is returned on `withdraw`.
    #[payable]
    pub fn report(&mut self, account_id: AccountId, reason: String, evidence: String) {
        let reporter = env::predecessor_account_id();
        require!(env::attached_deposit() == self.bond, format!("attach exactly the bond: {} yoctoNEAR", self.bond.as_yoctonear()));
        require!(reporter != account_id, "you can't report yourself");
        require!(!reason.trim().is_empty() && reason.len() <= MAX_REASON_LEN, format!("reason is required, at most {MAX_REASON_LEN} bytes"));
        require!(!evidence.trim().is_empty() && evidence.len() <= MAX_EVIDENCE_LEN, format!("evidence (a tx hash or link) is required, at most {MAX_EVIDENCE_LEN} bytes"));
        let list = self.reports.entry(account_id.clone()).or_default();
        require!(!list.iter().any(|r| r.reporter == reporter), "you already reported this account; withdraw first to change it");
        require!(list.len() < MAX_REPORTS_PER_ACCOUNT, "this account already has the maximum number of reports");
        let r = Report { reporter, reason, evidence, at_ns: U64(env::block_timestamp()), bond: U128(self.bond.as_yoctonear()) };
        emit("reported", near_sdk::serde_json::json!({"account_id": account_id, "report": r}));
        list.push(r);
    }

    /// Remove your own report of `account_id` and get the bond back.
    pub fn withdraw(&mut self, account_id: AccountId) -> Promise {
        let reporter = env::predecessor_account_id();
        let list = self.reports.get_mut(&account_id).unwrap_or_else(|| env::panic_str("no reports for this account"));
        let i = list.iter().position(|r| r.reporter == reporter).unwrap_or_else(|| env::panic_str("you have no report for this account"));
        let r = list.remove(i);
        if list.is_empty() {
            self.reports.remove(&account_id);
        }
        emit("withdrawn", near_sdk::serde_json::json!({"account_id": account_id, "reporter": reporter}));
        Promise::new(reporter).transfer(NearToken::from_yoctonear(r.bond.0))
    }

    /// Called by a reported account: attach (or replace) a public statement next to its reports.
    pub fn dispute(&mut self, statement: String) {
        let me = env::predecessor_account_id();
        require!(self.reports.get(&me).is_some_and(|l| !l.is_empty()), "there are no reports against your account");
        require!(!statement.trim().is_empty() && statement.len() <= MAX_STATEMENT_LEN, format!("statement is required, at most {MAX_STATEMENT_LEN} bytes"));
        let d = Dispute { statement, at_ns: U64(env::block_timestamp()) };
        emit("disputed", near_sdk::serde_json::json!({"account_id": me, "dispute": d}));
        self.disputes.insert(me, d);
    }

    // ----- views -----

    pub fn get_bond(&self) -> U128 {
        U128(self.bond.as_yoctonear())
    }

    pub fn get_status(&self, account_id: AccountId) -> Status {
        Status {
            reports: self.reports.get(&account_id).cloned().unwrap_or_default(),
            dispute: self.disputes.get(&account_id).cloned(),
            account_id,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    const BOND: u128 = 100_000_000_000_000_000_000_000; // 0.1 NEAR

    fn ctx(who: usize, deposit: u128) {
        testing_env!(VMContextBuilder::new().predecessor_account_id(accounts(who)).attached_deposit(NearToken::from_yoctonear(deposit)).build());
    }

    #[test]
    fn report_withdraw_and_dispute() {
        ctx(0, 0);
        let mut c = Reports::new(U128(BOND));
        ctx(1, BOND);
        c.report(accounts(3), "drained a wallet".into(), "tx:ABC".into());
        ctx(2, BOND);
        c.report(accounts(3), "phishing link".into(), "https://example.org/evidence".into());
        assert_eq!(c.get_status(accounts(3)).reports.len(), 2);
        ctx(3, 0);
        c.dispute("those were refunds".into());
        assert!(c.get_status(accounts(3)).dispute.is_some());
        ctx(1, 0);
        let _ = c.withdraw(accounts(3));
        let s = c.get_status(accounts(3));
        assert_eq!(s.reports.len(), 1);
        assert_eq!(s.reports[0].reporter, accounts(2));
    }

    #[test]
    #[should_panic(expected = "attach exactly the bond")]
    fn report_needs_the_bond() {
        ctx(0, 0);
        let mut c = Reports::new(U128(BOND));
        ctx(1, BOND - 1);
        c.report(accounts(3), "x".into(), "y".into());
    }

    #[test]
    #[should_panic(expected = "already reported")]
    fn one_report_per_reporter() {
        ctx(0, 0);
        let mut c = Reports::new(U128(BOND));
        ctx(1, BOND);
        c.report(accounts(3), "x".into(), "y".into());
        c.report(accounts(3), "x".into(), "y".into());
    }

    #[test]
    #[should_panic(expected = "evidence")]
    fn evidence_is_required() {
        ctx(0, 0);
        let mut c = Reports::new(U128(BOND));
        ctx(1, BOND);
        c.report(accounts(3), "x".into(), " ".into());
    }

    #[test]
    #[should_panic(expected = "no reports against your account")]
    fn only_a_reported_account_can_dispute() {
        ctx(0, 0);
        let mut c = Reports::new(U128(BOND));
        ctx(3, 0);
        c.dispute("I'm fine".into());
    }
}
