import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentService {
  private stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2023-10-16' as any,
  });

  constructor(private prisma: PrismaService) {}

  async createCheckoutSession(reg: string) {
    const payment = await this.prisma.payment.create({
      data: {
        reg,
        status: 'pending',
      },
    });
    const successUrl = `http://localhost:3000/success.html?session_id={CHECKOUT_SESSION_ID}&t=${Date.now()}`;
    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',

      metadata: {
        reg: reg, // ✅ important
      },

      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: `Vehicle check for ${reg}`,
            },
            unit_amount: 500,
          },
          quantity: 1,
        },
      ],

         success_url: `http://localhost:8080/success.html?session_id={CHECKOUT_SESSION_ID}`,
         cancel_url: `http://localhost:8080/index.html`,
    });

    return { url: session.url };
  }

  async markAsPaid(paymentId: string) {
    return this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'paid' },
    });
  }

  // ✅ ADD THIS
  async getSession(sessionId: string) {
    return this.stripe.checkout.sessions.retrieve(sessionId);
  }
}