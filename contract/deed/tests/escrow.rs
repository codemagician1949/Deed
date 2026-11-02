//! Sandbox tests for the `deed` contract against the mock registry.
//! Each test names the THREAT_MODEL.md row it covers.
//! Build first: `cd contract/deed && cargo near build non-reproducible-wasm --no-abi`
//! (same for `mock-registry`), or run `contract/test.sh`.

use anyhow::Result;
use near_workspaces::network::Sandbox;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, Contract, Worker};
use serde_json::{json, Value};

const NAME: &str = "preflight.bot";
const PRICE: NearToken = NearToken::from_near(5);
const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
const TX_GAS: Gas = Gas::from_tgas(300);
const CONFIG_HASH: &str = "3f79bb7b435b05321651daefd374cdc681dc06faa65e374e38337b88ca046dea";
/// Short revert window so tests can step past it.
const WINDOW_NS: u64 = 2_000_000_000;
/// 2.5% to the template creator.
const ROYALTY_BPS: u16 = 250;

struct Env {
    worker: Worker<Sandbox>,
    registry: Contract,
    deed: Contract,
    seller: Account,
    buyer: Account,
    stranger: Account,
    creator: Account,
}

fn wasm(name: &str) -> Vec<u8> {
    let path = format!("../target/near/{name}/{name}.wasm");
    std::fs::read(&path).unwrap_or_else(|e| panic!("read {path}: {e}. Build the contracts first (contract/test.sh)"))
}

async fn setup() -> Result<Env> {
    let worker = near_workspaces::sandbox().await?;
    let registry = worker.dev_deploy(&wasm("mock_registry")).await?;
    registry.call("new").transact().await?.into_result()?;
    let deed = worker.dev_deploy(&wasm("deed")).await?;
    let root = worker.root_account()?;
    let mk = |n: &'static str| {
        let root = root.clone();
        async move {
            root.create_subaccount(n)
                .initial_balance(NearToken::from_near(50))
                .transact()
                .await
                .map(|r| r.into_result().unwrap())
        }
    };
    let seller = mk("seller").await?;
    let buyer = mk("buyer").await?;
    let stranger = mk("stranger").await?;
    let creator = mk("creator").await?;
    deed.call("new")
        .args_json(json!({
            "registry": registry.id(),
            "royalty_account": creator.id(),
            "royalty_bps": ROYALTY_BPS,
            "revert_window_ns": WINDOW_NS.to_string(),
        }))
        .transact()
        .await?
        .into_result()?;
    registry
        .call("mint")
        .args_json(json!({"token_id": NAME, "owner": seller.id()}))
        .transact()
        .await?
        .into_result()?;
    Ok(Env { worker, registry, deed, seller, buyer, stranger, creator })
}

fn fails_with(res: &ExecutionFinalResult, needle: &str) -> bool {
    let text = format!("{:?}", res.failures());
    res.is_failure() && text.contains(needle)
}

async fn owner(env: &Env) -> Result<String> {
    let t: Value = env.registry.view("nft_token").args_json(json!({"token_id": NAME})).await?.json()?;
    Ok(t["owner_id"].as_str().unwrap().to_string())
}

async fn entry(env: &Env) -> Result<Value> {
    Ok(env.registry.view("get_entry").args_json(json!({"token_id": NAME})).await?.json()?)
}

async fn listing(env: &Env) -> Result<Value> {
    Ok(env.deed.view("get_listing").args_json(json!({"token_id": NAME})).await?.json()?)
}

async fn activate(env: &Env, who: &Account, version: u32) -> Result<ExecutionFinalResult> {
    Ok(who
        .call(env.deed.id(), "activate")
        .args_json(json!({
            "token_id": NAME,
            "runtime_id": env.stranger.id(),
            "config_hash": CONFIG_HASH,
            "price_yocto": "10000000000000000000000",
            "version": version,
        }))
        .gas(TX_GAS)
        .transact()
        .await?)
}

async fn list(env: &Env, who: &Account, price: NearToken) -> Result<ExecutionFinalResult> {
    Ok(who
        .call(env.registry.id(), "nft_transfer_call")
        .args_json(json!({
            "receiver_id": env.deed.id(),
            "token_id": NAME,
            "msg": json!({"price_yocto": price.as_yoctonear().to_string()}).to_string(),
        }))
        .deposit(ONE_YOCTO)
        .gas(TX_GAS)
        .transact()
        .await?)
}

async fn buy(env: &Env, who: &Account, price: NearToken, attach: NearToken, nonce: &str) -> Result<ExecutionFinalResult> {
    Ok(who
        .call(env.deed.id(), "buy")
        .args_json(json!({"token_id": NAME, "expected_price": price.as_yoctonear().to_string(), "listing_nonce": nonce}))
        .deposit(attach)
        .gas(TX_GAS)
        .transact()
        .await?)
}

async fn claim(env: &Env, who: &Account, sale_id: &str) -> Result<ExecutionFinalResult> {
    Ok(who
        .call(env.deed.id(), "claim_proceeds")
        .args_json(json!({"sale_id": sale_id}))
        .gas(TX_GAS)
        .transact()
        .await?)
}

async fn balance(a: &Account) -> Result<u128> {
    Ok(a.view_account().await?.balance.as_yoctonear())
}

/// List, check the listing, return its nonce.
async fn list_ok(env: &Env) -> Result<String> {
    list(env, &env.seller, PRICE).await?.into_result()?;
    assert_eq!(owner(env).await?, env.deed.id().as_str(), "escrow owns the name while listed");
    let l = listing(env).await?;
    assert_eq!(l["state"]["kind"], "Active");
    Ok(l["nonce"].as_str().unwrap().to_string())
}

// ---------------------------------------------------------------------------

#[tokio::test]
async fn activation_requires_current_owner() -> Result<()> {
    // THREAT_MODEL D2 (activation bound to the current owner)
    let env = setup().await?;
    let r = activate(&env, &env.stranger, 1).await?;
    assert!(fails_with(&r, "only the current owner"), "stranger must not activate: {:?}", r.failures());
    activate(&env, &env.seller, 1).await?.into_result()?;
    let a: Value = env.deed.view("get_activation").args_json(json!({"token_id": NAME})).await?.json()?;
    assert_eq!(a["owner"], env.seller.id().as_str());
    assert_eq!(a["version"], 1);
    let r = activate(&env, &env.seller, 1).await?;
    assert!(fails_with(&r, "version must be greater"), "same version replay must fail");
    Ok(())
}

#[tokio::test]
async fn full_sale_seller_locked_out_and_paid_after_window() -> Result<()> {
    // THREAT_MODEL B1/B2/B3, A6, D2, C5, C6, G5
    let env = setup().await?;
    activate(&env, &env.seller, 1).await?.into_result()?;
    let nonce = list_ok(&env).await?;

    // B3: payout pointed back at the seller while the escrow holds the name.
    assert_eq!(entry(&env).await?["payout"], env.seller.id().as_str(), "listed payments must sweep to the seller");
    // D2: the seller's activation is gone as soon as it's listed.
    let a: Value = env.deed.view("get_activation").args_json(json!({"token_id": NAME})).await?.json()?;
    assert!(a.is_null(), "activation must be dropped on listing");
    // Activating while listed fails (escrow is the owner).
    assert!(activate(&env, &env.seller, 2).await?.is_failure());

    buy(&env, &env.buyer, PRICE, PRICE, &nonce).await?.into_result()?;
    assert_eq!(owner(&env).await?, env.buyer.id().as_str());
    // B2: payout now points at the buyer.
    assert_eq!(entry(&env).await?["payout"], env.buyer.id().as_str());
    // B1: the rotation into escrow swept to the seller's payout; the sale rotation swept to the seller again (payout was re-pointed).
    let sweeps: Value = env.registry.view("get_sweeps").await?.json()?;
    let to: Vec<&str> = sweeps.as_array().unwrap().iter().map(|s| s["to"].as_str().unwrap()).collect();
    assert_eq!(to, vec![env.seller.id().as_str(), env.seller.id().as_str()], "every sweep goes to the seller");

    let sale: Value = env.deed.view("get_latest_sale").args_json(json!({"token_id": NAME})).await?.json()?;
    assert_eq!(sale["state"], "Pending");
    let sale_id = sale["id"].as_str().unwrap().to_string();

    // C5: proceeds are locked inside the revert window.
    let r = claim(&env, &env.seller, &sale_id).await?;
    assert!(fails_with(&r, "revert window still open"));

    // A6: the seller can't move the name any more.
    let r = env.seller
        .call(env.registry.id(), "transfer_sub_account")
        .args_json(json!({"tla_id": "bot", "name": "preflight", "new_owner": env.stranger.id()}))
        .deposit(ONE_YOCTO).gas(TX_GAS).transact().await?;
    assert!(fails_with(&r, "OnlyOwner"));
    // D2: the seller can't re-activate.
    assert!(fails_with(&activate(&env, &env.seller, 2).await?, "only the current owner"));
    // The buyer can.
    activate(&env, &env.buyer, 2).await?.into_result()?;

    env.worker.fast_forward(10).await?;
    // Snapshot after the seller's own txs (and their gas refunds) have settled.
    let seller_before = balance(&env.seller).await?;
    let creator_before = balance(&env.creator).await?;
    claim(&env, &env.stranger, &sale_id).await?.into_result()?; // anyone can trigger payout
    let sale: Value = env.deed.view("get_sale").args_json(json!({"sale_id": sale_id})).await?.json()?;
    assert_eq!(sale["state"], "Paid");
    let royalty = PRICE.as_yoctonear() / 10_000 * ROYALTY_BPS as u128;
    assert_eq!(sale["royalty_yocto"], royalty.to_string());
    assert_eq!(balance(&env.seller).await? - seller_before, PRICE.as_yoctonear() - royalty, "seller receives price minus royalty");
    assert_eq!(balance(&env.creator).await? - creator_before, royalty, "creator receives the royalty");

    // C6: double claim fails.
    assert!(fails_with(&claim(&env, &env.stranger, &sale_id).await?, "already settled"));
    Ok(())
}

#[tokio::test]
async fn wrong_price_and_stale_listing_rejected() -> Result<()> {
    // THREAT_MODEL C2, C4
    let env = setup().await?;
    let nonce = list_ok(&env).await?;
    let less = NearToken::from_near(4);
    assert!(fails_with(&buy(&env, &env.buyer, PRICE, less, &nonce).await?, "attach exactly the listed price"));
    assert!(fails_with(&buy(&env, &env.buyer, less, less, &nonce).await?, "price changed"));
    assert!(fails_with(&buy(&env, &env.buyer, PRICE, PRICE, "999").await?, "listing changed"));
    assert!(fails_with(&buy(&env, &env.seller, PRICE, PRICE, &nonce).await?, "seller cannot buy"));
    assert_eq!(owner(&env).await?, env.deed.id().as_str());
    Ok(())
}

#[tokio::test]
async fn forced_transfer_failure_refunds_buyer() -> Result<()> {
    // THREAT_MODEL C1: the registry refuses to transfer to a registered name.
    let env = setup().await?;
    env.registry
        .call("mint")
        .args_json(json!({"token_id": env.buyer.id(), "owner": env.stranger.id()}))
        .transact().await?.into_result()?;
    let nonce = list_ok(&env).await?;
    let before = balance(&env.buyer).await?;
    let r = buy(&env, &env.buyer, PRICE, PRICE, &nonce).await?;
    assert!(r.logs().iter().any(|l| l.contains("sale_failed_refunded")), "logs: {:?}", r.logs());
    let spent = before - balance(&env.buyer).await?;
    assert!(spent < NearToken::from_millinear(50).as_yoctonear(), "buyer lost only gas, lost {spent}");
    assert_eq!(owner(&env).await?, env.deed.id().as_str());
    assert_eq!(listing(&env).await?["state"]["kind"], "Active", "listing reopens");
    Ok(())
}

#[tokio::test]
async fn hos_revert_refunds_buyer_and_returns_listing() -> Result<()> {
    // THREAT_MODEL C5: House of Stake reverts the sale inside its window.
    let env = setup().await?;
    let nonce = list_ok(&env).await?;
    buy(&env, &env.buyer, PRICE, PRICE, &nonce).await?.into_result()?;
    let sale: Value = env.deed.view("get_latest_sale").args_json(json!({"token_id": NAME})).await?.json()?;
    let sale_id = sale["id"].as_str().unwrap().to_string();
    env.registry.call("hos_revert").args_json(json!({"token_id": NAME})).transact().await?.into_result()?;
    assert_eq!(owner(&env).await?, env.deed.id().as_str());

    let buyer_before = balance(&env.buyer).await?;
    env.worker.fast_forward(10).await?;
    claim(&env, &env.stranger, &sale_id).await?.into_result()?;
    let sale: Value = env.deed.view("get_sale").args_json(json!({"sale_id": sale_id})).await?.json()?;
    assert_eq!(sale["state"], "Reverted");
    assert_eq!(balance(&env.buyer).await? - buyer_before, PRICE.as_yoctonear(), "buyer refunded in full, no royalty taken");
    assert_eq!(listing(&env).await?["seller"], env.seller.id().as_str(), "seller can relist or cancel");

    // Seller takes the name back.
    env.seller.call(env.deed.id(), "cancel").args_json(json!({"token_id": NAME}))
        .deposit(ONE_YOCTO).gas(TX_GAS).transact().await?.into_result()?;
    assert_eq!(owner(&env).await?, env.seller.id().as_str());
    Ok(())
}

#[tokio::test]
async fn royalty_capped_at_ten_percent() -> Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let deed = worker.dev_deploy(&wasm("deed")).await?;
    let r = deed.call("new")
        .args_json(json!({"registry": deed.id(), "royalty_account": deed.id(), "royalty_bps": 1001}))
        .transact().await?;
    assert!(fails_with(&r, "at most 1000"));
    Ok(())
}

#[tokio::test]
async fn relisting_blocked_until_sale_claimed() -> Result<()> {
    let env = setup().await?;
    let nonce = list_ok(&env).await?;
    buy(&env, &env.buyer, PRICE, PRICE, &nonce).await?.into_result()?;
    let r = list(&env, &env.buyer, PRICE).await?;
    assert!(r.logs().iter().any(|l| l.contains("previous sale not settled")), "logs: {:?}", r.logs());
    assert_eq!(owner(&env).await?, env.buyer.id().as_str(), "name returned to the buyer");
    Ok(())
}

#[tokio::test]
async fn ft_balance_blocks_listing() -> Result<()> {
    // THREAT_MODEL B4
    let env = setup().await?;
    env.registry.call("set_ft_blocked").args_json(json!({"token_id": NAME, "blocked": true}))
        .transact().await?.into_result()?;
    assert!(fails_with(&list(&env, &env.seller, PRICE).await?, "SubAccountHoldsTokens"));
    assert_eq!(owner(&env).await?, env.seller.id().as_str());
    Ok(())
}

#[tokio::test]
async fn only_seller_cancels_and_bad_msg_returns_name() -> Result<()> {
    let env = setup().await?;
    // Bad msg: the name comes straight back.
    let r = env.seller.call(env.registry.id(), "nft_transfer_call")
        .args_json(json!({"receiver_id": env.deed.id(), "token_id": NAME, "msg": "sell it"}))
        .deposit(ONE_YOCTO).gas(TX_GAS).transact().await?;
    assert!(r.logs().iter().any(|l| l.contains("list_rejected")));
    assert_eq!(owner(&env).await?, env.seller.id().as_str());

    list_ok(&env).await?;
    let r = env.stranger.call(env.deed.id(), "cancel").args_json(json!({"token_id": NAME}))
        .deposit(ONE_YOCTO).gas(TX_GAS).transact().await?;
    assert!(fails_with(&r, "only the seller"));
    // Only the registry can deliver names.
    let r = env.stranger.call(env.deed.id(), "nft_on_transfer")
        .args_json(json!({"sender_id": env.stranger.id(), "previous_owner_id": env.stranger.id(), "token_id": "x.bot", "msg": "{\"price_yocto\":\"1\"}"}))
        .gas(TX_GAS).transact().await?;
    assert!(fails_with(&r, "only the registry"));
    Ok(())
}
