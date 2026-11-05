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
/// Short job timeout so tests can step past it.
const JOB_TIMEOUT_NS: u64 = 3_000_000_000;
const JOB_PRICE: u128 = 10_000_000_000_000_000_000_000; // 0.01 NEAR
const REQ_HASH: &str = "aa11bb22cc33dd44ee55ff6600778899aa11bb22cc33dd44ee55ff6600778899";
const ANS_HASH: &str = "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0";
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
            "job_timeout_ns": JOB_TIMEOUT_NS.to_string(),
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
    activate_on(env, NAME, who, version, None).await
}

/// The runtime in these tests is `stranger`.
async fn activate_on(env: &Env, token: &str, who: &Account, version: u32, url: Option<&str>) -> Result<ExecutionFinalResult> {
    Ok(who
        .call(env.deed.id(), "activate")
        .args_json(json!({
            "token_id": token,
            "runtime_id": env.stranger.id(),
            "config_hash": CONFIG_HASH,
            "price_yocto": JOB_PRICE.to_string(),
            "version": version,
            "runtime_url": url,
        }))
        .gas(TX_GAS)
        .transact()
        .await?)
}

async fn pay_job(env: &Env, token: &str, who: &Account, amount: u128) -> Result<ExecutionFinalResult> {
    Ok(who
        .call(env.deed.id(), "pay_job")
        .args_json(json!({"token_id": token, "request_hash": REQ_HASH}))
        .deposit(NearToken::from_yoctonear(amount))
        .gas(TX_GAS)
        .transact()
        .await?)
}

async fn job(env: &Env, id: &str) -> Result<Value> {
    Ok(env.deed.view("get_job").args_json(json!({"job_id": id})).await?.json()?)
}

async fn job_call(env: &Env, who: &Account, method: &str, id: &str) -> Result<ExecutionFinalResult> {
    let args = if method == "settle_job" { json!({"job_id": id, "answer_hash": ANS_HASH}) } else { json!({"job_id": id}) };
    Ok(who.call(env.deed.id(), method).args_json(args).gas(TX_GAS).transact().await?)
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
async fn full_sale_seller_locked_out_and_paid_at_once() -> Result<()> {
    // THREAT_MODEL B1/B2/B3, A6, D2, C6, G5
    let env = setup().await?;
    activate(&env, &env.seller, 1).await?.into_result()?;
    let nonce = list_ok(&env).await?;

    // v3: the seller's service keeps running while listed (the activation stays) ...
    let a: Value = env.deed.view("get_activation").args_json(json!({"token_id": NAME})).await?.json()?;
    assert_eq!(a["owner"], env.seller.id().as_str(), "activation kept while listed");
    // ... but nobody can activate while the escrow holds the name.
    assert!(activate(&env, &env.seller, 2).await?.is_failure());

    env.worker.fast_forward(5).await?; // let earlier gas refunds land before measuring
    let seller_before = balance(&env.seller).await?;
    let creator_before = balance(&env.creator).await?;
    buy(&env, &env.buyer, PRICE, PRICE, &nonce).await?.into_result()?;
    assert_eq!(owner(&env).await?, env.buyer.id().as_str());
    // B2: payout now points at the buyer.
    assert_eq!(entry(&env).await?["payout"], env.buyer.id().as_str());
    // B1/B3: every sweep went to the seller.
    let sweeps: Value = env.registry.view("get_sweeps").await?.json()?;
    let to: Vec<&str> = sweeps.as_array().unwrap().iter().map(|s| s["to"].as_str().unwrap()).collect();
    assert_eq!(to, vec![env.seller.id().as_str(), env.seller.id().as_str()], "every sweep goes to the seller");

    // G5: paid in the same transaction as the sale, minus the royalty.
    let sale: Value = env.deed.view("get_latest_sale").args_json(json!({"token_id": NAME})).await?.json()?;
    assert_eq!(sale["state"], "Paid");
    let royalty = PRICE.as_yoctonear() / 10_000 * ROYALTY_BPS as u128;
    assert_eq!(sale["royalty_yocto"], royalty.to_string());
    assert_eq!(balance(&env.seller).await? - seller_before, PRICE.as_yoctonear() - royalty, "seller receives price minus royalty at once");
    assert_eq!(balance(&env.creator).await? - creator_before, royalty, "creator receives the royalty");
    // D2: the sale ends the seller's activation.
    let a: Value = env.deed.view("get_activation").args_json(json!({"token_id": NAME})).await?.json()?;
    assert!(a.is_null(), "activation dropped by the sale");

    // C6: nothing left to claim.
    let sale_id = sale["id"].as_str().unwrap().to_string();
    assert!(fails_with(&claim(&env, &env.stranger, &sale_id).await?, "already settled"));

    // A6: the seller can't move the name any more.
    let r = env.seller
        .call(env.registry.id(), "transfer_sub_account")
        .args_json(json!({"tla_id": "bot", "name": "preflight", "new_owner": env.stranger.id()}))
        .deposit(ONE_YOCTO).gas(TX_GAS).transact().await?;
    assert!(fails_with(&r, "OnlyOwner"));
    // D2: the seller can't re-activate; the buyer can, but never with a version used before (the
    // high-water mark outlives the dropped activation).
    assert!(fails_with(&activate(&env, &env.seller, 2).await?, "only the current owner"));
    let floor: u32 = env.deed.view("get_version_floor").args_json(json!({"token_id": NAME})).await?.json()?;
    assert_eq!(floor, 1, "the floor clients read survives the dropped activation");
    assert!(fails_with(&activate(&env, &env.buyer, 1).await?, "version must be greater than 1"));
    activate(&env, &env.buyer, 2).await?.into_result()?;
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

async fn sale_then_name_back_in_escrow(env: &Env, send_back: impl std::future::Future<Output = Result<()>>) -> Result<()> {
    let nonce = list_ok(env).await?;
    env.worker.fast_forward(5).await?;
    let seller_before = balance(&env.seller).await?;
    buy(env, &env.buyer, PRICE, PRICE, &nonce).await?.into_result()?;
    let royalty = PRICE.as_yoctonear() / 10_000 * ROYALTY_BPS as u128;
    assert_eq!(balance(&env.seller).await? - seller_before, PRICE.as_yoctonear() - royalty, "seller paid at the sale");
    send_back.await?;
    assert_eq!(owner(env).await?, env.deed.id().as_str());

    env.worker.fast_forward(5).await?;
    let buyer_before = balance(&env.buyer).await?;
    let seller_mid = balance(&env.seller).await?;
    // Anyone can hand it back to the buyer; nobody gets a refund.
    env.stranger.call(env.deed.id(), "recover_name").args_json(json!({"token_id": NAME}))
        .gas(TX_GAS).transact().await?.into_result()?;
    assert_eq!(owner(env).await?, env.buyer.id().as_str(), "the buyer has the name again");
    assert_eq!(balance(&env.buyer).await?, buyer_before, "no refund: the buyer can't get both the money and the name");
    assert_eq!(balance(&env.seller).await?, seller_mid, "the seller keeps the price");
    // Not again: the escrow no longer holds it.
    let r = env.stranger.call(env.deed.id(), "recover_name").args_json(json!({"token_id": NAME})).gas(TX_GAS).transact().await?;
    assert!(fails_with(&r, "doesn't hold this name"));
    Ok(())
}

#[tokio::test]
async fn name_reverted_to_escrow_after_sale_seller_still_paid_buyer_recovers_name() -> Result<()> {
    // THREAT_MODEL C5: if a (future) registry undid the transfer, nobody loses: seller paid, buyer keeps the name.
    let env = setup().await?;
    let reg = env.registry.clone();
    sale_then_name_back_in_escrow(&env, async move {
        reg.call("hos_revert").args_json(json!({"token_id": NAME})).transact().await?.into_result()?;
        Ok(())
    })
    .await
}

#[tokio::test]
async fn buyer_cannot_return_the_name_for_a_refund() -> Result<()> {
    // THREAT_MODEL C7: buyer uses the Deed, sends it back to the escrow, hopes for a refund.
    let env = setup().await?;
    let (buyer, reg, deed) = (env.buyer.clone(), env.registry.id().clone(), env.deed.id().clone());
    sale_then_name_back_in_escrow(&env, async move {
        buyer.call(&reg, "transfer_sub_account")
            .args_json(json!({"tla_id": "bot", "name": "preflight", "new_owner": deed}))
            .deposit(ONE_YOCTO).gas(TX_GAS).transact().await?.into_result()?;
        Ok(())
    })
    .await
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
async fn buyer_can_relist_right_after_the_sale() -> Result<()> {
    // v3: the seller is paid at the sale, so nothing blocks the buyer from reselling.
    let env = setup().await?;
    let nonce = list_ok(&env).await?;
    buy(&env, &env.buyer, PRICE, PRICE, &nonce).await?.into_result()?;
    list(&env, &env.buyer, PRICE).await?.into_result()?;
    assert_eq!(owner(&env).await?, env.deed.id().as_str());
    assert_eq!(listing(&env).await?["seller"], env.buyer.id().as_str());
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

// ---------------------------------------------------------------------------
// Job escrow (v3): payments for jobs are held by the contract, not by the operator.

/// A name whose account exists in the sandbox (so the name's wallet can actually receive settlements).
async fn svc_name(env: &Env) -> Result<(String, Account)> {
    let svc = env.seller.create_subaccount("svc").initial_balance(NearToken::from_near(2)).transact().await?.into_result()?;
    let token = svc.id().to_string();
    env.registry.call("mint").args_json(json!({"token_id": token, "owner": env.seller.id()})).transact().await?.into_result()?;
    Ok((token, svc))
}

#[tokio::test]
async fn job_payment_is_held_then_settled_into_the_names_wallet() -> Result<()> {
    // THREAT_MODEL D10: the name's wallet earns only when the named runtime delivers.
    let env = setup().await?;
    let (token, svc) = svc_name(&env).await?;
    assert!(fails_with(&pay_job(&env, &token, &env.buyer, JOB_PRICE).await?, "not switched on"));
    activate_on(&env, &token, &env.seller, 1, Some("https://runtime.example")).await?.into_result()?;
    assert!(fails_with(&pay_job(&env, &token, &env.buyer, JOB_PRICE - 1).await?, "attach at least the price"));
    let r = env.buyer.call(env.deed.id(), "pay_job").args_json(json!({"token_id": token, "request_hash": "nothex"}))
        .deposit(NearToken::from_yoctonear(JOB_PRICE)).gas(TX_GAS).transact().await?;
    assert!(fails_with(&r, "request_hash must be a hex sha256"));

    let id: String = pay_job(&env, &token, &env.buyer, JOB_PRICE).await?.into_result()?.json()?;
    let j = job(&env, &id).await?;
    assert_eq!(j["state"], "Pending");
    assert_eq!(j["payer"], env.buyer.id().as_str());
    assert_eq!(j["runtime_id"], env.stranger.id().as_str());
    assert_eq!(j["request_hash"], REQ_HASH);

    // Only the named runtime can settle.
    assert!(fails_with(&job_call(&env, &env.seller, "settle_job", &id).await?, "only the runtime this job was paid to"));
    let before = balance(&svc).await?;
    job_call(&env, &env.stranger, "settle_job", &id).await?.into_result()?;
    let j = job(&env, &id).await?;
    assert_eq!(j["state"]["Settled"]["answer_hash"], ANS_HASH);
    assert_eq!(balance(&svc).await? - before, JOB_PRICE, "the name's own wallet received the payment");
    // Once only.
    assert!(fails_with(&job_call(&env, &env.stranger, "settle_job", &id).await?, "not pending"));
    assert!(fails_with(&job_call(&env, &env.stranger, "refund_job", &id).await?, "not pending"));
    Ok(())
}

#[tokio::test]
async fn job_refunds_never_depend_on_the_operator() -> Result<()> {
    // THREAT_MODEL D8/D11: the runtime can refund at once; anyone can after the timeout.
    let env = setup().await?;
    let (token, _svc) = svc_name(&env).await?;
    activate_on(&env, &token, &env.seller, 1, None).await?.into_result()?;

    let id: String = pay_job(&env, &token, &env.buyer, JOB_PRICE).await?.into_result()?.json()?;
    env.worker.fast_forward(5).await?;
    let before = balance(&env.buyer).await?;
    job_call(&env, &env.stranger, "refund_job", &id).await?.into_result()?;
    assert_eq!(balance(&env.buyer).await? - before, JOB_PRICE, "runtime refund returns the full payment");
    assert_eq!(job(&env, &id).await?["state"]["Refunded"]["reason"], "refunded by the runtime");

    let id2: String = pay_job(&env, &token, &env.buyer, JOB_PRICE).await?.into_result()?.json()?;
    let r = job_call(&env, &env.creator, "refund_job", &id2).await?;
    assert!(fails_with(&r, "anyone can after it"), "a stranger can't refund before the timeout");
    env.worker.fast_forward(10).await?;
    let before = balance(&env.buyer).await?;
    job_call(&env, &env.creator, "refund_job", &id2).await?.into_result()?; // the buyer sends no tx here, so the delta is exact // a third party triggers it
    assert_eq!(balance(&env.buyer).await? - before, JOB_PRICE, "timed-out job refunded to the payer, not the caller");
    assert_eq!(job(&env, &id2).await?["state"]["Refunded"]["reason"], "not answered in time");
    Ok(())
}

#[tokio::test]
async fn sale_in_the_middle_of_a_paid_job_refunds_the_payer() -> Result<()> {
    // THREAT_MODEL D1 on chain: a job paid under the seller can't be settled after the sale.
    let env = setup().await?;
    activate(&env, &env.seller, 1).await?.into_result()?;
    let customer = env.creator.clone();
    let id: String = pay_job(&env, NAME, &customer, JOB_PRICE).await?.into_result()?.json()?;
    let nonce = list_ok(&env).await?;
    // While listed the seller's service is still current: paying works.
    let id_listed: String = pay_job(&env, NAME, &customer, JOB_PRICE).await?.into_result()?.json()?;
    buy(&env, &env.buyer, PRICE, PRICE, &nonce).await?.into_result()?;
    env.worker.fast_forward(5).await?;
    let before = balance(&customer).await?;
    job_call(&env, &env.stranger, "settle_job", &id).await?.into_result()?;
    job_call(&env, &env.stranger, "settle_job", &id_listed).await?.into_result()?;
    assert_eq!(balance(&customer).await? - before, 2 * JOB_PRICE, "both payments returned to the customer");
    assert!(job(&env, &id).await?["state"]["Refunded"].is_object());
    // Paying a sold Deed before the buyer switches on is refused outright.
    assert!(fails_with(&pay_job(&env, NAME, &customer, JOB_PRICE).await?, "not switched on"));
    Ok(())
}

#[tokio::test]
async fn name_moved_outside_the_escrow_refunds_pending_jobs() -> Result<()> {
    // THREAT_MODEL D2 on chain: the owner gives the name away directly; a stale activation earns nothing.
    let env = setup().await?;
    let (token, svc) = svc_name(&env).await?;
    activate_on(&env, &token, &env.seller, 1, None).await?.into_result()?;
    let id: String = pay_job(&env, &token, &env.buyer, JOB_PRICE).await?.into_result()?.json()?;
    let label = token.split('.').next().unwrap().to_string();
    let tla = token[label.len() + 1..].to_string();
    env.seller.call(env.registry.id(), "transfer_sub_account")
        .args_json(json!({"tla_id": tla, "name": label, "new_owner": env.stranger.id()}))
        .deposit(ONE_YOCTO).gas(TX_GAS).transact().await?.into_result()?;
    env.worker.fast_forward(5).await?;
    let (svc_before, buyer_before) = (balance(&svc).await?, balance(&env.buyer).await?);
    job_call(&env, &env.stranger, "settle_job", &id).await?.into_result()?;
    assert!(job(&env, &id).await?["state"]["Refunded"].is_object());
    assert_eq!(balance(&svc).await?, svc_before, "the name earned nothing");
    assert_eq!(balance(&env.buyer).await? - buyer_before, JOB_PRICE);
    Ok(())
}

#[tokio::test]
async fn runtime_url_is_recorded_with_the_activation() -> Result<()> {
    // THREAT_MODEL D3: clients can refuse a runtime the owner didn't name.
    let env = setup().await?;
    let r = activate_on(&env, NAME, &env.seller, 1, Some("http://plain.example")).await?;
    assert!(fails_with(&r, "must be an https:// URL"));
    activate_on(&env, NAME, &env.seller, 1, Some("https://runtime.example")).await?.into_result()?;
    let a: Value = env.deed.view("get_activation").args_json(json!({"token_id": NAME})).await?.json()?;
    assert_eq!(a["runtime_url"], "https://runtime.example");
    activate_on(&env, NAME, &env.seller, 2, None).await?.into_result()?;
    let a: Value = env.deed.view("get_activation").args_json(json!({"token_id": NAME})).await?.json()?;
    assert!(a["runtime_url"].is_null(), "a new activation without a URL clears the old one");
    Ok(())
}

#[tokio::test]
async fn failed_payout_repoint_stops_the_sale_and_refunds_the_buyer() -> Result<()> {
    // THREAT_MODEL B3/C1: if pointing payout back at the seller fails, the name must not move (else the
    // sale rotation would sweep the listed-period money into this escrow, where nobody could reach it).
    let env = setup().await?;
    let nonce = list_ok(&env).await?;
    env.registry.call("set_fail_payout").args_json(json!({"fail": true})).transact().await?.into_result()?;
    let before = balance(&env.buyer).await?;
    let r = buy(&env, &env.buyer, PRICE, PRICE, &nonce).await?;
    assert!(r.logs().iter().any(|l| l.contains("payout re-point failed")), "logs: {:?}", r.logs());
    env.worker.fast_forward(5).await?;
    let spent = before - balance(&env.buyer).await?;
    assert!(spent < NearToken::from_millinear(50).as_yoctonear(), "buyer lost only gas, lost {spent}");
    assert_eq!(owner(&env).await?, env.deed.id().as_str(), "the name did not move");
    assert_eq!(listing(&env).await?["state"]["kind"], "Active", "listing reopens");
    // The seller's cancel is refused the same way, and works once the registry behaves.
    let r = env.seller.call(env.deed.id(), "cancel").args_json(json!({"token_id": NAME})).deposit(ONE_YOCTO).gas(TX_GAS).transact().await?;
    assert!(r.logs().iter().any(|l| l.contains("cancel_failed")), "logs: {:?}", r.logs());
    assert_eq!(owner(&env).await?, env.deed.id().as_str());
    env.registry.call("set_fail_payout").args_json(json!({"fail": false})).transact().await?.into_result()?;
    buy(&env, &env.buyer, PRICE, PRICE, &nonce).await?.into_result()?;
    assert_eq!(owner(&env).await?, env.buyer.id().as_str());
    Ok(())
}
