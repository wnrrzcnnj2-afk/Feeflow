# FeeFlow Pro payment verifier (Cloudflare Worker + D1)

This is the server-side part of FeeFlow's Solana USDC membership system. It is **not live until deployed and connected to the website**.

## Fixed payment details
- Network: Solana mainnet
- Asset: native Solana USDC (mint: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)
- Price: 9.99 USDC
- Duration: 30 days
- Recipient: E2C1gbVorhoQ6UitRa4Q6UBKf4TqezjiTcjEKL5X6NyW

## Deploy
1. Create a Cloudflare account and a D1 database named `feeflow-pro`.
2. In the D1 console, execute the contents of `schema.sql`.
3. Create a Worker named `feeflow-pro-payments` and paste `worker.js`.
4. Add a D1 binding named `DB` pointing to that database.
5. Optionally set `SOLANA_RPC_URL` to a reliable Solana mainnet RPC endpoint. The public RPC is rate-limited.
6. Deploy, then open `/health`. It should report `ok: true`.

## API
- `GET /status?wallet=SOLANA_PUBLIC_ADDRESS`
- `POST /verify` JSON: `{"wallet":"...","signature":"..." }`

The verifier checks a confirmed Solana transaction, the USDC mint, destination owner, minimum amount, fee payer, recency, and replay protection. Membership expiry is stored server-side in D1.

## Important before taking money
- The website frontend still needs to create the Phantom USDC transfer, submit its signature to `/verify`, and query `/status` before showing Pro. Do not advertise payment as active until that integration is deployed and tested end-to-end.
- Use a dedicated reliable RPC endpoint for production; the public Solana RPC may throttle requests.
- Test first with a small-value test flow on devnet using a separate test configuration. Do not send real payments during setup.
- This is technical implementation guidance, not legal/tax advice. Check German business registration, consumer information, privacy, and tax obligations before selling subscriptions.
