//! Sandbox tests: an agent that holds only a function-call key on its vault, the shared blocklist
//! read across contracts, and the protocol refusing everything else that key tries.
//! Build first: contract/test.sh (or `cargo near build non-reproducible-wasm --no-abi` in reports/ and agent-vault/).

use anyhow::Result;
use near_workspaces::types::{AccessKey, Gas, KeyType, NearToken, SecretKey};
use near_workspaces::Account;
use serde_json::json;

const GAS: Gas = Gas::from_tgas(100);
const BOND: NearToken = NearToken::from_millinear(100);

fn wasm(name: &str) -> Vec<u8> {
    let path = format!("../target/near/{name}/{name}.wasm");
    std::fs::read(&path).unwrap_or_else(|e| panic!("read {path}: {e}. Build the contracts first (contract/test.sh)"))
}

/// Ok(()) if it went through, Err(message) if the chain refused it (at the key or in the contract).
async fn attempt(r: near_workspaces::Result<near_workspaces::result::ExecutionFinalResult>) -> std::result::Result<(), String> {
    match r {
        Err(e) => Err(format!("{e}")),
        Ok(o) if o.is_success() => Ok(()),
        Ok(o) => Err(format!("{:?}", o.into_result().unwrap_err())),
    }
}

#[tokio::test]
async fn agent_with_a_function_call_key_cant_pay_a_reported_account_or_do_anything_else() -> Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let mk = |n: &'static str, near: u128| {
        let root = root.clone();
        async move { root.create_subaccount(n).initial_balance(NearToken::from_near(near)).transact().await.map(|r| r.into_result().unwrap()) }
    };
    let owner = mk("owner", 20).await?;
    let watchdog = mk("watchdog", 5).await?; // the reporter the owner trusts
    let stranger = mk("stranger", 5).await?;
    let drainer = mk("drainer", 1).await?;
    let shop = mk("shop", 1).await?;

    let reports = root.create_subaccount("reports").initial_balance(NearToken::from_near(5)).transact().await?.into_result()?;
    let reports = reports.deploy(&wasm("reports")).await?.into_result()?;
    reports.call("new").args_json(json!({"bond_yocto": BOND.as_yoctonear().to_string()})).transact().await?.into_result()?;

    let vault = root.create_subaccount("vault").initial_balance(NearToken::from_near(10)).transact().await?.into_result()?;
    let vault = vault.deploy(&wasm("agent_vault")).await?.into_result()?;
    vault
        .call("new")
        .args_json(json!({"owner": owner.id(), "reports": reports.id(), "per_payment_cap": NearToken::from_near(1).as_yoctonear().to_string(),
            "daily_budget": NearToken::from_near(2).as_yoctonear().to_string(), "trusted_reporters": [watchdog.id()], "min_reporters": 3}))
        .transact()
        .await?
        .into_result()?;

    // The agent's only key: function-call access on the vault account, method `pay`, small gas allowance.
    let agent_sk = SecretKey::from_random(KeyType::ED25519);
    vault
        .as_account()
        .batch(vault.id())
        .add_key(agent_sk.public_key(), AccessKey::function_call_access(vault.id(), &["pay"], Some(NearToken::from_millinear(250))))
        .transact()
        .await?
        .into_result()?;
    let agent = Account::from_secret_key(vault.id().clone(), agent_sk, &worker);
    let pay = |to: &Account, near_milli: u128| {
        agent.call(vault.id(), "pay").args_json(json!({"receiver_id": to.id(), "amount": NearToken::from_millinear(near_milli).as_yoctonear().to_string(), "memo": "test"})).gas(GAS).transact()
    };

    // 1. A clean receiver is paid.
    let before = shop.view_account().await?.balance;
    attempt(pay(&shop, 300).await).await.expect("paying a clean receiver works");
    assert_eq!(shop.view_account().await?.balance.as_yoctonear() - before.as_yoctonear(), NearToken::from_millinear(300).as_yoctonear());

    // 2. One untrusted stranger's report doesn't block anyone.
    stranger.call(reports.id(), "report").args_json(json!({"account_id": shop.id(), "reason": "grudge", "evidence": "none really"})).deposit(BOND).transact().await?.into_result()?;
    attempt(pay(&shop, 100).await).await.expect("a single untrusted report doesn't block");

    // 3. The trusted watchdog reports the drainer, with evidence: the vault refuses on chain.
    watchdog
        .call(reports.id(), "report")
        .args_json(json!({"account_id": drainer.id(), "reason": "drained wallets via fake airdrop", "evidence": "tx:EXAMPLE"}))
        .deposit(BOND)
        .transact()
        .await?
        .into_result()?;
    let drainer_before = drainer.view_account().await?.balance;
    let e = attempt(pay(&drainer, 500).await).await.expect_err("a reported receiver must be refused");
    assert!(e.contains("BLOCKED") && e.contains("watchdog"), "{e}");
    assert_eq!(drainer.view_account().await?.balance, drainer_before, "the drainer got nothing");

    // 4. Limits hold.
    let e = attempt(pay(&shop, 1_001).await).await.expect_err("over the per-payment cap");
    assert!(e.contains("per-payment cap"), "{e}");
    attempt(pay(&shop, 1_000).await).await.expect("within the cap");
    let e = attempt(pay(&shop, 900).await).await.expect_err("over the daily budget (0.3 + 0.1 + 1.0 + 0.9 > 2)");
    assert!(e.contains("budget"), "{e}");

    // 5. The key can't do anything but `pay` on the vault (refused by the protocol, before any contract code).
    assert!(attempt(agent.transfer_near(stranger.id(), NearToken::from_near(1)).await.map(|r| r.into())).await.is_err(), "plain transfer");
    let e = attempt(agent.call(vault.id(), "withdraw").args_json(json!({"amount": "1"})).deposit(NearToken::from_yoctonear(1)).transact().await).await.expect_err("owner method");
    assert!(!e.is_empty());
    let e = attempt(agent.call(vault.id(), "set_limits").args_json(json!({"per_payment_cap": "1", "daily_budget": "1"})).transact().await).await.expect_err("set_limits");
    assert!(!e.is_empty());
    assert!(attempt(agent.call(reports.id(), "withdraw").args_json(json!({"account_id": drainer.id()})).transact().await).await.is_err(), "another contract");
    assert!(attempt(agent.batch(vault.id()).add_key(SecretKey::from_random(KeyType::ED25519).public_key(), AccessKey::full_access()).transact().await).await.is_err(), "add a full-access key");

    // 6. The owner can override after checking it themselves; the dispute is visible but doesn't unblock.
    drainer.call(reports.id(), "dispute").args_json(json!({"statement": "I'm innocent"})).transact().await?.into_result()?;
    let st: serde_json::Value = reports.view("get_status").args_json(json!({"account_id": drainer.id()})).await?.json()?;
    assert_eq!(st["dispute"]["statement"], "I'm innocent");
    owner.call(vault.id(), "set_limits").args_json(json!({"per_payment_cap": NearToken::from_near(1).as_yoctonear().to_string(), "daily_budget": NearToken::from_near(5).as_yoctonear().to_string()})).deposit(NearToken::from_yoctonear(1)).transact().await?.into_result()?;
    assert!(attempt(pay(&drainer, 100).await).await.is_err(), "a dispute alone doesn't unblock");
    owner.call(vault.id(), "allow_receiver").args_json(json!({"account_id": drainer.id(), "allowed": true})).deposit(NearToken::from_yoctonear(1)).transact().await?.into_result()?;
    attempt(pay(&drainer, 100).await).await.expect("the owner's explicit override works");
    Ok(())
}
