const WALLET = "E2C1gbVorhoQ6UitRa4Q6UBKf4TqezjiTcjEKL5X6NyW";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const PRICE = 9.99;
const TOKEN_AMOUNT = 9990000; // 9.99 USDC, 6 decimals
const DAY = 86400;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}

async function rpc(env, method, params) {
  const response = await fetch(env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  if (!response.ok) throw new Error("Solana RPC request failed");
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || "Solana RPC error");
  return payload.result;
}

function ownerFor(account, balances) {
  return balances?.find(x => x.accountIndex === account)?.owner || null;
}

function transferMatches(tx) {
  const meta = tx?.meta;
  if (!meta || meta.err) return false;
  const pre = meta.preTokenBalances || [];
  const post = meta.postTokenBalances || [];
  const instructions = [
    ...(tx.transaction?.message?.instructions || []),
    ...(meta.innerInstructions || []).flatMap(x => x.instructions || [])
  ];
  for (const ix of instructions) {
    const p = ix.parsed;
    if (!p || !["transfer", "transferChecked"].includes(p.type)) continue;
    const info = p.info || {};
    const mint = info.mint || pre.find(x => x.accountIndex === ix.accounts?.[1])?.mint;
    if (mint && mint !== USDC_MINT) continue;
    const amount = Number(info.tokenAmount?.amount ?? info.amount ?? 0);
    if (!Number.isFinite(amount) || amount < TOKEN_AMOUNT) continue;
    const destIndex = post.find(x => x.owner === WALLET && x.mint === USDC_MINT);
    if (!destIndex) continue;
    const sourceOwner = pre.find(x => x.owner && (x.accountIndex === info.source || x.accountIndex === info.sourceIndex));
    const destinationOwner = post.find(x => x.owner === WALLET && x.mint === USDC_MINT);
    if (sourceOwner && sourceOwner.owner === destinationOwner.owner) continue;
    const destinationAccountIndex = tx.transaction?.message?.accountKeys?.findIndex(k =>
      (typeof k === "string" ? k : k.pubkey) === info.destination
    );
    const sourceAccountIndex = tx.transaction?.message?.accountKeys?.findIndex(k =>
      (typeof k === "string" ? k : k.pubkey) === info.source
    );
    const destOwner = destinationAccountIndex >= 0 ? ownerFor(destinationAccountIndex, post) : null;
    const payerOwner = sourceAccountIndex >= 0 ? ownerFor(sourceAccountIndex, pre) : null;
    if (destOwner === WALLET && payerOwner && payerOwner !== WALLET) return true;
  }
  return false;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    }});
    const url = new URL(request.url);
    try {
      if (url.pathname === "/health") return json({ ok: true, network: "solana-mainnet", price: PRICE, currency: "USDC" });
      if (url.pathname === "/status" && request.method === "GET") {
        const wallet = url.searchParams.get("wallet");
        if (!wallet || wallet.length > 64) return json({ error: "Wallet address required" }, 400);
        const row = await env.DB.prepare("SELECT expires_at FROM memberships WHERE wallet = ?").bind(wallet).first();
        const active = !!row && row.expires_at > Math.floor(Date.now() / 1000);
        return json({ active, expiresAt: active ? row.expires_at : null });
      }
      if (url.pathname === "/verify" && request.method === "POST") {
        const body = await request.json();
        const wallet = String(body.wallet || "");
        const signature = String(body.signature || "");
        if (!wallet || wallet.length > 64 || !/^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(signature)) {
          return json({ error: "Invalid wallet or transaction signature" }, 400);
        }
        const already = await env.DB.prepare("SELECT signature FROM payments WHERE signature = ?").bind(signature).first();
        if (already) return json({ error: "This transaction has already been used" }, 409);
        const tx = await rpc(env, "getTransaction", [signature, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }]);
        if (!tx || tx.meta?.err || !transferMatches(tx)) return json({ error: "No valid 9.99 USDC payment to FeeFlow was found" }, 402);
        const blockTime = Number(tx.blockTime || 0);
        const now = Math.floor(Date.now() / 1000);
        if (!blockTime || blockTime < now - 1800 || blockTime > now + 60) {
          return json({ error: "Payment must be recent (last 30 minutes)" }, 400);
        }
        const payerKey = tx.transaction?.message?.accountKeys?.[0];
        const payer = typeof payerKey === "string" ? payerKey : payerKey?.pubkey;
        if (payer !== wallet) return json({ error: "Connected wallet does not match the payment wallet" }, 403);
        const current = await env.DB.prepare("SELECT expires_at FROM memberships WHERE wallet = ?").bind(wallet).first();
        const start = Math.max(now, current?.expires_at || 0);
        const expires = start + 30 * DAY;
        await env.DB.batch([
          env.DB.prepare("INSERT INTO payments (signature, wallet, paid_at, amount) VALUES (?, ?, ?, ?)")
            .bind(signature, wallet, now, TOKEN_AMOUNT),
          env.DB.prepare("INSERT INTO memberships (wallet, expires_at) VALUES (?, ?) ON CONFLICT(wallet) DO UPDATE SET expires_at = excluded.expires_at")
            .bind(wallet, expires)
        ]);
        return json({ ok: true, active: true, expiresAt: expires });
      }
      return json({ error: "Not found" }, 404);
    } catch (error) {
      return json({ error: "Payment verification unavailable", detail: error.message }, 500);
    }
  }
};