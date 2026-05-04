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

    const stripeKey =
      process.env.STRIPE_SECRET_KEY;

    if (!stripeKey) {

      console.error(
        '❌ STRIPE_SECRET_KEY missing'
      );

      this.stripe = null;

      return;
    }

    this.stripe = new Stripe(
      stripeKey,
      {
        apiVersion: '2026-02-25.clover',
      }
    );
  }

  // =========================
  // 💳 CREATE CHECKOUT SESSION
  // =========================

  async createCheckoutSession(body: any) {

    const reg =
      body?.registration ||
      body?.reg;

    const tier =
      body?.tier ||
      'standard';

    const type =
      body?.type ||
      'single';

    const quantity =
      Number(body?.quantity || 1);

    const email =
      body?.email || null;

    // =========================
    // VALIDATION
    // =========================

    if (
      !reg ||
      typeof reg !== 'string'
    ) {
      throw new Error(
        'Registration required'
      );
    }

    if (
      !['standard', 'premium']
        .includes(tier)
    ) {
      throw new Error(
        'Invalid tier'
      );
    }

    if (
      ![
        'single',
        'bundle',
        'upgrade',
      ].includes(type)
    ) {
      throw new Error(
        'Invalid type'
      );
    }

    if (!this.stripe) {
      throw new Error(
        'Stripe not initialized'
      );
    }

    // =========================
    // PRICING
    // =========================

    let price = 599;

    let name =
      'Standard Vehicle Check';

    if (
      type === 'upgrade'
    ) {

      if (
        tier !== 'premium'
      ) {
        throw new Error(
          'Upgrade must target premium tier'
        );
      }

      price = 300;

      name =
        'Premium Upgrade';
    }

    else if (
      type === 'single'
    ) {

      price =
        tier === 'premium'
          ? 899
          : 100;

      name =
        tier === 'premium'
          ? 'Premium Vehicle Check'
          : 'Standard Vehicle Check';
    }

    else if (
      type === 'bundle'
    ) {

      if (
        quantity !== 3 &&
        quantity !== 5
      ) {
        throw new Error(
          'Invalid bundle quantity'
        );
      }

      if (
        tier === 'premium'
      ) {

        price =
          quantity === 3
            ? 1999
            : 2999;

        name =
          `${quantity} Premium Reports`;
      }

      else {

        price =
          quantity === 3
            ? 1499
            : 2299;

        name =
          `${quantity} Standard Reports`;
      }
    }

    // =========================
    // METADATA
    // =========================

    const metadata:
      Record<string, string> = {

      reg: String(reg),
      tier,
      type,
      quantity:
        String(quantity),
    };

    if (
      type === 'upgrade'
    ) {
      metadata.upgradeFrom =
        'standard';
    }

    // =========================
    // CREATE SESSION
    // =========================

    const session =
      await this.stripe
        .checkout
        .sessions
        .create({

          payment_method_types: [
            'card',
          ],

          mode: 'payment',

          line_items: [
            {
              price_data: {

                currency: 'gbp',

                product_data: {
                  name,
                },
                unit_amount:
                  price,
              },
              quantity: 1,
            },
          ],

          success_url:'https://www.cheapregcheck.com/success.html?session_id={CHECKOUT_SESSION_ID}',
          cancel_url:'https://www.cheapregcheck.com/cancel.html',

          customer_email:
            typeof email === 'string'
              ? email
              : undefined,

          metadata,
        });
    return session;
  }

  // =========================
  // 🔔 STRIPE WEBHOOK
  // =========================

  async handleWebhook(
    req: any,
    signature: string,
  ) {

    if (!this.stripe) {
      throw new Error(
        'Stripe not initialized'
      );
    }

    const webhookSecret =
      process.env
        .STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new Error(
        'Missing webhook secret'
      );
    }

    let event: Stripe.Event;
    try {
      event =
        this.stripe.webhooks
          .constructEvent(
            req.rawBody,
            signature,
            webhookSecret,
          );
    } catch (err: any) {

      console.error(
        '❌ Webhook signature failed:',
        err.message,
      );

      throw new Error(
        'Invalid webhook signature'
      );
    }

    switch (event.type) {

      case
        'checkout.session.completed':
        const session =
          event.data.object as
          Stripe.Checkout.Session;

        console.log(
          '✅ PAYMENT SUCCESS:',
          session.id,
        );

        console.log(
          '✅ METADATA:',
          session.metadata,
        );

        if (
          session.metadata?.type ===
          'bundle'
        ) {

          const email =
            session.customer_details
              ?.email ||
            session.customer_email ||
            'guest';

          await this.createBundle(

            email,

            Number(
              session.metadata
                .quantity || 1
            ),
            session.metadata
              .tier ||
              'standard',
          );
        }
        break;
      default:

        console.log(
          `Unhandled event: ${event.type}`
        );
    }

    return {
      received: true,
    };
  }

  // =========================
  // 📦 GET SESSION
  // =========================

  async getSession(
    sessionId: string
  ) {

    try {

      if (!this.stripe) {
        return {
          error:
            'Payments not configured',
        };
      }

      const session =
        await this.stripe
          .checkout
          .sessions
          .retrieve(
            sessionId
          );

      return session;

    } catch (
      error: any
    ) {

      console.error(
        '🔥 SESSION ERROR:',
        error.message
      );

      return {
        error:
          'Failed to retrieve session',
      };
    }
  }

  // =========================
  // 🎟️ CREATE / TOP-UP BUNDLE
  // =========================

  async createBundle(
    email: string,
    quantity: number,
    tier: string,
  ) {

    if (
      !email ||
      quantity <= 0
    ) {
      return;
    }

    const existing =
      await this.bundleRepo.findOne({
        where: {
          email,
          active: true,
        },

        order: {
          createdAt:
            'DESC',
        },
      });

    if (existing) {
      existing.remaining +=
        quantity;
      existing.active =
        true;
      existing.tier =
        tier;
      await this.bundleRepo
        .save(existing);
      console.log(
        '✅ Bundle topped up'
      );
      return;
    }

    const bundle: any = {
      email,
      remaining:
        quantity,
      active: true,
      tier,
    };

    await this.bundleRepo
      .save(bundle);

    console.log(
      '✅ New bundle created'
    );
  }
}