import { http, HttpResponse } from "msw";
import { POST as stripeWebhook } from "~/app/api/payment/stripeWebhook/route";
import { stripe } from "~/server/stripe";

/**
 * A small, stateful fake of the parts of the Stripe API the app uses.
 *
 * The app talks to it through the real Stripe SDK (intercepted by MSW), and
 * tests drive the "Stripe side" of a payment with the helpers on `fakeStripe`,
 * which deliver properly signed webhook events to the real webhook route.
 */

const API = "https://api.stripe.com/v1";

type Metadata = Record<string, string>;

interface FakePaymentIntent {
  id: string;
  object: "payment_intent";
  amount: number;
  currency: string;
  description: string;
  customer: string;
  metadata: Metadata;
  status: "requires_payment_method" | "succeeded";
  client_secret: string;
  latest_charge: string | null;
}

interface FakeCharge {
  id: string;
  object: "charge";
  amount: number;
  amount_refunded: number;
  refunded: boolean;
  currency: string;
  status: "succeeded";
  payment_intent: string;
  balance_transaction: string;
  metadata: Metadata;
  failure_code: string | null;
  failure_message: string | null;
}

interface FakeRefund {
  id: string;
  object: "refund";
  amount: number;
  charge: string;
  payment_intent: string;
  reason: string | null;
  status: "pending" | "succeeded" | "failed";
}

interface FakeBalanceTransaction {
  id: string;
  object: "balance_transaction";
  amount: number;
  fee: number;
  net: number;
  currency: string;
}

interface FakeCustomer {
  id: string;
  object: "customer";
  email: string;
  name: string;
}

export interface StripeApiRequest {
  method: string;
  path: string;
  body: Record<string, unknown>;
}

interface WebhookEvent {
  id: string;
  object: "event";
  type: string;
  data: { object: unknown };
}

const createState = () => ({
  seq: 0,
  customers: [] as FakeCustomer[],
  paymentIntents: new Map<string, FakePaymentIntent>(),
  charges: new Map<string, FakeCharge>(),
  refunds: new Map<string, FakeRefund>(),
  balanceTransactions: new Map<string, FakeBalanceTransaction>(),
  requests: [] as StripeApiRequest[],
  events: [] as WebhookEvent[]
});

let state = createState();

export const resetFakeStripe = () => {
  state = createState();
};

const nextId = (prefix: string) => `${prefix}_test_${++state.seq}`;

/** Parses Stripe's form encoding (`metadata[type]=EVENT`) into a nested object. */
const parseForm = (body: string) => {
  const out: Record<string, unknown> = {};
  for (const [rawKey, value] of new URLSearchParams(body)) {
    const keys = rawKey.replace(/\]/g, "").split("[");
    let target = out;
    keys.forEach((key, index) => {
      if (index === keys.length - 1) {
        target[key] = value;
      } else {
        target = (target[key] ??= {}) as Record<string, unknown>;
      }
    });
  }
  return out;
};

const stripeError = (message: string, status = 400) =>
  HttpResponse.json(
    { error: { type: "invalid_request_error", message } },
    { status }
  );

const list = <T>(data: T[], url: string) =>
  HttpResponse.json({ object: "list", data, has_more: false, url });

const recordRequest = async (request: Request) => {
  const url = new URL(request.url);
  const body =
    request.method === "GET"
      ? Object.fromEntries(url.searchParams)
      : parseForm(await request.text());
  state.requests.push({ method: request.method, path: url.pathname, body });
  return body;
};

const unrefundedAmount = (charge: FakeCharge) => {
  const reserved = [...state.refunds.values()]
    .filter((r) => r.charge === charge.id && r.status !== "failed")
    .reduce((acc, r) => acc + r.amount, 0);
  return charge.amount - reserved;
};

export const stripeHandlers = [
  http.get(`${API}/customers`, async ({ request }) => {
    const query = await recordRequest(request);
    const customers = state.customers.filter((c) => c.email === query.email);
    return list(customers, "/v1/customers");
  }),

  http.post(`${API}/customers`, async ({ request }) => {
    const body = await recordRequest(request);
    const customer: FakeCustomer = {
      id: nextId("cus"),
      object: "customer",
      email: String(body.email),
      name: String(body.name)
    };
    state.customers.push(customer);
    return HttpResponse.json(customer);
  }),

  http.post(`${API}/payment_intents`, async ({ request }) => {
    const body = await recordRequest(request);
    const amount = Number(body.amount);
    if (!Number.isInteger(amount) || amount < 1) {
      return stripeError(`Invalid integer: ${String(body.amount)}`);
    }
    const id = nextId("pi");
    const paymentIntent: FakePaymentIntent = {
      id,
      object: "payment_intent",
      amount,
      currency: String(body.currency),
      description: String(body.description),
      customer: String(body.customer),
      metadata: (body.metadata ?? {}) as Metadata,
      status: "requires_payment_method",
      client_secret: `${id}_secret_test`,
      latest_charge: null
    };
    state.paymentIntents.set(id, paymentIntent);
    return HttpResponse.json(paymentIntent);
  }),

  http.post(`${API}/refunds`, async ({ request }) => {
    const body = await recordRequest(request);
    const amount = Number(body.amount);
    if (!/^\d+$/.test(String(body.amount)) || amount < 1) {
      return stripeError(`Invalid integer: ${String(body.amount)}`);
    }
    const paymentIntent = state.paymentIntents.get(String(body.payment_intent));
    const charge = paymentIntent?.latest_charge
      ? state.charges.get(paymentIntent.latest_charge)
      : undefined;
    if (!paymentIntent) {
      return stripeError(`No such payment_intent: '${String(body.payment_intent)}'`, 404);
    }
    if (!charge) {
      return stripeError(
        `This PaymentIntent (${paymentIntent.id}) does not have a successful charge to refund.`
      );
    }
    const refundable = unrefundedAmount(charge);
    if (amount > refundable) {
      return stripeError(
        `Refund amount (${amount}) is greater than unrefunded amount on charge (${refundable})`
      );
    }
    const refund: FakeRefund = {
      id: nextId("re"),
      object: "refund",
      amount,
      charge: charge.id,
      payment_intent: paymentIntent.id,
      reason: (body.reason as string | undefined) ?? null,
      status: "pending"
    };
    state.refunds.set(refund.id, refund);
    return HttpResponse.json(refund);
  }),

  http.get(`${API}/balance_transactions/:id`, async ({ request, params }) => {
    await recordRequest(request);
    const transaction = state.balanceTransactions.get(String(params.id));
    if (!transaction) {
      return stripeError(`No such balance transaction: '${String(params.id)}'`, 404);
    }
    return HttpResponse.json(transaction);
  })
];

const createEvent = (type: string, object: unknown): WebhookEvent => {
  const event = {
    id: nextId("evt"),
    object: "event" as const,
    api_version: "2026-05-27.dahlia",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
    // Snapshot the object as it looked when the event was created.
    data: { object: structuredClone(object) }
  };
  state.events.push(event);
  return event;
};

/** Delivers a raw payload to the real webhook route, like Stripe would. */
export const postToWebhook = async (
  payload: string,
  signature: string | null = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET ?? ""
  })
) => {
  const headers = new Headers({ "content-type": "application/json" });
  if (signature !== null) headers.set("stripe-signature", signature);
  return stripeWebhook(
    new Request("http://localhost:3000/api/payment/stripeWebhook", {
      method: "POST",
      headers,
      body: payload
    })
  );
};

const deliver = (event: WebhookEvent) => postToWebhook(JSON.stringify(event));

const getPaymentIntent = (id: string) => {
  const paymentIntent = state.paymentIntents.get(id);
  if (!paymentIntent) throw new Error(`fakeStripe: unknown payment intent ${id}`);
  return paymentIntent;
};

const getChargeFor = (paymentIntentId: string) => {
  const { latest_charge } = getPaymentIntent(paymentIntentId);
  const charge = latest_charge ? state.charges.get(latest_charge) : undefined;
  if (!charge) throw new Error(`fakeStripe: payment intent ${paymentIntentId} has no charge`);
  return charge;
};

export const fakeStripe = {
  /** Every request the app made to the Stripe API, in order. */
  requests: () => state.requests,
  requestsTo: (method: string, path: string) =>
    state.requests.filter((r) => r.method === method && r.path === `/v1${path}`),
  customers: () => state.customers,
  paymentIntents: () => [...state.paymentIntents.values()],
  refunds: () => [...state.refunds.values()],
  events: () => state.events,

  paymentIntentByClientSecret: (clientSecret: string | null | undefined) => {
    const paymentIntent = [...state.paymentIntents.values()].find(
      (pi) => pi.client_secret === clientSecret
    );
    if (!paymentIntent) throw new Error(`fakeStripe: no payment intent for ${clientSecret}`);
    return paymentIntent;
  },

  /** The customer completes the payment: creates the charge and sends `payment_intent.succeeded`. */
  succeedPayment: (paymentIntentId: string) => {
    const paymentIntent = getPaymentIntent(paymentIntentId);
    const transaction: FakeBalanceTransaction = {
      id: nextId("txn"),
      object: "balance_transaction",
      amount: paymentIntent.amount,
      fee: 0,
      net: paymentIntent.amount,
      currency: paymentIntent.currency
    };
    const charge: FakeCharge = {
      id: nextId("ch"),
      object: "charge",
      amount: paymentIntent.amount,
      amount_refunded: 0,
      refunded: false,
      currency: paymentIntent.currency,
      status: "succeeded",
      payment_intent: paymentIntent.id,
      balance_transaction: transaction.id,
      metadata: { ...paymentIntent.metadata },
      failure_code: null,
      failure_message: null
    };
    state.balanceTransactions.set(transaction.id, transaction);
    state.charges.set(charge.id, charge);
    paymentIntent.status = "succeeded";
    paymentIntent.latest_charge = charge.id;
    return deliver(createEvent("payment_intent.succeeded", paymentIntent));
  },

  /** The customer's payment fails: sends `payment_intent.payment_failed`. */
  failPayment: (paymentIntentId: string) => {
    const paymentIntent = getPaymentIntent(paymentIntentId);
    return deliver(
      createEvent("payment_intent.payment_failed", {
        ...paymentIntent,
        last_payment_error: { code: "card_declined", message: "Your card was declined." }
      })
    );
  },

  /** Stripe settles the charge and reports its fee: sends `charge.updated`. */
  settleCharge: (paymentIntentId: string, { fee }: { fee: number }) => {
    const charge = getChargeFor(paymentIntentId);
    const transaction = state.balanceTransactions.get(charge.balance_transaction)!;
    transaction.fee = fee;
    transaction.net = transaction.amount - fee;
    return deliver(createEvent("charge.updated", charge));
  },

  /** A refund created through the API goes through: sends `charge.refunded`. */
  completeRefund: (refundId: string) => {
    const refund = state.refunds.get(refundId);
    if (!refund) throw new Error(`fakeStripe: unknown refund ${refundId}`);
    const charge = state.charges.get(refund.charge)!;
    refund.status = "succeeded";
    charge.amount_refunded += refund.amount;
    charge.refunded = charge.amount_refunded >= charge.amount;
    return deliver(createEvent("charge.refunded", charge));
  },

  /** An admin refunds a payment from the Stripe dashboard (defaults to the full amount). */
  refundFromDashboard: (paymentIntentId: string, amount?: number) => {
    const charge = getChargeFor(paymentIntentId);
    const refund: FakeRefund = {
      id: nextId("re"),
      object: "refund",
      amount: amount ?? unrefundedAmount(charge),
      charge: charge.id,
      payment_intent: paymentIntentId,
      reason: null,
      status: "pending"
    };
    state.refunds.set(refund.id, refund);
    return fakeStripe.completeRefund(refund.id);
  },

  /** Stripe retries delivery of an event it already sent. */
  redeliver: (eventId: string) => {
    const event = state.events.find((e) => e.id === eventId);
    if (!event) throw new Error(`fakeStripe: unknown event ${eventId}`);
    return deliver(event);
  }
};
