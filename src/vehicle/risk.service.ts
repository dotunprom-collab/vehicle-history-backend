// src/vehicle/risk.service.ts

import { VehicleReport } from '../types/report';
import { Injectable } from '@nestjs/common';

@Injectable()
export class RiskService {


  calculate(report: VehicleReport): { score: number; insights: string[] } {
    let score = 0;
    const insights: string[] = [];

    // =========================
    // 1️⃣ HARD RISK FLAGS (PREMIUM READY)
    // =========================

    if (report.stolen === 'yes') {
      score += 80;
      insights.push("🚨 Vehicle reported stolen");
    }

    if (report.finance === 'outstanding') {
      score += 50;
      insights.push("💸 Outstanding finance detected");
    }

    if (report.writeOff === 'yes') {
      score += 60;
      insights.push("⚠️ Vehicle previously written off");
    }

    // =========================
    // 2️⃣ BASIC DATA SIGNALS (WORKS NOW)
    // =========================

    if (!report.vehicle.make || report.vehicle.make === "Unavailable") {
      score += 10;
      insights.push("⚠️ Vehicle data incomplete");
    }

    if (!report.vehicle.fuel || report.vehicle.fuel === "Unknown") {
      score += 5;
    }

    // =========================
    // 3️⃣ DVLA / SIMPLE HEURISTICS
    // =========================

    // Example placeholder (you can improve later)
    if (report.vehicle.colour === "Unknown") {
      score += 3;
    }

    // =========================
    // 4️⃣ NORMALISE SCORE
    // =========================

    if (score > 100) score = 100;

    // =========================
    // 5️⃣ DEFAULT INSIGHT
    // =========================

    if (insights.length === 0) {
      insights.push("✅ No major risks detected");
    }

    return { score, insights };
  }
}