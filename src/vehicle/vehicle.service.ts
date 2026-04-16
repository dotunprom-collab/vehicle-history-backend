import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report } from '../reports/report.entity';
import { Bundle } from '../bundle/bundle.entity';
import { PaymentService } from '../payment/payment.service';

@Injectable()
export class VehicleService {

  constructor(
    @InjectRepository(Report)
    private reportRepo: Repository<Report>,

    @InjectRepository(Bundle)
    private bundleRepo: Repository<Bundle>,

    private paymentService: PaymentService
  ) {}

  // =========================
  // 🟢 FREE PREVIEW
  // =========================
  async getPreview(reg: string) {
    try {
      const full = await this.getFull(reg);

      return {
        make: full?.vehicle?.make || null,
        model: full?.vehicle?.model || null,
        year: null,
        fuel: null,
        colour: null,
        motDue: null,
      };

    } catch (err: any) {
      console.error("🔥 PREVIEW ERROR:", err.message);

      return {
        reg,
        error: "Preview failed"
      };
    }
  }

  // =========================
  // 🔒 LOCKED FULL REPORT
  // =========================
  async getFullReport(reg: string, sessionId?: string, userId?: string) {
    try {

      let uid = userId || 'guest';
      let isPaid = false;

      // =========================
      // 1️⃣ CHECK STRIPE SESSION (AUTO USER LINK)
      // =========================
      if (sessionId) {
        const session = await this.paymentService.getSession(sessionId);

        if (session && !('error' in session)) {

          // 🔥 AUTO-SET USER FROM STRIPE EMAIL
          const email = session.customer_details?.email;
          if (email) {
            uid = email;
          }

          // 🔒 VALIDATE PAYMENT
          if (session.payment_status === 'paid') {
            isPaid = true;
          }
        }
      }

      // =========================
      // 2️⃣ CHECK EXISTING REPORT (PER USER)
      // =========================
      const existing = await this.reportRepo.findOne({
        where: { reg, userId: uid },
      });

      if (existing && existing.status === 'paid') {
        console.log("✅ Returning cached paid report");
        return existing.data;
      }

      // =========================
      // 3️⃣ BUNDLE LOGIC
      // =========================
     if (uid === 'guest') {
        const hasBundle = await this.consumeBundle(uid);

      if (!hasBundle) {
        throw new Error("Bundle required");
    }

      console.log("✅ Bundle used");
    }

      // =========================
      // 4️⃣ FETCH FULL DATA
      // =========================
      const report = await this.getFull(reg);

      // =========================
      // 5️⃣ SAVE REPORT
      // =========================
      let record = existing;

      if (!record) {
        record = this.reportRepo.create({
          reg,
          userId: uid,
          make: report?.vehicle?.make || '',
          model: report?.vehicle?.model || '',
          riskScore: report?.riskScore || 0,
          data: report,
          status: 'paid',
          pkg: isPaid ? 'single' : 'bundle',
        });
      } else {
        record.data = report;
        record.status = 'paid';
        record.pkg = isPaid ? 'single' : 'bundle';
        record.userId = uid; // 🔥 ensure ownership
      }

      await this.reportRepo.save(record);

      return report;

    } catch (err: any) {
      console.error("🔥 FULL REPORT ERROR:", err.message);
      return { error: err.message };
    }
  }

  // =========================
  // 🎟️ CONSUME BUNDLE
  // =========================
  async consumeBundle(userId: string) {
    const bundle = await this.bundleRepo.findOne({
      where: { userId, active: true },
      order: { createdAt: 'DESC' },
    });

    if (!bundle || bundle.remaining <= 0) {
      return false;
    }

    bundle.remaining -= 1;

    if (bundle.remaining === 0) {
      bundle.active = false;
    }

    await this.bundleRepo.save(bundle);

    return true;
  }

  // =========================
  // 🔴 FULL PREMIUM REPORT
  // =========================
  async getFull(reg: string) {
    try {
      const apiKey = process.env.RAPID_API_KEY;
      const domain = process.env.RAPID_API_DOMAIN
        ?.replace('https://', '')
        ?.replace('http://', '');

      const url = `https://www.rapidcarcheck.co.uk/api/?key=${apiKey}&domain=${domain}&plate=${reg}`;

      const response = await axios.get(url);
      const data = response.data;

      if (data.HasError || !data.Results) {
        return {
          vehicle: {
            reg,
            make: "Unavailable",
            model: "Unavailable"
          },
          riskScore: 0,
          fallback: true
        };
      }

      const vehicle =
        data.Results?.InitialVehicleCheckModel?.BasicVehicleDetailsModel;

      return {
        vehicle: {
          reg,
          make: vehicle?.Make,
          model: vehicle?.Model
        },
        riskScore: 0
      };

    } catch (error: any) {
      console.error("🔥 RAPID ERROR:", error.message);

      return {
        reg,
        error: "Premium data failed"
      };
    }
  }

  // =========================
  // 🖼 IMAGE
  // =========================
  getVehicleImage(make: string, model?: string) {
    if (!make) {
      return {
        image: "https://images.unsplash.com/photo-1503376780353-7e6692767b70"
      };
    }

    const query = `${make} ${model || ""} car`;

    return {
      image: `https://source.unsplash.com/800x400/?${encodeURIComponent(query)}`
    };
  }
}