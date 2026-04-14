import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bundle } from '../bundle/bundle.entity';

@Injectable()
export class PaymentService {
  private stripe: Stripe | null;

  constructor(
  @InjectRepository(Bundle)
  private bundleRepo: Repository<Bundle>,
) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  console.log("🔥 STRIPE KEY FULL:", stripeKey);
  console.log("🔥 STRIPE KEY LENGTH:", stripeKey?.length);

if (!stripeKey) {
  console.warn("⚠️ STRIPE DISABLED");
  this.stripe = null;
  return;
}

this.stripe = new Stripe(stripeKey);

// ✅ NOW it's safe
console.log("🔥 STRIPE INSTANCE:", !!this.stripe);

  if (!stripeKey) {
    console.warn("⚠️ STRIPE DISABLED");
    this.stripe = null;
    return;
  }

  this.stripe = new Stripe(stripeKey);
}

  // =========================
  // 💳 CREATE CHECKOUT SESSION
  // =========================
  
  async createCheckoutSession(
    reg: string,
    pkg?: string,
    bundle?: number
) {
  console.log("🚀 FUNCTION HIT: createCheckoutSession");
  console.log("🔥 CHECKOUT REQUEST:", { reg, pkg, bundle });

  try {
    if (!this.stripe) {
      return { error: 'Payments not configured' };
    }

    let price: number | null = null;
    let name = '';

    if (pkg === 'basic') {
      price = 199;
      name = `Basic Report (${reg})`;
    }

    if (pkg === 'standard') {
      price = 499;
      name = `Standard Report (${reg})`;
    }

    if (pkg === 'premium') {
      price = 999;
      name = `Premium Report (${reg})`;
    }

    if (bundle === 3) {
      price = 1499;
      name = `Bundle 3 Checks`;
    }

    if (bundle === 5) {
      price = 1999;
      name = `Bundle 5 Checks`;
    }

    if (!price) {
      throw new Error('Invalid selection');
    }

    // 🔥 MOVE IT HERE (RIGHT BEFORE STRIPE CALL)
    const successUrl = `http://127.0.0.1:5501/result.html?session_id={CHECKOUT_SESSION_ID}&reg=${reg}`;
    const cancelUrl = `http://127.0.0.1:5501/result.html?reg=${reg}`;

    console.log("🔥🔥🔥 SUCCESS URL BEING SENT TO STRIPE:");
    console.log(successUrl);

    // ✅ USE VARIABLES HERE
    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',

      customer_creation: 'always',
      billing_address_collection: 'auto',

      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: { name },
            unit_amount: price,
          },
          quantity: 1,
        },
      ],

      success_url: successUrl,   // ✅ FIXED
      cancel_url: cancelUrl,     // ✅ FIXED

      metadata: {
        reg: reg || '',
        pkg: pkg || '',
        bundle: bundle ? bundle.toString() : '',
      },
    });

    return { url: session.url || null };

  } catch (error: any) {
    console.error("🔥 STRIPE ERROR:", error.message);
    return { error: 'Payment failed' };
  }
}

  // =========================
  // ✅ GET SESSION
  // =========================
  async getSession(sessionId: string) {
    try {
      if (!this.stripe) {
        return { error: 'Payments not configured' };
      }

      const session = await this.stripe.checkout.sessions.retrieve(sessionId);

      // 🔥 CREATE BUNDLE IF PAID
      if (session.payment_status === 'paid' && session.metadata?.bundle) {
        await this.createBundleFromPayment(session);
      }

      return session;

    } catch (error: any) {
      console.error("🔥 STRIPE SESSION ERROR:", error.message);
      return { error: 'Failed to retrieve session' };
    }
  }

  // =========================
  // 🎟️ CREATE BUNDLE (SAFE)
  // =========================
  async createBundleFromPayment(session: any) {
    const bundle = session.metadata?.bundle;
    if (!bundle) return;

    const total = Number(bundle);
    const userId = session.customer_details?.email || 'guest';

    // 🚫 PREVENT DUPLICATES (ONLY NEED SESSION ID)
    const existing = await this.bundleRepo.findOne({
      where: {
        stripeSessionId: session.id,
      },
    });

    if (existing) {
      console.log("⚠️ Bundle already exists");
      return;
    }

    await this.bundleRepo.save({
      userId,
      total,
      remaining: total,
      type: `bundle_${bundle}`,
      stripeSessionId: session.id,
    });

    console.log("✅ Bundle created");
  }
}