// import { Injectable } from '@nestjs/common';
// import Stripe from 'stripe';
// import { InjectRepository } from '@nestjs/typeorm';
// import { Repository } from 'typeorm';
// import { Bundle } from '../bundle/bundle.entity';

// @Injectable()
// export class PaymentService {
//   private stripe: Stripe | null;

//  constructor(
//   @InjectRepository(Bundle)
//   private bundleRepo: Repository<Bundle>,
// ) {

//   const stripeKey =
//   process.env.STRIPE_SECRET_KEY_NEW;

//     console.log(
//   '🔥 STRIPE MODE:',
//   stripeKey?.startsWith('sk_live_')
//     ? 'LIVE'
//     : 'TEST'
// );

//   if (!stripeKey) {

//     this.stripe = null;

//     return;
//   }

//   this.stripe =
//     new Stripe(stripeKey);
// }

//   // =========================
//   // 💳 CREATE CHECKOUT SESSION
//   // =========================
//   async createCheckoutSession(body: any) {
//   console.log("🔥 RAW BODY RECEIVED:", body);
//   const reg = body?.registration || body?.reg;
//   const tier = body?.tier || 'standard';
//   const type = body?.type || 'single';
//   const quantity = Number(body?.quantity || 1);
//   const email = body?.email || null;
//   console.log("🔥 NORMALIZED INPUT:", {
//     reg,
//     tier,
//     type,
//     quantity,
//     email,
//   });

//   // ─────────────────────────────
//   // VALIDATION
//   // ─────────────────────────────

//   if (!reg || typeof reg !== 'string') {
//     throw new Error('Registration required');
//   }
//   if (!['standard', 'premium'].includes(tier)) {
//     throw new Error('Invalid tier');
//   }
//   if (!['single', 'bundle', 'upgrade'].includes(type)) {
//     throw new Error('Invalid type');
//   }
//   if (!this.stripe) {
//     throw new Error('Stripe not initialized');
//   }

//   // ─────────────────────────────
//   // PRODUCT MATRIX
//   // ─────────────────────────────

//   let price = 199;
//   let name = 'Standard Check';

//   // =========================
//   // STANDARD SINGLE
//   // =========================

//   if (tier === 'standard' && type === 'single') {

//     price = 599;

//     name = 'Standard Check';
//   }

//   // =========================
//   // PREMIUM SINGLE
//   // =========================

//   if (tier === 'premium' && type === 'single') {

//     price = 899;

//     name = 'Premium Check';
//   }

//   // =========================
//   // STANDARD BUNDLES
//   // =========================

//   if (tier === 'standard' && type === 'bundle') {

//     if (quantity === 3) {

//       price = 1499;

//       name = '3 Standard Reports';
//     }

//     else if (quantity === 5) {

//       price = 2299;

//       name = '5 Standard Reports';
//     }

//     else {

//       throw new Error('Invalid standard bundle quantity');
//     }
//   }

//   // =========================
//   // PREMIUM BUNDLES
//   // =========================

//   if (tier === 'premium' && type === 'bundle') {

//     if (quantity === 3) {

//       price = 1999;

//       name = '3 Premium Reports';
//     }

//     else if (quantity === 5) {

//       price = 2999;

//       name = '5 Premium Reports';
//     }

//     else {

//       throw new Error('Invalid premium bundle quantity');
//     }
//   }

// // =========================
// // PREMIUM UPGRADE
// // Standard → Premium top-up
// // =========================

// if (
//   type === 'upgrade'
// ) {

//   if (
//     tier !== 'premium'
//   ) {

//     throw new Error(
//       'Upgrade must target premium tier'
//     );
//   }

//   if (
//     quantity !== 1
//   ) {

//     throw new Error(
//       'Upgrade quantity must be 1'
//     );
//   }

//   price = 300;

//   name =
//     'Premium Upgrade';
// }

// // =========================
// // SINGLE REPORT
// // =========================

// else if (
//   type === 'single'
// ) {

//   price =
//     tier === 'premium'
//       ? 999
//       : 599;

//   name =
//     tier === 'premium'
//       ? 'Premium Vehicle Check'
//       : 'Standard Vehicle Check';
// }

// // =========================
// // BUNDLE
// // =========================

// else if (
//   type === 'bundle'
// ) {

//   price = 1999;

//   name =
//     'Vehicle Check Bundle';
// }

// else {

//   throw new Error(
//     'Invalid type'
//   );
// }

// // ─────────────────────────────
// // METADATA
// // ─────────────────────────────

// const metadata:
//   Record<string, string> = {

//   reg: String(reg),
//   tier,
//   type,
//   quantity:
//     String(quantity),
// };

// if (
//   type === 'upgrade'
// ) {
//   metadata.upgradeFrom =
//     'standard';
// }

// console.log(
//   '🔥 STRIPE METADATA:',
//   metadata
// );


//   // ─────────────────────────────
//   // CREATE STRIPE SESSION
//   // ─────────────────────────────

//   const session = await this.stripe.checkout.sessions.create({
//     payment_method_types: ['card'],
//     mode: 'payment',
//     line_items: [
//       {
//         price_data: {
//           currency: 'gbp',
//           product_data: {
//             name,
//           },
//           unit_amount: price,
//         },
//         quantity: 1,
//       },
//     ],

//     success_url:
//   'https://www.cheapregcheck.com/success.html?session_id={CHECKOUT_SESSION_ID}',

// cancel_url:
//   'https://www.cheapregcheck.com/cancel.html',
  
//     customer_email:
//       typeof email === 'string'
//         ? email
//         : undefined,
//     metadata,
//   });

//   return session;
// }  async getSession(sessionId: string) {
//     try {
//       if (!this.stripe) {
//         return { error: 'Payments not configured' };
//       }
//       const session = await this.stripe.checkout.sessions.retrieve(sessionId);
//       return session;
//     } catch (error: any) {
//       console.error("🔥 SESSION ERROR:", error.message);
//       return { error: 'Failed to retrieve session' };
//     }
//   }

//   // =========================
//   // 🎟️ CREATE / TOP-UP BUNDLE
//   // =========================
//   async createBundle(
//   email: string,
//   quantity: number,
//   tier: string,
// ) {
//   if (!email || quantity <= 0) {
//     return;
//   }
//   const existing = await this.bundleRepo.findOne({
//     where: {
//       email,
//       active: true,
//     },
//     order: {
//       createdAt: 'DESC',
//     },
//   });

//   if (existing) {
//     existing.remaining += quantity;
//     existing.active = true;
//     existing.tier = tier;
//     await this.bundleRepo.save(existing);
//     console.log("✅ Bundle topped up");
//     return;
//   }

//   const bundle: any = {
//     email,
//     remaining: quantity,
//     active: true,
//     tier,
//   };
//   await this.bundleRepo.save(bundle);
//   console.log("✅ New bundle created");
// }
// }

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

console.log(
  '🔥 ENV CHECK:',
  Object.keys(process.env)
    .includes('LIVE_STRIPE_KEY_2026')
);

const stripeKey =
  process.env.PAYMENTS_LIVE_KEY;

console.log(
  '🔥 STRIPE PREFIX:',
  stripeKey?.slice(0, 8)
);

console.log(
  '🔥 STRIPE MODE:',
  stripeKey?.startsWith('sk_live_')
    ? 'LIVE'
    : 'TEST'
);

if (!stripeKey) {

  console.error(
    '❌ PAYMENTS_LIVE_KEY missing'
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

    console.log(
      '🔥 RAW BODY RECEIVED:',
      body
    );

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

    console.log(
      '🔥 NORMALIZED INPUT:',
      {
        reg,
        tier,
        type,
        quantity,
        email,
      }
    );

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
          ? 999
          : 599;

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

    console.log(
      '🔥 STRIPE METADATA:',
      metadata
    );

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

          success_url:
            'https://www.cheapregcheck.com/success.html?session_id={CHECKOUT_SESSION_ID}',

          cancel_url:
            'https://www.cheapregcheck.com/cancel.html',

          customer_email:
            typeof email === 'string'
              ? email
              : undefined,

          metadata,
        });

    return session;
  }

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