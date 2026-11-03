//! The sale, end to end, against the EXACT House of Stake bytecode running on NEAR mainnet
//! (deploy/mainnet-wasm, fetched by deploy/fetch-mainnet-wasm.sh; hashes checked below).
//! This is the same deployment recipe deploy/testnet.sh uses, rehearsed in a sandbox.
//!
//! Proves THREAT_MODEL rows A1–A7, B1–B3, D2 and G1–G5 against the audited wallet itself.
//! Run: contract/test.sh (or `cargo test -p deed --test real_fleet -- --nocapture`).

use anyhow::{bail, Result};
use near_workspaces::network::Sandbox;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, AccountId, Contract, Worker};
use serde_json::{json, Value};
use std::time::{SystemTime, UNIX_EPOCH};

/// Testnet/mainnet per-transaction cap. The sandbox allows more, which once hid a gas bug.
const TX_GAS: Gas = Gas::from_tgas(300);
const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
const GLOBAL_CODE_COST_PER_BYTE: u128 = 100_000_000_000_000_000_000;
const PRICE: NearToken = NearToken::from_near(40);
const EARNINGS: NearToken = NearToken::from_near(3);
const WINDOW_NS: u64 = 2_000_000_000;
const ROYALTY_BPS: u128 = 250;

/// Mainnet code hashes (base58 sha256), read from mainnet RPC on 2026-11-02.
const MAINNET: &[(&str, &str)] = &[
    ("tla_registry", "DVMYAu7exGKWQdngmtvUDC4rvBfZzSK1kt1AkzaewsPY"),
    ("hos_extension", "3rkMpK42jVjrqi9kukVCbUyeX1bqqAa4AJ6gvSdtL6Zz"),
    ("registrar", "DavYBFdXPsa9qa6QEyiaUxodV6pax2y8Sp3XoriCNj3t"),
    ("hos_wallet", "6d1FsQEpwVpgxALg4kCffXX45qujTL41bQSpWEHFoQ4o"),
    ("wallet_impl_deployer", "H3FbgvRfAMYJiBYtEfjETUvS1uUp3X9EkDrzTKN6skF6"),
    ("mpc_recovery", "HgacdGnQfkZ68W43VuqL9uZbY5JUXL2Gt9hrTWYU3eXw"),
];

fn mainnet_wasm(name: &str) -> Vec<u8> {
    let path = format!("../../deploy/mainnet-wasm/{name}.wasm");
    let code = std::fs::read(&path).unwrap_or_else(|e| panic!("read {path}: {e}. Run deploy/fetch-mainnet-wasm.sh"));
    let want = MAINNET.iter().find(|(n, _)| *n == name).unwrap().1;
    let got = bs58(&sha256(&code));
    assert_eq!(got, want, "{name}.wasm is not the mainnet bytecode");
    code
}

fn sha256(b: &[u8]) -> Vec<u8> {
    use sha2::Digest;
    sha2::Sha256::digest(b).to_vec()
}

fn bs58(b: &[u8]) -> String {
    ::bs58::encode(b).into_string()
}

fn lease_until_ns() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos() as u64 + 31_536_000_000_000_000
}

fn failed_with(r: &ExecutionFinalResult, needle: &str) -> bool {
    r.is_failure() && format!("{:?}", r.failures()).contains(needle)
}

async fn sub(root: &Account, name: &str, near: u128) -> Result<Account> {
    Ok(root.create_subaccount(name).initial_balance(NearToken::from_near(near)).transact().await?.into_result()?)
}

async fn balance(w: &Worker<Sandbox>, id: &AccountId) -> Result<u128> {
    Ok(w.view_account(id).await?.balance.as_yoctonear())
}

struct World {
    worker: Worker<Sandbox>,
    council: Account,
    registry: Contract,
    tla: AccountId,
    deed: Contract,
    kofi: Account,
    maya: Account,
    agent: Account,
    coowner: Account,
    customer: Account,
    name: AccountId,
}

async fn world() -> Result<World> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let council = sub(&root, "council", 50).await?;
    let registry_acc = sub(&root, "registry", 30).await?;
    let ext_acc = sub(&root, "ext", 20).await?;
    let rec = sub(&root, "rec", 5).await?;
    let impl_acc = sub(&root, "w", 20).await?;
    let tla_acc = sub(&root, "tla", 20).await?;
    let relay = sub(&root, "relay", 200).await?;

    // Global wallet code, published the way mainnet impl.hos does it.
    let deployer = impl_acc.deploy(&mainnet_wasm("wallet_impl_deployer")).await?.into_result()?;
    deployer.call("new").args_json(json!({"council": council.id(), "approval_delay_ns": "0"})).transact().await?.into_result()?;
    let wallet = mainnet_wasm("hos_wallet");
    council.call(deployer.id(), "gd_approve").args_json(json!({"hash": bs58(&sha256(&wallet))}))
        .deposit(ONE_YOCTO).transact().await?.into_result()?;
    relay.call(deployer.id(), "gd_deploy")
        .args_json(json!({"code": near_sdk::json_types::Base64VecU8::from(wallet.clone())}))
        .deposit(NearToken::from_yoctonear(wallet.len() as u128 * GLOBAL_CODE_COST_PER_BYTE))
        .gas(TX_GAS).transact().await?.into_result()?;

    let registrar = tla_acc.deploy(&mainnet_wasm("registrar")).await?.into_result()?;
    registrar.call("new").args_json(json!({"config": {
        "registry": registry_acc.id(), "council": council.id(), "wallet_impl": impl_acc.id(),
        "hos_extension": ext_acc.id(), "recovery": rec.id(), "chain_id": "testnet",
        "min_balance": NearToken::from_millinear(100), "wallet_timeout_secs": 3600,
    }})).transact().await?.into_result()?;

    let ext = ext_acc.deploy(&mainnet_wasm("hos_extension")).await?.into_result()?;
    ext.call("new").args_json(json!({
        "admin": council.id(), "registry": registry_acc.id(), "recovery": rec.id(),
        "treasury": council.id(), "council": council.id(),
    })).gas(TX_GAS).transact().await?.into_result()?;

    // Recovery (mainnet: rec.hos). Rotations notify it, so it must exist; we never run a recovery.
    let watcher = |_: u8| near_workspaces::types::SecretKey::from_random(near_workspaces::types::KeyType::ED25519).public_key();
    let recovery = rec.deploy(&mainnet_wasm("mpc_recovery")).await?.into_result()?;
    recovery.call("new").args_json(json!({
        "owner": council.id(), "signer": council.id(), "transfer_authority": ext_acc.id(),
        "watchers": [watcher(1), watcher(2)], "threshold": 2,
    })).gas(TX_GAS).transact().await?.into_result()?;

    let registry = registry_acc.deploy(&mainnet_wasm("tla_registry")).await?.into_result()?;
    registry.call("new").args_json(json!({
        "admin": council.id(), "hos_extension": ext_acc.id(), "grace_period_ns": "1209600000000000",
        "treasury": council.id(), "council": council.id(), "lease_term_ns": null,
    })).gas(TX_GAS).transact().await?.into_result()?;
    let tla = tla_acc.id().clone();
    for (m, args) in [
        ("admin_set_initial_rate", json!({"rate": "100000000"})),
        ("register_tla", json!({"tla_id": tla, "tla_type": "Open", "premium_category": "Standard", "licensee": null})),
        ("activate_open_tla", json!({"tla_id": tla})),
    ] {
        council.call(registry.id(), m).args_json(args).deposit(ONE_YOCTO).gas(TX_GAS).transact().await?.into_result()?;
    }
    // The registrar refuses wallets funded below its min_balance (0.1 NEAR); raise the creation deposit to match.
    let mut fee: Value = registry.view("get_fee_config").await?.json()?;
    fee["account_creation_deposit_yocto"] = json!(NearToken::from_millinear(200).as_yoctonear().to_string());
    council.call(registry.id(), "update_fee_config").args_json(json!({"config": fee}))
        .deposit(ONE_YOCTO).gas(TX_GAS).transact().await?.into_result()?;

    let deed = sub(&root, "deed", 20).await?.deploy(&std::fs::read("../target/near/deed/deed.wasm")?).await?.into_result()?;
    deed.call("new").args_json(json!({
        "registry": registry.id(), "royalty_account": council.id(),
        "royalty_bps": ROYALTY_BPS, "revert_window_ns": WINDOW_NS.to_string(),
    })).transact().await?.into_result()?;

    let kofi = sub(&root, "kofi", 50).await?;
    let maya = sub(&root, "maya", 100).await?;
    let agent = sub(&root, "agent", 5).await?;
    let coowner = sub(&root, "coowner", 5).await?;
    let customer = sub(&root, "customer", 20).await?;

    // Kofi rents preflight.<tla>
    let price: Value = registry.view("get_rent_price").args_json(json!({"tla_id": tla, "name": "preflight"})).await?.json()?;
    let total: u128 = price["total_yocto"].as_str().unwrap().parse()?;
    let r = kofi.call(registry.id(), "rent_sub_account").args_json(json!({"tla_id": tla, "name": "preflight"}))
        .deposit(NearToken::from_yoctonear(total + NearToken::from_millinear(100).as_yoctonear()))
        .gas(TX_GAS).transact().await?;
    if !r.receipt_failures().is_empty() { bail!("rent failed: {:?}", r.receipt_failures()); }
    let name: AccountId = format!("preflight.{tla}").parse()?;
    for _ in 0..20 {
        if let Ok(v) = worker.view(&name, "w_extensions").await {
            if v.json::<Vec<String>>().map(|e| !e.is_empty()).unwrap_or(false) { break; }
        }
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    }
    Ok(World { worker, council, registry, tla, deed, kofi, maya, agent, coowner, customer, name })
}

fn transfer_req(to: &AccountId, yocto: u128) -> Value {
    json!({"request": {"external": [{"receiver_id": to, "actions": [{"action": "transfer", "payload": {"amount": yocto.to_string()}}]}]}})
}

async fn exec(w: &World, as_: &Account, req: Value) -> Result<ExecutionFinalResult> {
    Ok(as_.call(&w.name, "w_execute_extension").args_json(req).deposit(ONE_YOCTO).gas(Gas::from_tgas(80)).transact().await?)
}

async fn owner_of(w: &World) -> Result<String> {
    let t: Value = w.registry.view("nft_token").args_json(json!({"token_id": w.name})).await?.json()?;
    Ok(t["owner_id"].as_str().unwrap_or_default().to_string())
}

async fn resolve_auth(w: &World, owner: &AccountId) -> Result<bool> {
    let blob = json!({"payload": "sign in to deed console", "owner": owner, "authorization": "x"}).to_string();
    Ok(w.worker.view(&w.name, "w_resolve_auth").args_json(json!({"path": [], "authorization": blob})).await.is_ok())
}

#[tokio::test]
async fn sale_on_real_hos_bytecode_locks_the_seller_out() -> Result<()> {
    let w = world().await?;
    let report = |row: &str, ok: bool, what: &str| {
        println!("{} {row:<4} {what}", if ok { "PASS" } else { "FAIL" });
        assert!(ok, "{row}: {what}");
    };

    // --- Kofi runs the business: adds his agent + a hidden co-owner, grants a capped spend.
    let add = |acc: &AccountId| json!({"request": {"internal": [{"op": "add_extension", "payload": {"account_id": acc}}]}});
    exec(&w, &w.kofi, add(w.agent.id())).await?.into_result()?;
    exec(&w, &w.kofi, add(w.coowner.id())).await?.into_result()?;
    w.kofi.call(&w.name, "hos_grant_spend").args_json(json!({
        "extension": w.agent.id(), "receivers": [w.kofi.id()], "budget_yocto": NearToken::from_near(1).as_yoctonear().to_string(),
        "tokens": [], "items": [], "expires_at": lease_until_ns().to_string(),
    })).deposit(ONE_YOCTO).gas(Gas::from_tgas(40)).transact().await?.into_result()?;
    w.kofi.call(w.deed.id(), "activate").args_json(json!({
        "token_id": w.name, "runtime_id": w.agent.id(),
        "config_hash": "3f79bb7b435b05321651daefd374cdc681dc06faa65e374e38337b88ca046dea",
        "price_yocto": "50000000000000000000000", "version": 1,
    })).gas(TX_GAS).transact().await?.into_result()?;

    // Baselines: everything works while Kofi owns it.
    let tenth = NearToken::from_millinear(100).as_yoctonear();
    report("pre", exec(&w, &w.agent, transfer_req(w.kofi.id(), tenth)).await?.is_success(), "agent can spend within its grant before the sale");
    report("pre", resolve_auth(&w, w.kofi.id()).await?, "Kofi can sign in as the name before the sale");
    report("A5", !resolve_auth(&w, w.agent.id()).await?, "a spend grantee can never sign in as the name (GRANTEE_NOT_OWNER)");

    // Customers pay the name.
    w.customer.transfer_near(&w.name, EARNINGS).await?.into_result()?;

    // --- Kofi lists: name moves into the escrow (rotation #1).
    let kofi_before = balance(&w.worker, w.kofi.id()).await?;
    let r = w.kofi.call(w.registry.id(), "nft_transfer_call").args_json(json!({
        "receiver_id": w.deed.id(), "token_id": w.name,
        "msg": json!({"price_yocto": PRICE.as_yoctonear().to_string()}).to_string(),
    })).deposit(ONE_YOCTO).gas(TX_GAS).transact().await?;
    if !r.receipt_failures().is_empty() { bail!("listing failed: {:?}", r.receipt_failures()); }
    report("list", owner_of(&w).await? == w.deed.id().as_str(), "escrow owns the name while it is listed");
    let swept = balance(&w.worker, w.kofi.id()).await?.saturating_sub(kofi_before);
    report("B1", swept >= EARNINGS.as_yoctonear() - tenth, &format!("Kofi's earnings swept to Kofi at listing ({} yocto)", swept));
    // A customer pays while the name is listed (owned by the escrow).
    w.customer.transfer_near(&w.name, NearToken::from_near(1)).await?.into_result()?;
    let kofi_before_sale = balance(&w.worker, w.kofi.id()).await?;

    // --- Maya buys (rotation #2).
    let listing: Value = w.deed.view("get_listing").args_json(json!({"token_id": w.name})).await?.json()?;
    w.maya.call(w.deed.id(), "buy").args_json(json!({
        "token_id": w.name, "expected_price": PRICE.as_yoctonear().to_string(), "listing_nonce": listing["nonce"],
    })).deposit(PRICE).gas(TX_GAS).transact().await?.into_result()?;
    report("G5", owner_of(&w).await? == w.maya.id().as_str(), "Maya owns the name");
    let listed_income = balance(&w.worker, w.kofi.id()).await?.saturating_sub(kofi_before_sale);
    report("B3", listed_income >= NearToken::from_millinear(990).as_yoctonear(), &format!("money paid in while listed went to Kofi at the sale ({listed_income} yocto)"));

    // --- Kofi's side attacks. Each must fail on-chain.
    report("A1", exec(&w, &w.agent, transfer_req(w.kofi.id(), tenth)).await?.is_failure(), "Kofi's agent cannot spend after the sale");
    report("A2", exec(&w, &w.coowner, transfer_req(w.coowner.id(), tenth)).await?.is_failure(), "Kofi's hidden co-owner cannot act after the sale");
    report("A2", exec(&w, &w.kofi, transfer_req(w.kofi.id(), tenth)).await?.is_failure(), "Kofi himself cannot act through the wallet");
    let regrant = w.kofi.call(&w.name, "hos_grant_spend").args_json(json!({
        "extension": w.agent.id(), "receivers": [w.kofi.id()], "budget_yocto": "1",
        "tokens": [], "items": [], "expires_at": lease_until_ns().to_string(),
    })).deposit(ONE_YOCTO).gas(Gas::from_tgas(40)).transact().await?;
    report("A3", regrant.is_failure(), "Kofi cannot re-grant himself spending");
    report("A4", !resolve_auth(&w, w.kofi.id()).await?, "Kofi cannot sign in as the name (NOT_AN_OWNER)");
    report("A4", resolve_auth(&w, w.maya.id()).await?, "Maya can sign in as the name");
    let resell = w.kofi.call(w.registry.id(), "transfer_sub_account")
        .args_json(json!({"tla_id": w.tla, "name": "preflight", "new_owner": w.agent.id()}))
        .deposit(ONE_YOCTO).gas(TX_GAS).transact().await?;
    report("A6", resell.is_failure(), "Kofi cannot sell the name again");
    let keys = w.worker.view_access_keys(&w.name).await?;
    report("A7", keys.is_empty(), "the name has no access keys anyone could sign with");
    let reactivate = w.kofi.call(w.deed.id(), "activate").args_json(json!({
        "token_id": w.name, "runtime_id": w.agent.id(),
        "config_hash": "3f79bb7b435b05321651daefd374cdc681dc06faa65e374e38337b88ca046dea",
        "price_yocto": "1", "version": 9,
    })).gas(TX_GAS).transact().await?;
    report("D2", failed_with(&reactivate, "only the current owner"), "Kofi cannot switch the service back on");
    let status: Value = w.worker.view(&w.name, "hos_agent_status").args_json(json!({"extension": w.agent.id()})).await?.json()?;
    report("G1", status["extension_enabled"] == false && status["grant"].is_null(), "agent extension and grant are gone (hos_agent_status)");

    // --- Maya runs it; Kofi gets paid after the window.
    w.maya.call(w.deed.id(), "activate").args_json(json!({
        "token_id": w.name, "runtime_id": w.agent.id(),
        "config_hash": "3f79bb7b435b05321651daefd374cdc681dc06faa65e374e38337b88ca046dea",
        "price_yocto": "50000000000000000000000", "version": 2,
    })).gas(TX_GAS).transact().await?.into_result()?;
    let sale: Value = w.deed.view("get_latest_sale").args_json(json!({"token_id": w.name})).await?.json()?;
    w.worker.fast_forward(10).await?;
    let before = balance(&w.worker, w.kofi.id()).await?;
    let creator_before = balance(&w.worker, w.council.id()).await?;
    w.maya.call(w.deed.id(), "claim_proceeds").args_json(json!({"sale_id": sale["id"]})).gas(TX_GAS).transact().await?.into_result()?;
    let royalty = PRICE.as_yoctonear() / 10_000 * ROYALTY_BPS;
    report("G5", balance(&w.worker, w.kofi.id()).await? - before == PRICE.as_yoctonear() - royalty, "Kofi receives the price minus royalty");
    report("G5", balance(&w.worker, w.council.id()).await? - creator_before == royalty, "template creator receives the royalty");
    println!("\nAll checks ran against mainnet bytecode: {:?}", MAINNET.iter().map(|(n, _)| *n).collect::<Vec<_>>());
    Ok(())
}
