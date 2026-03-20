import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class PaymentService {
  private stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2023-10-16' as any,
  });

  async createCheckoutSession(reg: string) {
    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',

      metadata: {
        reg: reg, // keep this
      },

      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: `Vehicle check for ${reg}`,
            },
            unit_amount: 500, // £5.00
          },
          quantity: 1,
        },
      ],

      success_url: `http://localhost:8080/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `http://localhost:8080/index.html`,
    });

    return { url: session.url };
  }

  async getSession(sessionId: string) {
    return this.stripe.checkout.sessions.retrieve(sessionId);
  }
}