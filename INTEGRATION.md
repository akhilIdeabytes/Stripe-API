# Platform integration guide

How the insurance platform (ex-Authorize.Net) and DG (ex-PayPal) talk to
this service. Both directions are covered: you call us to move money, we
call you back when Stripe settles.

## Authentication

Server-to-server calls use an API key in a header. No JWT, no login.

```
X-API-Key: sk_portal_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Keys are issued per platform and shown **once**, at creation or rotation.
They are stored only as a bcrypt hash — if a key is lost it must be
rotated, not recovered. Every request is automatically scoped to the
platform that owns the key: you cannot read, capture or refund another
platform's payments.

## Taking a payment

```http
POST /payments
X-API-Key: sk_portal_...
Idempotency-Key: policy-INS-2043-attempt-1
Content-Type: application/json

{
  "amount": 42000,
  "currency": "cad",
  "method": "acss_debit",
  "description": "Policy INS-2043 — annual premium",
  "externalReference": "INS-2043",
  "customerId": 17
}
```

- `amount` is in the **smallest currency unit** — 42000 = $420.00.
- `method` is `card`, `us_bank_account` (US ACH) or `acss_debit` (Canadian PAD).
- `externalReference` is your own id. Index it on your side; we index it on ours.
- `Idempotency-Key` is strongly recommended — a retried request will
  never create a second charge.

The response carries a `clientSecret`. Render the payment form with it
using Stripe.js — **never** redirect the payer to a copied link:

- `kind: "checkout"` → mount Stripe Embedded Checkout with the secret.
- `kind: "intent"` → mount the Payment Element with the secret and call
  `stripe.confirmPayment()`.

### Authorize now, capture later (cards only)

Send `"captureMethod": "manual"`. The payment reaches
`requires_capture`, holding the funds without taking them. Then:

```http
POST /payments/42/capture      { "amount": 39000 }   // partial capture ok
POST /payments/42/cancel                             // release the hold
```

Bank debits cannot be held — the API rejects `manual` for them rather
than failing later at Stripe.

## Refunding

```http
POST /refunds
{ "paymentId": 42, "amount": 10000, "reason": "requested_by_customer" }
```

Omit `amount` for a full refund. The service checks locally that the
payment succeeded and that the amount is within what remains refundable,
so you get a clear message instead of a raw Stripe error.

## Attaching an invoice

Upload first, reference second. This keeps the payment call JSON,
validated and safe to retry.

```http
POST /invoices          (multipart: file, invoiceNumber)   -> { "id": 9 }
POST /payments          { ..., "invoiceId": 9 }
```

Accepted: PDF, PNG, JPEG, WebP, up to 10 MB. If the invoice already lives
in your system, send `externalUrl` instead of a file.

## Receiving callbacks

Bank debits settle over days, so the charge response cannot tell you the
outcome. Register a `webhookUrl` and we POST status changes to it.

Events: `payment.created`, `payment.processing`, `payment.succeeded`,
`payment.failed`, `payment.canceled`, `payment.requires_capture`,
`payment.captured`, `refund.created`, `refund.updated`.

```json
{
  "type": "payment.succeeded",
  "createdAt": "2026-09-01T10:04:11.000Z",
  "data": {
    "paymentId": 42,
    "externalReference": "INS-2043",
    "status": "succeeded",
    "amount": 42000,
    "amountReceived": 42000,
    "amountRefunded": 0,
    "currency": "cad",
    "method": "acss_debit"
  }
}
```

### Verifying the signature

Every callback carries `X-Ledger-Signature`: HMAC-SHA256 of the **raw
body**, hex encoded, using your webhook secret. Verify it before acting.

```js
const expected = crypto
  .createHmac('sha256', process.env.LEDGER_WEBHOOK_SECRET)
  .update(rawBody)          // exact bytes, not re-serialized JSON
  .digest('hex');

if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))) {
  return res.status(400).end();
}
```

Return **2xx** to acknowledge. Anything else is retried with exponential
backoff (~1m, 2m, 4m … up to 8 attempts). Deliveries are recorded, so a
platform that was down can be replayed rather than losing events.

Callbacks may arrive more than once — key your handler on `paymentId`
plus `status` and make it idempotent.

## Reconciliation

`GET /payments?externalReference=INS-2043` returns every payment against
one of your records. `GET /payments?status=succeeded&limit=100&offset=0`
pages through everything.
