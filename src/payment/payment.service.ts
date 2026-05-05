import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bundle } from '../bundle/bundle.entity';
import { logger } from '../logger';
import * as Sentry from '@sentry/node';
import { ConsumedSession } from './consumed-session.entity';
import { EmailService } from '../common/email.service';
import { VehicleService } from '../vehicle/vehicle.service';
import { Inject, forwardRef } from '@nestjs/common';

@Injectable()
export class PaymentService {
  private stripe: Stripe | null;
  constructor(
  @InjectRepository(Bundle)
  private bundleRepo: Repository<Bundle>,
  @InjectRepository(ConsumedSession)
  private consumedSessionRepo: Repository<ConsumedSession>,
  @Inject(forwardRef(() => VehicleService))
  private vehicleService: VehicleService,
  private emailService: EmailService,

) {

    const stripeKey =
      process.env.STRIPE_SECRET_KEY;
      console.log('🔥 STRIPE KEY USED:', stripeKey?.slice(0, 10));
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

    logger.info({
      event: 'CHECKOUT_CREATED',
      reg,
      tier,
      type,
      quantity,
    });

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

async handleWebhook(req: any, signature: string) {

  if (!this.stripe) {
    throw new Error('Stripe not initialized');
  }

  const webhookSecret =
    process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;

  try {
    event = this.stripe.webhooks.constructEvent(
      req.rawBody,
      signature,
      webhookSecret as string,
    );
  } catch (err: any) {

    logger.error({
      event: 'STRIPE_WEBHOOK_SIGNATURE_FAILED',
      error: err.message,
    });

    Sentry.captureException(err);

    throw new Error('Invalid webhook signature');
  }

  switch (event.type) {

    case 'checkout.session.completed': {

  const session =
    event.data.object as Stripe.Checkout.Session;

  const reg = session.metadata?.reg;
  const tier = session.metadata?.tier || 'standard';

  const email =
    session.customer_details?.email ||
    session.customer_email ||
    'guest';

  // 🚨 HARD VALIDATION
  if (!reg) {
    logger.error({
      event: 'MISSING_REG_IN_METADATA',
      sessionId: session.id,
      metadata: session.metadata,
    });
    break;
  }

  // 🔁 Prevent duplicates
  const existing =
    await this.consumedSessionRepo.findOne({
      where: { sessionId: session.id },
    });

  if (existing) {
    logger.warn({
      event: 'STRIPE_DUPLICATE_WEBHOOK',
      sessionId: session.id,
    });
    break;
  }

  logger.info({
    event: 'STRIPE_PAYMENT_SUCCESS',
    sessionId: session.id,
    reg,
    email,
    tier,
  });

  // =========================
  // 🎟️ BUNDLE HANDLING
  // =========================
  if (session.metadata?.type === 'bundle') {

    await this.createBundle(
      email,
      Number(session.metadata.quantity || 1),
      tier,
    );

    logger.info({
      event: 'BUNDLE_CREATED',
      email,
      quantity: Number(session.metadata.quantity || 1),
      tier,
    });
  }

  // =========================
  // 📊 GENERATE REPORT
  // =========================
  let report: any;

  try {
    report =
      await this.vehicleService.getFullReport(
        reg,
        session.id,
      );

    logger.info({
      event: 'REPORT_GENERATED',
      reg,
      tier,
    });

  } catch (err: any) {

    logger.error({
      event: 'REPORT_GENERATION_FAILED',
      error: err.message,
      reg,
    });

    Sentry.captureException(err);
  }

  // =========================
  // 📄 GENERATE PDF
  // =========================
  let pdfBuffer: Buffer | null = null;

  try {
    pdfBuffer =
      await this.vehicleService.generatePdfBuffer(
        reg,
        report,
        tier,
      );

  } catch (err: any) {
    logger.error({
      event: 'PDF_GENERATION_FAILED',
      error: err.message,
      reg,
    });
  }

  // =========================
  // 📧 SEND EMAIL
  // =========================
  try {
    if (pdfBuffer) {
      await this.emailService.sendReport({
        to: email,
        reg,
        tier,
        pdfBuffer,
      });

      logger.info({
        event: 'EMAIL_SENT',
        email,
        reg,
      });
    }

  } catch (err: any) {

    logger.error({
      event: 'EMAIL_FAILED',
      error: err.message,
      email,
    });

    Sentry.captureException(err);
  }

  // =========================
  // 💾 SAVE SESSION (LAST)
  // =========================
  await this.consumedSessionRepo.save({
    sessionId: session.id,
    reg,
    email,
  });

  break;
}

    default:
      logger.info({
        event: 'STRIPE_UNHANDLED_EVENT',
        type: event.type,
      });
  }

  return { received: true };
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

      Sentry.captureException(error);

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
          email: email || 'guest',
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
      email: email || 'guest',
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