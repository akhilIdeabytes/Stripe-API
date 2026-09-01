# Stripe API

A NestJS + TypeORM (MySQL) service that wraps Stripe for order-based
payments: card checkout, ACH/PAD bank debits, refunds, payouts, and a
webhook handler that keeps local records in sync with Stripe.

## Setup

```bash
cp .env.example .env   # fill in your Stripe keys and DB credentials
npm install
npm run start:dev
```

For local webhook testing, run the Stripe CLI alongside the server:

```bash
npm run stripe:listen
```

This forwards events to `POST /webhooks/stripe` and prints a
`whsec_...` signing secret to put in `STRIPE_WEBHOOK_SECRET`.

## Architecture

- `stripe/` - `StripeService` wraps the Stripe SDK; it's the only place
  the `stripe` package is imported directly.
- `customers/`, `orders/`, `payments/`, `refunds/`, `payouts/` - each
  keeps a local TypeORM entity mirroring the corresponding Stripe object,
  so reads don't require a round-trip to Stripe.
- `webhooks/` - verifies Stripe's signature on the raw request body and
  updates local records (`Payment`, `Refund`, `Payout`, `Order`) based on
  the event type.
- `common/filters/http-exception.filter.ts` - global filter that turns
  `HttpException`s, raw `Stripe.errors.StripeError`s, and anything else
  into a consistent `{ statusCode, message, error? }` JSON body.

## API

### Customers
| Method | Path             | Body                          |
|--------|------------------|--------------------------------|
| POST   | `/customers`     | `{ email, name?, phone? }`     |
| GET    | `/customers`     | -                               |
| GET    | `/customers/:id` | -                               |

### Orders
| Method | Path          | Body                                                              |
|--------|---------------|--------------------------------------------------------------------|
| POST   | `/orders`     | `{ customerId?, currency?, items: [{ name, unitAmount, quantity }] }` |
| GET    | `/orders`     | -                                                                    |
| GET    | `/orders/:id` | -                                                                    |

### Payments
| Method | Path                                | Notes                                              |
|--------|-------------------------------------|-----------------------------------------------------|
| POST   | `/payments/checkout-session`        | `{ orderId }` - card payment via Stripe Checkout     |
| GET    | `/payments/session/:sessionId`      | Live session + line items from Stripe                |
| POST   | `/payments/bank-payment-intent`     | `{ orderId, customerId, paymentMethodType }` - ACH/PAD |
| GET    | `/payments/:id`                     | Local payment record (with refunds)                  |
| GET    | `/payments/intent/:paymentIntentId/live` | Live PaymentIntent detail from Stripe            |

All `POST` routes accept an optional `Idempotency-Key` header, forwarded
to Stripe.

### Refunds
| Method | Path                          | Body                                    |
|--------|-------------------------------|-------------------------------------------|
| POST   | `/refunds`                    | `{ paymentId, amount?, reason? }`         |
| GET    | `/refunds/:id`                | -                                          |
| GET    | `/refunds/payment/:paymentId` | List refunds for a payment                |
| POST   | `/refunds/:id/cancel`         | Only while status is `requires_action`    |

### Payouts
| Method | Path                | Body                                     |
|--------|---------------------|--------------------------------------------|
| POST   | `/payouts`          | `{ amount?, currency?, method? }`          |
| GET    | `/payouts`          | -                                            |
| GET    | `/payouts/:id`      | Local payout record                          |
| GET    | `/payouts/:id/live` | Live detail from Stripe                      |
| POST   | `/payouts/:id/cancel` | Only while status is `pending`             |

### Webhooks
| Method | Path              | Notes                                                     |
|--------|-------------------|-------------------------------------------------------------|
| POST   | `/webhooks/stripe` | Verifies `stripe-signature`; handles checkout, PaymentIntent, refund, and payout events |
