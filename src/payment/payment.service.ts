import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class PaymentService {
  private stripe: Stripe | null;

  constructor() {
    const stripeKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeKey) {
      console.warn("⚠️ STRIPE DISABLED");
      this.stripe = null;
      return;
    }

    this.stripe = new Stripe(stripeKey, {
      apiVersion: '2026-02-25.clover',
    });
  }

  // ✅ CREATE CHECKOUT SESSION (WITH PACKAGE)
  async createCheckoutSession(reg: string, pkg: string) {
    try {
      if (!this.stripe) {
        return { error: 'Payments not configured' };
      }

      // 💰 PRICE LOGIC
      let price = 499;

      if (pkg === 'basic') price = 199;
      if (pkg === 'standard') price = 499;
      if (pkg === 'premium') price = 999;

      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: 'gbp',
              product_data: {
                name: `Vehicle Report (${reg}) - ${pkg}`,
              },
              unit_amount: price,
            },
            quantity: 1,
          },
        ],
        success_url: `http://127.0.0.1:8080/success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `http://127.0.0.1:8080`,
        metadata: { reg, pkg },
      });

      return { url: session.url || null };

    } catch (error: any) {
      console.error("🔥 STRIPE ERROR:", error.message);
      return { error: 'Payment failed' };
    }
  }

  // ✅ GET SESSION
  async getSession(sessionId: string) {
    try {
      if (!this.stripe) {
        return { error: 'Payments not configured' };
      }

      const session = await this.stripe.checkout.sessions.retrieve(sessionId);
      return session;

    } catch (error: any) {
      console.error("🔥 STRIPE SESSION ERROR:", error.message);
      return { error: 'Failed to retrieve session' };
    }
  }
}