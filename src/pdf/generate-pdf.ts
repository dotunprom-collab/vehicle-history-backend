// ─────────────────────────────────────────────────────────────────
//  CheapRegCheck — Vehicle Report PDF Generator (PDFKit / TypeScript)
//  v3 — tier-aware, B1-compatible, Premium dossier mode
//
//  USAGE in your controller:
//    const doc = new PDFDocument({ bufferPages: true, margin: 0, size: 'A4' });
//    generatePDF(doc, data, { tier: data.tier, logoBase64 });
//
//  logoBase64 = raw base64, NO "data:image/png;base64," prefix.
//
//  STRICT CONTRACT:
//    - tier === 'standard' → cover page off, premium chrome off, premium sections never rendered
//    - tier === 'premium'  → cover page on, watermark on, executive summary on, all sections rendered
//    - tier === 'free' or anything else → throws (controller must reject before calling)
// ─────────────────────────────────────────────────────────────────

// ── Brand colours ────────────────────────────────────────────────
const C = {
  // shared
  green:       '#16a34a',
  greenLight:  '#f0fdf4',
  greenBorder: '#bbf7d0',
  amber:       '#d97706',
  amberLight:  '#fffbeb',
  amberBorder: '#fde68a',
  red:         '#dc2626',
  redLight:    '#fef2f2',
  redBorder:   '#fecaca',
  plate:       '#F8D347',
  navy:        '#1a237e',
  black:       '#1c1c1e',
  dark:        '#3c3c43',
  mid:         '#6c6c70',
  light:       '#aeaeb2',
  rule:        '#e5e5ea',
  bg:          '#f5f5f7',
  white:       '#ffffff',

  // Premium dossier accents
  graphite:    '#1f2937',     // deep slate — premium headers
  graphiteSub: '#374151',
  gold:        '#b45309',     // restrained gold (matches amber palette)
  goldLight:   '#fef3c7',
  goldRule:    '#92400e',
};

// ── Layout ────────────────────────────────────────────────────────
const PAGE_W   = 595.28;
const PAGE_H   = 841.89;
const MARGIN   = 44;
const CW       = PAGE_W - MARGIN * 2;   // 507.28 pt
const ROW_H    = 22;
const GAP      = 16;
const FOOTER_Y = PAGE_H - 38;

// ── Public types ─────────────────────────────────────────────────
type Tier = 'standard' | 'premium';

interface GenerateOpts {
  tier: Tier;
  logoBase64?: string;
}

// ── Helpers ──────────────────────────────────────────────────────
function fmtDate(d: any): string {
  if (!d) return 'N/A';
  try {
    return new Date(d).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch { return String(d); }
}

function fmtMiles(n: any): string {
  const v = parseInt(String(n ?? ''));
  return isNaN(v) ? 'N/A' : v.toLocaleString() + ' mi';
}

function statusColor(s: string): string {
  const l = (s || '').toLowerCase();
  if (l.includes('valid') || (l.includes('taxed') && !l.includes('untaxed'))) return C.green;
  if (l.includes('fail') || l.includes('expired') || l.includes('untaxed') ||
      l.includes('sorn') || l.includes('no detail') || l.includes('void'))   return C.red;
  return C.dark;
}

function checkColor(v: any): string {
  if (v === undefined || v === null) return C.mid;
  const l = String(v).toLowerCase();
  return (l === 'clear' || l === 'no' || l === 'false' || l === 'none') ? C.green : C.red;
}

function checkLabel(v: any): string {
  if (v === undefined || v === null) return 'N/A';
  const l = String(v).toLowerCase();
  return (l === 'clear' || l === 'no' || l === 'false' || l === 'none') ? 'Clear' : 'Issue found';
}

// ── Drawing primitives ───────────────────────────────────────────
function filledRect(doc: any, x: number, y: number, w: number, h: number,
                    fill: string, r = 0, stroke?: string): void {
  if (r > 0) doc.roundedRect(x, y, w, h, r);
  else        doc.rect(x, y, w, h);
  stroke ? doc.fillAndStroke(fill, stroke) : doc.fill(fill);
}

function sectionBar(doc: any, title: string, y: number, accent = C.green): number {
  filledRect(doc, MARGIN, y, CW, 24, C.bg, 3);
  filledRect(doc, MARGIN, y, 4,  24, accent, 2);
  doc.fillColor(C.black).fontSize(10).font('Helvetica-Bold')
     .text(title, MARGIN + 13, y + 7, { width: CW - 18, lineBreak: false });
  return y + 24;
}

function kvRow(doc: any, label: string, value: string, y: number,
               opts: { vColor?: string; stripe?: boolean } = {}): number {
  if (opts.stripe) filledRect(doc, MARGIN, y, CW, ROW_H, '#fafafa');
  doc.fillColor(C.mid).fontSize(9).font('Helvetica')
     .text(label, MARGIN + 8, y + 5, { width: CW * 0.40, lineBreak: false });
  doc.fillColor(opts.vColor ?? C.black).fontSize(9).font('Helvetica')
     .text(value || 'N/A', MARGIN + CW * 0.42, y + 5, { width: CW * 0.56, lineBreak: false });
  doc.strokeColor(C.rule).lineWidth(0.4)
     .moveTo(MARGIN, y + ROW_H).lineTo(MARGIN + CW, y + ROW_H).stroke();
  return y + ROW_H;
}

// ── Page chrome (footer + premium watermark) ─────────────────────
function drawFooter(doc: any, tier: Tier, pageNum: number, totalHint: string): void {
  doc.strokeColor(C.rule).lineWidth(0.5)
     .moveTo(MARGIN, FOOTER_Y).lineTo(MARGIN + CW, FOOTER_Y).stroke();

  doc.fillColor(C.light).fontSize(7).font('Helvetica')
     .text(
        'CheapRegCheck is not affiliated with DVLA or DVSA. ' +
        'Data sourced from official UK government databases. For personal use only.',
        MARGIN, FOOTER_Y + 5, { width: CW - 180, lineBreak: false },
     );

  // Tier badge in footer
  const badge = tier === 'premium' ? 'PREMIUM REPORT' : 'STANDARD REPORT';
  const badgeColor = tier === 'premium' ? C.gold : C.green;
  doc.fillColor(badgeColor).fontSize(7).font('Helvetica-Bold')
     .text(
        `${badge}  -  Page ${pageNum}${totalHint}  -  (c) ${new Date().getFullYear()} CheapRegCheck UK`,
        MARGIN + CW - 250, FOOTER_Y + 5,
        { width: 250, align: 'right', lineBreak: false },
     );
}

// Premium-only diagonal watermark, low opacity, not on cover page
function drawPremiumWatermark(doc: any): void {
  doc.save();
  doc.fillOpacity(0.045);
  doc.fillColor(C.gold);
  doc.font('Helvetica-Bold').fontSize(80);
  // Rotate around page centre
  doc.rotate(-32, { origin: [PAGE_W / 2, PAGE_H / 2] });
  doc.text('PREMIUM REPORT', 0, PAGE_H / 2 - 30, {
    width: PAGE_W,
    align: 'center',
    lineBreak: false,
  });
  doc.fillOpacity(1);
  doc.restore();
}

// Y-cursor wrapper so ensureSpace can mutate y across helpers
type YRef = { y: number };

function ensureSpace(doc: any, needed: number, Y: YRef, tier: Tier,
                     pageState: { num: number }): void {
  if (Y.y + needed > FOOTER_Y - 10) {
    doc.addPage();
    pageState.num += 1;
    if (tier === 'premium') drawPremiumWatermark(doc);
    drawFooter(doc, tier, pageState.num, '');
    Y.y = MARGIN;
  }
}

// ═════════════════════════════════════════════════════════════════
//  MAIN EXPORT
// ═════════════════════════════════════════════════════════════════
export function generatePDF(doc: any, data: any, opts: GenerateOpts): void {
  const tier = opts.tier;
  const logoBase64 = opts.logoBase64 || '';

  if (tier !== 'standard' && tier !== 'premium') {
    throw new Error(`generatePDF: invalid tier "${tier}" — only standard or premium allowed`);
  }

  const isPremium = tier === 'premium';

  // ── Data extraction (B1-compatible, B1-shape-first, legacy fallback) ─────
  // After B1, response shape for standard is:
  //   { tier, vehicle, motHistory, keeperHistory, writeOff }
  // For premium it also has: rcc, finance, stolen, pnc, miaftr, financeDetails, riskScore, insights
  const vehicle  = data.vehicle || {};
  const rcc      = data.rcc || {};                              // premium-only after B1
  const m        = rcc?.Results?.InitialVehicleCheckModel || {};
  const b        = m.BasicVehicleDetailsModel || {};
  const ms       = b.MotResultsSummary || m.MotResultsSummary || {};

  // Top-level B1 fields take priority
  const motHistory: any[]    = data.motHistory || ms.MotResults || m.MotResults || [];
  const keeperHistory: any[] = data.keeperHistory || b.KeeperHistory || m.KeeperHistory || [];

  const reg       = vehicle.reg || rcc?.Results?.Vrm || data.registrationNumber || 'N/A';
  const make      = vehicle.make || b.Make || ms.MotVehicleManufacturer || 'N/A';
  const model_    = vehicle.model || b.Model || ms.MotVehicleModel || '';
  const year      = vehicle.year || b.YearOfManufacture || 'N/A';
  const colour    = vehicle.colour || b.Colour || 'N/A';
  const fuel      = vehicle.fuel  || b.FuelType || ms.MotVehicleFuelType || 'N/A';
  const engCC     = vehicle.engineCapacity || b.CylinderCapacity;

  // CO2: prefer vehicle.co2 (B1 puts it there for both tiers), fall back to rcc
  const co2Raw    = vehicle.co2 ?? b.Co2Emissions;
  const co2       = co2Raw ? `${co2Raw} g/km` : 'N/A';

  // Premium-only specs from rcc (Standard won't have rcc — fields will be N/A, that's correct)
  const euro      = b.EuroStatus || 'N/A';
  const bodyStyle = b.BodyStyle || 'N/A';
  const wheelplan = b.WheelPlan || 'N/A';
  const typeApprv = b.TypeApproval || 'N/A';
  const avgMiles  = b.AverageMileage
    ? parseInt(b.AverageMileage).toLocaleString() + ' mi/yr' : 'N/A';
  const weight    = b.RevenueWeight ? `${b.RevenueWeight} kg` : 'N/A';

  const motStatus  = vehicle.motStatus || b.MotStatusDescription  || 'Unknown';
  const taxStatus  = vehicle.taxStatus || b.RoadTaxStatusDescription || 'Unknown';
  const motDue     = fmtDate(vehicle.artEndDate || b.DateMotDue);
  const taxDue     = fmtDate(vehicle.taxDueDate || b.DateRoadTaxDue);
  const v5c        = fmtDate(b.DateOfLastV5CIssued || vehicle.dateOfLastV5CIssued);
  const firstReg   = fmtDate(b.DateOfFirstRegistration || vehicle.monthOfFirstRegistration);
  const taxBand    = m.RoadTaxData?.Band;
  const taxRate    = m.RoadTaxData?.TwelveMonthRate;

  const isScrapped = !!(b.IsScrapped    || vehicle.isScrapped);
  const isSORN     = !!(b.IsVehicleSORN || vehicle.isSORN);
  const isExport   = !!(b.Exported      || vehicle.exportStatus || vehicle.markedForExport);
  const isImport   = !!(b.IsImported    || vehicle.isImported);

  // Premium-only dataset (will be undefined for Standard after B1, by design)
  const riskScore  = isPremium ? (data.riskScore ?? null) : null;
  const finance    = isPremium ? data.finance  : undefined;
  const stolen     = isPremium ? data.stolen   : undefined;
  const writeOff   = data.writeOff;          // available on both Standard + Premium
  const insights: string[] = isPremium ? (data.insights || []) : [];

  // Page state for footer pagination
  const pageState = { num: 1 };
  const Y: YRef = { y: MARGIN };

  // ═══════════════════════════════════════════════════════════════
  //  PREMIUM COVER PAGE (Premium only)
  // ═══════════════════════════════════════════════════════════════
  if (isPremium) {
    drawPremiumCover(doc, {
      reg, make, model_, year, colour, riskScore,
      finance, stolen, writeOff, logoBase64,
    });

    // After cover, start fresh content page
    doc.addPage();
    pageState.num += 1;
    drawPremiumWatermark(doc);
    drawFooter(doc, tier, pageState.num, '');
    Y.y = MARGIN;
  } else {
    // Standard: footer on first page, no watermark, no cover
    drawFooter(doc, tier, pageState.num, '');
  }

  // ═══════════════════════════════════════════════════════════════
  //  HEADER (both tiers — sits on top of content page)
  // ═══════════════════════════════════════════════════════════════
  drawHeader(doc, Y, { reg, logoBase64, isPremium });

  // ═══════════════════════════════════════════════════════════════
  //  EXECUTIVE SUMMARY (Premium only)
  // ═══════════════════════════════════════════════════════════════
  if (isPremium) {
    ensureSpace(doc, 130, Y, tier, pageState);
    Y.y = drawExecutiveSummary(doc, Y.y, {
      reg, make, model_, year, riskScore,
      finance, stolen, writeOff, keeperCount: keeperHistory.length,
      motCount: motHistory.length, motStatus, taxStatus,
    });
    Y.y += GAP;
  }

  // ═══════════════════════════════════════════════════════════════
  //  HIGHLIGHTS STRIP (both tiers)
  // ═══════════════════════════════════════════════════════════════
  ensureSpace(doc, 56 + GAP, Y, tier, pageState);
  Y.y = drawHighlightsStrip(doc, Y.y, {
    motStatus, taxStatus, keeperCount: keeperHistory.length,
  });
  Y.y += GAP;

  // ═══════════════════════════════════════════════════════════════
  //  VEHICLE DETAILS (both tiers — same fields, fewer populated on Standard)
  // ═══════════════════════════════════════════════════════════════
  ensureSpace(doc, 30, Y, tier, pageState);
  Y.y = sectionBar(doc, 'Vehicle Details', Y.y, isPremium ? C.gold : C.green) + 2;

  const vRows: [string, string, string?][] = [
    ['Registration',   String(reg).toUpperCase()],
    ['Make & Model',   `${make}${model_ ? '  ' + model_ : ''}`],
    ['Year',           String(year)],
    ['Colour',         colour],
    ['Fuel Type',      fuel],
    ['Engine',         engCC ? `${engCC} cc` : 'N/A'],
    ['CO2 Emissions',  co2],
  ];

  // Premium-only extra spec rows (from rcc)
  if (isPremium) {
    vRows.push(
      ['Euro Status',    euro],
      ['Body Style',     bodyStyle],
      ['Wheel Plan',     wheelplan],
      ['Type Approval',  typeApprv],
      ['Revenue Weight', weight],
      ['Avg. Mileage',   avgMiles],
    );
  }

  vRows.forEach(([l, v, vc], i) => {
    ensureSpace(doc, ROW_H, Y, tier, pageState);
    Y.y = kvRow(doc, l, v, Y.y, { stripe: i % 2 === 1, vColor: vc });
  });
  Y.y += GAP;

  // ═══════════════════════════════════════════════════════════════
  //  TAX & REGISTRATION (both tiers)
  // ═══════════════════════════════════════════════════════════════
  ensureSpace(doc, 30, Y, tier, pageState);
  Y.y = sectionBar(doc, 'Tax & Registration Status', Y.y, isPremium ? C.gold : C.green) + 2;

  const taxRows: [string, string, string?][] = [
    ['MOT Status',        motStatus, statusColor(motStatus)],
    ['MOT Due',           motDue],
    ['Road Tax Status',   taxStatus, statusColor(taxStatus)],
    ['Tax Due',           taxDue],
  ];

  // Premium gets the full tax/reg detail
  if (isPremium) {
    if (taxBand) {
      taxRows.push(['Tax Band',
        `Band ${taxBand}${taxRate ? '  -  GBP' + taxRate + '/yr' : ''}`]);
    }
    taxRows.push(
      ['First Registered',  firstReg],
      ['Last V5C Issued',   v5c],
      ['Marked for Export', isExport   ? 'Yes' : 'No', isExport   ? C.amber : undefined],
      ['Scrapped',          isScrapped ? 'Yes' : 'No', isScrapped ? C.red   : undefined],
      ['SORN',              isSORN     ? 'Yes' : 'No', isSORN     ? C.amber : undefined],
      ['Imported',          isImport   ? 'Yes' : 'No'],
    );
  } else {
    // Standard gets the basics only — first reg + V5C if available, plus
    // export/scrapped flags because they're real ownership info, not premium analytics
    taxRows.push(
      ['Marked for Export', isExport   ? 'Yes' : 'No', isExport   ? C.amber : undefined],
      ['Scrapped',          isScrapped ? 'Yes' : 'No', isScrapped ? C.red   : undefined],
    );
  }

  taxRows.forEach(([l, v, vc], i) => {
    ensureSpace(doc, ROW_H, Y, tier, pageState);
    Y.y = kvRow(doc, l, v, Y.y, { stripe: i % 2 === 1, vColor: vc });
  });
  Y.y += GAP;

  // ═══════════════════════════════════════════════════════════════
  //  WRITE-OFF SECTION (both tiers — Standard sees only this risk check)
  // ═══════════════════════════════════════════════════════════════
  if (writeOff !== undefined) {
    ensureSpace(doc, 80, Y, tier, pageState);
    Y.y = sectionBar(doc, 'Insurance Write-off Check (MIAFTR)', Y.y,
                     isPremium ? C.gold : C.green) + 10;

    const woCol  = checkColor(writeOff);
    const woBg   = woCol === C.green ? C.greenLight : woCol === C.red ? C.redLight : C.bg;
    const woBdr  = woCol === C.green ? C.greenBorder : woCol === C.red ? C.redBorder : C.rule;

    filledRect(doc, MARGIN, Y.y, CW, 50, woBg, 6, woBdr);
    doc.circle(MARGIN + 16, Y.y + 25, 5).fill(woCol);

    doc.fillColor(C.mid).fontSize(7).font('Helvetica')
       .text('INSURANCE WRITE-OFF (Cat A/B/S/N)', MARGIN + 28, Y.y + 12,
             { width: CW - 36, lineBreak: false });
    doc.fillColor(woCol).fontSize(13).font('Helvetica-Bold')
       .text(checkLabel(writeOff), MARGIN + 28, Y.y + 24,
             { width: CW - 36, lineBreak: false });

    Y.y += 50 + GAP;
  }

  // ═══════════════════════════════════════════════════════════════
  //  PREMIUM-ONLY SECTIONS
  //    finance, stolen, full background grid, risk score, AI insights
  //    Standard never reaches any of these.
  // ═══════════════════════════════════════════════════════════════
  if (isPremium) {

    // ─── Finance + Stolen + Write-off 3-card grid ─────
    if (finance !== undefined || stolen !== undefined) {
      ensureSpace(doc, 80, Y, tier, pageState);
      Y.y = sectionBar(doc, 'Background Checks (Experian / PNC)', Y.y, C.gold) + 10;

      const bw = (CW - 12) / 3;
      const bh = 50;

      [
        { label: 'Finance Check (Experian HPI)', val: finance },
        { label: 'Stolen Check (Police PNC)',     val: stolen },
        { label: 'Insurance Write-off',           val: writeOff },
      ].forEach((ch, i) => {
        const cx  = MARGIN + i * (bw + 6);
        const col = checkColor(ch.val);
        const bg  = col === C.green ? C.greenLight : col === C.red ? C.redLight : C.bg;
        const bdr = col === C.green ? C.greenBorder : col === C.red ? C.redBorder : C.rule;

        filledRect(doc, cx, Y.y, bw, bh, bg, 6, bdr);
        doc.circle(cx + 13, Y.y + 14, 5).fill(col);

        doc.fillColor(C.mid).fontSize(7).font('Helvetica')
           .text(ch.label, cx + 23, Y.y + 8, { width: bw - 28, lineBreak: false });
        doc.fillColor(col).fontSize(11).font('Helvetica-Bold')
           .text(checkLabel(ch.val), cx + 23, Y.y + 22,
                 { width: bw - 28, lineBreak: false });
      });
      Y.y += bh + GAP;
    }

    // ─── Risk score ─────
    if (riskScore !== null && riskScore !== undefined) {
      ensureSpace(doc, 76, Y, tier, pageState);

      const score  = parseInt(String(riskScore)) || 0;
      const rCol   = score <= 30 ? C.green : score <= 60 ? C.amber : C.red;
      const rBg    = score <= 30 ? C.greenLight : score <= 60 ? C.amberLight : C.redLight;
      const rBdr   = score <= 30 ? C.greenBorder : score <= 60 ? C.amberBorder : C.redBorder;
      const rLabel = score <= 30 ? 'Low Risk' : score <= 60 ? 'Medium Risk' : 'High Risk';

      Y.y = sectionBar(doc, 'AI Risk Assessment', Y.y, C.gold) + 8;

      filledRect(doc, MARGIN, Y.y, CW, 54, rBg, 8, rBdr);
      doc.circle(MARGIN + 36, Y.y + 27, 21).fill(rCol);
      doc.fillColor(C.white).fontSize(13).font('Helvetica-Bold')
         .text(String(score), MARGIN + 15, Y.y + 19,
               { width: 42, align: 'center', lineBreak: false });

      doc.fillColor(rCol).fontSize(14).font('Helvetica-Bold')
         .text(rLabel, MARGIN + 68, Y.y + 9, { width: CW - 84, lineBreak: false });
      doc.fillColor(C.dark).fontSize(8.5).font('Helvetica')
         .text(`Score: ${score} / 100  -  Computed from MOT patterns, mileage consistency, ownership history`,
               MARGIN + 68, Y.y + 28, { width: CW - 84, lineBreak: false });

      Y.y += 54 + GAP;
    }

    // ─── AI Insights ─────
    if (insights.length) {
      ensureSpace(doc, 30 + insights.length * 20, Y, tier, pageState);
      Y.y = sectionBar(doc, 'Detected Risk Indicators', Y.y, C.gold) + 6;

      insights.forEach((insight: string, i: number) => {
        ensureSpace(doc, 22, Y, tier, pageState);
        filledRect(doc, MARGIN, Y.y, CW, 20, i % 2 === 0 ? '#fafafa' : C.white);

        doc.fillColor(C.gold).fontSize(9).font('Helvetica-Bold')
           .text('-', MARGIN + 8, Y.y + 5, { lineBreak: false });
        doc.fillColor(C.dark).fontSize(9).font('Helvetica')
           .text(String(insight), MARGIN + 18, Y.y + 5,
                 { width: CW - 26, lineBreak: false });

        Y.y += 20;
      });
      Y.y += GAP;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  MOT HISTORY (both tiers — main historical value, on a fresh page)
  // ═══════════════════════════════════════════════════════════════
  if (motHistory.length) {
    doc.addPage();
    pageState.num += 1;
    if (isPremium) drawPremiumWatermark(doc);
    drawFooter(doc, tier, pageState.num, '');
    Y.y = MARGIN;

    Y.y = sectionBar(doc, 'MOT History  -  DVSA Official Records', Y.y,
                     isPremium ? C.gold : C.green) + 10;

    drawMotTable(doc, Y, motHistory, tier, pageState, isPremium);
    Y.y += GAP;
  }

  // ═══════════════════════════════════════════════════════════════
  //  KEEPER HISTORY (both tiers)
  // ═══════════════════════════════════════════════════════════════
  if (keeperHistory.length) {
    ensureSpace(doc, 60 + keeperHistory.length * ROW_H + 50, Y, tier, pageState);
    Y.y = sectionBar(doc, 'Keeper History  -  DVLA Ownership Records', Y.y,
                     isPremium ? C.gold : C.green) + 10;

    const kc    = keeperHistory.length;
    const kCol2 = kc <= 2 ? C.green : kc <= 4 ? C.amber : C.red;
    const kBg   = kc <= 2 ? C.greenLight : kc <= 4 ? C.amberLight : C.redLight;

    filledRect(doc, MARGIN, Y.y, CW, 26, kBg, 5);
    doc.fillColor(kCol2).fontSize(9.5).font('Helvetica-Bold')
       .text(
          `${kc} previous keeper${kc !== 1 ? 's' : ''} recorded  -  DVLA`,
          MARGIN + 12, Y.y + 8, { width: CW - 20, lineBreak: false },
       );
    Y.y += 26 + 8;

    filledRect(doc, MARGIN, Y.y, CW, 17, '#e5e5ea');
    doc.fillColor(C.dark).fontSize(7.5).font('Helvetica-Bold');
    doc.text('KEEPER',        MARGIN + 3,  Y.y + 4, { lineBreak: false });
    doc.text('TRANSFER DATE', MARGIN + 80, Y.y + 4, { lineBreak: false });
    Y.y += 17;

    keeperHistory.forEach((k: any, i: number) => {
      ensureSpace(doc, ROW_H + 2, Y, tier, pageState);
      const num   = k.NumberPreviousKeepers ?? (keeperHistory.length - i);
      const date  = fmtDate(k.DateOfLastKeeperChange || k.date);

      filledRect(doc, MARGIN, Y.y, CW, ROW_H, i % 2 === 0 ? C.white : '#fafafa');

      doc.circle(MARGIN + 16, Y.y + ROW_H / 2, 9).fill(isPremium ? C.gold : C.green);
      doc.fillColor(C.white).fontSize(8).font('Helvetica-Bold')
         .text(String(num), MARGIN + 7, Y.y + 6,
               { width: 18, align: 'center', lineBreak: false });

      doc.fillColor(C.dark).fontSize(9).font('Helvetica')
         .text(`Keeper ${num}`, MARGIN + 32, Y.y + 6, { width: 45, lineBreak: false });
      doc.text(date, MARGIN + 80, Y.y + 6, { width: 200, lineBreak: false });

      doc.strokeColor(C.rule).lineWidth(0.3)
         .moveTo(MARGIN, Y.y + ROW_H).lineTo(MARGIN + CW, Y.y + ROW_H).stroke();
      Y.y += ROW_H;
    });
    Y.y += GAP;
  }

  // ── Close ──
  doc.end();
}

// ═════════════════════════════════════════════════════════════════
//  PREMIUM COVER PAGE
// ═════════════════════════════════════════════════════════════════
function drawPremiumCover(doc: any, p: {
  reg: string; make: string; model_: string; year: any; colour: string;
  riskScore: any; finance: any; stolen: any; writeOff: any;
  logoBase64: string;
}): void {
  // Dark graphite header band
  filledRect(doc, 0, 0, PAGE_W, 180, C.graphite);
  // Gold accent rule
  filledRect(doc, 0, 180, PAGE_W, 3, C.gold);

  // Logo (top-left, white-bg safe area)
  try {
    if (p.logoBase64 && p.logoBase64.length > 100) {
      const buf = Buffer.from(p.logoBase64, 'base64');
      doc.image(buf, MARGIN, 32, { height: 38, fit: [120, 38] });
    }
  } catch (_) { /* logo optional */ }

  // Eyebrow
  doc.fillColor(C.gold).fontSize(9).font('Helvetica-Bold')
     .text('PREMIUM VEHICLE INTELLIGENCE REPORT', MARGIN, 88,
           { width: CW, characterSpacing: 1.5, lineBreak: false });

  // Big title
  doc.fillColor(C.white).fontSize(26).font('Helvetica-Bold')
     .text('Full Vehicle Dossier', MARGIN, 104,
           { width: CW, lineBreak: false });

  // Generated stamp
  const now = new Date().toLocaleDateString('en-GB',
    { day: 'numeric', month: 'long', year: 'numeric' });
  doc.fillColor('#9ca3af').fontSize(9).font('Helvetica')
     .text(`Generated ${now}  -  Verified against DVLA, DVSA & finance datasets`,
           MARGIN, 142, { width: CW, lineBreak: false });

  // ── Vehicle hero block ──
  const heroY = 220;

  // Big plate
  filledRect(doc, MARGIN, heroY, 28, 50, C.navy, 5);
  doc.fillColor(C.white).fontSize(8.5).font('Helvetica-Bold')
     .text('UK', MARGIN, heroY + 8, { width: 28, align: 'center', lineBreak: false });
  doc.fillColor(C.white).fontSize(7).font('Helvetica')
     .text('GB', MARGIN, heroY + 22, { width: 28, align: 'center', lineBreak: false });

  filledRect(doc, MARGIN + 28, heroY, 220, 50, C.plate, 5);
  doc.fillColor(C.black).fontSize(28).font('Helvetica-Bold')
     .text(String(p.reg).toUpperCase(), MARGIN + 32, heroY + 11,
           { width: 212, align: 'center', characterSpacing: 3, lineBreak: false });

  // Vehicle name beside plate
  doc.fillColor(C.graphite).fontSize(20).font('Helvetica-Bold')
     .text(`${p.make} ${p.model_}`.trim(), MARGIN + 260, heroY + 4,
           { width: CW - 260, lineBreak: false });
  doc.fillColor(C.mid).fontSize(11).font('Helvetica')
     .text(`${p.year}  -  ${p.colour}`,
           MARGIN + 260, heroY + 30, { width: CW - 260, lineBreak: false });

  // ── Risk score badge (centre) ──
  if (p.riskScore !== null && p.riskScore !== undefined) {
    const score  = parseInt(String(p.riskScore)) || 0;
    const rCol   = score <= 30 ? C.green : score <= 60 ? C.amber : C.red;
    const rLabel = score <= 30 ? 'LOW RISK' : score <= 60 ? 'MEDIUM RISK' : 'HIGH RISK';

    const badgeY = 310;
    const badgeW = 220;
    const badgeX = (PAGE_W - badgeW) / 2;

    filledRect(doc, badgeX, badgeY, badgeW, 110, C.bg, 10, C.rule);

    // Score circle
    doc.circle(PAGE_W / 2, badgeY + 42, 30).fill(rCol);
    doc.fillColor(C.white).fontSize(22).font('Helvetica-Bold')
       .text(String(score), badgeX, badgeY + 31,
             { width: badgeW, align: 'center', lineBreak: false });

    // Label
    doc.fillColor(rCol).fontSize(13).font('Helvetica-Bold')
       .text(rLabel, badgeX, badgeY + 80,
             { width: badgeW, align: 'center', characterSpacing: 1, lineBreak: false });
    doc.fillColor(C.mid).fontSize(8).font('Helvetica')
       .text(`AI Risk Score  -  ${score} / 100`, badgeX, badgeY + 96,
             { width: badgeW, align: 'center', lineBreak: false });
  }

  // ── Conditional warning banner ──
  const flags: string[] = [];
  const fl = String(p.finance || '').toLowerCase();
  const sl = String(p.stolen  || '').toLowerCase();
  const wl = String(p.writeOff|| '').toLowerCase();

  if (fl && fl !== 'clear' && fl !== 'no' && fl !== 'unknown')   flags.push('Outstanding finance recorded');
  if (sl && sl !== 'clear' && sl !== 'no' && sl !== 'unknown')   flags.push('Stolen marker found (PNC)');
  if (wl && wl !== 'clear' && wl !== 'no' && wl !== 'unknown')   flags.push('Insurance write-off recorded');

  if (flags.length > 0) {
    const wbY = 450;
    filledRect(doc, MARGIN, wbY, CW, 60, C.redLight, 6, C.redBorder);
    doc.fillColor(C.red).fontSize(11).font('Helvetica-Bold')
       .text(`WARNING  -  ${flags.length} risk indicator${flags.length > 1 ? 's' : ''} detected`,
             MARGIN + 16, wbY + 12, { width: CW - 30, lineBreak: false });
    doc.fillColor('#991b1b').fontSize(9).font('Helvetica')
       .text(flags.join('  |  '), MARGIN + 16, wbY + 32,
             { width: CW - 30, lineBreak: false });
  }

  // ── Bottom verification stamp ──
  const stampY = 600;
  filledRect(doc, MARGIN, stampY, CW, 80, C.graphite, 8);
  filledRect(doc, MARGIN, stampY, 5, 80, C.gold);

  doc.fillColor(C.gold).fontSize(8).font('Helvetica-Bold')
     .text('VERIFIED DATA SOURCES', MARGIN + 16, stampY + 14,
           { width: CW - 30, characterSpacing: 1.2, lineBreak: false });
  doc.fillColor(C.white).fontSize(10).font('Helvetica')
     .text('Driver & Vehicle Licensing Agency  -  Driver & Vehicle Standards Agency',
           MARGIN + 16, stampY + 30, { width: CW - 30, lineBreak: false });
  doc.fillColor(C.white).fontSize(10).font('Helvetica')
     .text('Experian HPI Finance  -  Police National Computer (PNC)  -  MIAFTR Insurance Industry',
           MARGIN + 16, stampY + 46, { width: CW - 30, lineBreak: false });

  // Footer
  doc.fillColor(C.light).fontSize(7).font('Helvetica')
     .text('CheapRegCheck Premium  -  This report is for personal use only and not affiliated with DVLA or DVSA.',
           MARGIN, FOOTER_Y + 10, { width: CW, align: 'center', lineBreak: false });
}

// ═════════════════════════════════════════════════════════════════
//  EXECUTIVE SUMMARY (Premium content page 2)
// ═════════════════════════════════════════════════════════════════
function drawExecutiveSummary(doc: any, y: number, p: {
  reg: string; make: string; model_: string; year: any;
  riskScore: any; finance: any; stolen: any; writeOff: any;
  keeperCount: number; motCount: number;
  motStatus: string; taxStatus: string;
}): number {
  const startY = y;

  filledRect(doc, MARGIN, y, CW, 110, C.graphite, 8);
  filledRect(doc, MARGIN, y, 5, 110, C.gold);

  doc.fillColor(C.gold).fontSize(9).font('Helvetica-Bold')
     .text('EXECUTIVE SUMMARY', MARGIN + 16, y + 14,
           { width: CW - 30, characterSpacing: 1.2, lineBreak: false });

  doc.fillColor(C.white).fontSize(13).font('Helvetica-Bold')
     .text(`${p.year} ${p.make} ${p.model_}  -  ${String(p.reg).toUpperCase()}`,
           MARGIN + 16, y + 32, { width: CW - 30, lineBreak: false });

  // Build a one-line plain-English verdict
  const score = parseInt(String(p.riskScore)) || 0;
  const verdict = score <= 30 ? 'No major risk indicators detected.'
                : score <= 60 ? 'Moderate risk indicators detected — review report.'
                : 'Multiple high-risk indicators detected — caution advised.';

  doc.fillColor('#d1d5db').fontSize(9).font('Helvetica')
     .text(verdict, MARGIN + 16, y + 56, { width: CW - 30, lineBreak: false });

  // Stat strip across bottom of card
  const stats = [
    { label: 'RISK SCORE', value: `${score}/100` },
    { label: 'KEEPERS',    value: String(p.keeperCount) },
    { label: 'MOT TESTS',  value: String(p.motCount) },
    { label: 'MOT',        value: p.motStatus },
    { label: 'TAX',        value: p.taxStatus },
  ];

  const statsY = y + 80;
  const statsW = (CW - 32) / stats.length;
  stats.forEach((s, i) => {
    const sx = MARGIN + 16 + i * statsW;
    doc.fillColor(C.gold).fontSize(7).font('Helvetica-Bold')
       .text(s.label, sx, statsY, { width: statsW - 4, characterSpacing: .8, lineBreak: false });
    doc.fillColor(C.white).fontSize(10).font('Helvetica-Bold')
       .text(s.value, sx, statsY + 11, { width: statsW - 4, lineBreak: false });
  });

  return startY + 110;
}

// ═════════════════════════════════════════════════════════════════
//  HEADER (per content page, both tiers)
// ═════════════════════════════════════════════════════════════════
function drawHeader(doc: any, Y: YRef, p: {
  reg: string; logoBase64: string; isPremium: boolean;
}): void {
  // Logo top-right
  try {
    if (p.logoBase64 && p.logoBase64.length > 100) {
      const buf = Buffer.from(p.logoBase64, 'base64');
      doc.image(buf, PAGE_W - MARGIN - 110, Y.y, { height: 38, fit: [110, 38] });
    }
  } catch (_) { /* logo optional */ }

  const accent = p.isPremium ? C.gold : C.green;
  const tagText = p.isPremium ? 'PREMIUM REPORT' : 'STANDARD REPORT';

  doc.fillColor(accent).fontSize(8).font('Helvetica-Bold')
     .text(tagText, MARGIN, Y.y, { characterSpacing: 1.2, lineBreak: false });

  const title = p.isPremium ? 'Vehicle History Dossier' : 'Vehicle History Report';
  doc.fillColor(C.black).fontSize(17).font('Helvetica-Bold')
     .text(title, MARGIN, Y.y + 12, { width: CW - 120, lineBreak: false });

  const now = new Date().toLocaleDateString('en-GB',
    { day: 'numeric', month: 'long', year: 'numeric' });
  doc.fillColor(C.mid).fontSize(8.5).font('Helvetica')
     .text(`Plate: ${String(p.reg).toUpperCase()}  -  Generated: ${now}`,
           MARGIN, Y.y + 32, { width: CW - 120, lineBreak: false });

  Y.y += 56;

  // Divider
  doc.strokeColor(p.isPremium ? C.gold : C.rule).lineWidth(p.isPremium ? 1 : 0.75)
     .moveTo(MARGIN, Y.y).lineTo(MARGIN + CW, Y.y).stroke();
  Y.y += GAP;
}

// ═════════════════════════════════════════════════════════════════
//  HIGHLIGHTS STRIP (3 cards: MOT, Tax, Keepers)
// ═════════════════════════════════════════════════════════════════
function drawHighlightsStrip(doc: any, y: number, p: {
  motStatus: string; taxStatus: string; keeperCount: number;
}): number {
  const hCardW = (CW - 12) / 3;
  const hCardH = 56;

  const kCol  = p.keeperCount > 4 ? C.red : p.keeperCount > 2 ? C.amber : C.green;
  const kVal  = p.keeperCount > 0 ? `${p.keeperCount} keeper${p.keeperCount !== 1 ? 's' : ''}` : 'N/A';

  [
    { label: 'MOT STATUS',   value: p.motStatus, col: statusColor(p.motStatus) },
    { label: 'ROAD TAX',     value: p.taxStatus, col: statusColor(p.taxStatus) },
    { label: 'PREV KEEPERS', value: kVal,        col: kCol },
  ].forEach((card, i) => {
    const cx = MARGIN + i * (hCardW + 6);
    filledRect(doc, cx, y, hCardW, hCardH, C.bg, 6);
    filledRect(doc, cx, y, 5, hCardH, card.col, 4);

    doc.fillColor(C.mid).fontSize(7).font('Helvetica')
       .text(card.label, cx + 13, y + 9, { width: hCardW - 18, lineBreak: false });
    doc.fillColor(card.col).fontSize(11).font('Helvetica-Bold')
       .text(card.value, cx + 13, y + 23, { width: hCardW - 18, lineBreak: false });
  });

  return y + hCardH;
}

// ═════════════════════════════════════════════════════════════════
//  MOT TABLE (extracted for reuse + clarity)
// ═════════════════════════════════════════════════════════════════
function drawMotTable(doc: any, Y: YRef, mots: any[], tier: Tier,
                      pageState: { num: number }, isPremium: boolean): void {
  const MC = {
    date:   MARGIN,
    result: MARGIN + 86,
    miles:  MARGIN + 144,
    adv:    MARGIN + 226,
    expiry: MARGIN + 315,
  };

  filledRect(doc, MARGIN, Y.y, CW, 17, '#e5e5ea');
  doc.fillColor(C.dark).fontSize(7.5).font('Helvetica-Bold');
  doc.text('DATE',     MC.date   + 3, Y.y + 4, { lineBreak: false });
  doc.text('RESULT',   MC.result + 3, Y.y + 4, { lineBreak: false });
  doc.text('MILEAGE',  MC.miles  + 3, Y.y + 4, { lineBreak: false });
  doc.text('ADVISORY', MC.adv    + 3, Y.y + 4, { lineBreak: false });
  doc.text('EXPIRY',   MC.expiry + 3, Y.y + 4, { lineBreak: false });
  Y.y += 17;

  mots.slice(0, 20).forEach((mot: any, i: number) => {
    const resultText  = mot.ResultText || (mot.Result ? 'PASS' : 'FAIL');
    const isPass      = String(resultText).toLowerCase().includes('pass');
    const rCol        = isPass ? C.green : C.red;
    const miles       = mot.OdometerModel?.OdometerReading;
    const adv: any[]  = mot.AdvisoryNotices_V2 || mot.AdvisoryNotices || [];
    const fails:any[] = mot.RefusalReasons_V2  || mot.RefusalReasons  || [];
    const expiry      = mot.TestExpiryDate;
    const advCount    = adv.length;
    const failCount   = fails.length;
    const detailLines = Math.min(failCount, 2) + Math.min(advCount, 3);
    const rh          = detailLines > 0 ? ROW_H + 4 + detailLines * 12 : ROW_H;

    ensureSpace(doc, rh + 2, Y, tier, pageState);

    filledRect(doc, MARGIN, Y.y, CW, rh, i % 2 === 0 ? C.white : '#fafafa');

    filledRect(doc, MC.result + 2, Y.y + 4, 36, 13,
               isPass ? C.greenLight : C.redLight, 6);
    doc.fillColor(rCol).fontSize(7.5).font('Helvetica-Bold')
       .text(isPass ? 'PASS' : 'FAIL', MC.result + 4, Y.y + 6,
             { width: 32, align: 'center', lineBreak: false });

    doc.fillColor(C.dark).fontSize(8.5).font('Helvetica');
    doc.text(fmtDate(mot.DateOfTest || mot.date),
             MC.date + 3, Y.y + 6,   { width: 81, lineBreak: false });
    doc.text(miles ? fmtMiles(miles) : '--',
             MC.miles + 3, Y.y + 6,  { width: 80, lineBreak: false });
    doc.text(expiry ? fmtDate(expiry) : '--',
             MC.expiry + 3, Y.y + 6,
             { width: CW - (MC.expiry - MARGIN) - 4, lineBreak: false });

    if (failCount > 0) {
      const txt = `${failCount} failure${failCount > 1 ? 's' : ''}`;
      const bw  = Math.min(76, doc.widthOfString(txt, { fontSize: 7.5 }) + 10);
      filledRect(doc, MC.adv + 2, Y.y + 4, bw, 13, C.redLight, 6);
      doc.fillColor(C.red).fontSize(7.5).font('Helvetica-Bold')
         .text(txt, MC.adv + 4, Y.y + 6, { width: bw - 6, lineBreak: false });
    } else if (advCount > 0) {
      const txt = `${advCount} advisory`;
      const bw  = Math.min(76, doc.widthOfString(txt, { fontSize: 7.5 }) + 10);
      filledRect(doc, MC.adv + 2, Y.y + 4, bw, 13, C.amberLight, 6);
      doc.fillColor(C.amber).fontSize(7.5).font('Helvetica-Bold')
         .text(txt, MC.adv + 4, Y.y + 6, { width: bw - 6, lineBreak: false });
    } else {
      doc.fillColor(C.mid).fontSize(8).font('Helvetica')
         .text('None', MC.adv + 3, Y.y + 6, { lineBreak: false });
    }

    let dy = Y.y + ROW_H + 2;
    fails.slice(0, 2).forEach((f: any) => {
      doc.fillColor(C.red).fontSize(7).font('Helvetica')
         .text(`x  ${(f.Text || f.text || String(f)).slice(0, 90)}`,
               MARGIN + 8, dy, { width: CW - 14, lineBreak: false });
      dy += 12;
    });
    adv.slice(0, 3).forEach((a: any) => {
      doc.fillColor(C.amber).fontSize(7).font('Helvetica')
         .text(`^  ${(a.Text || a.text || String(a)).slice(0, 90)}`,
               MARGIN + 8, dy, { width: CW - 14, lineBreak: false });
      dy += 12;
    });

    doc.strokeColor(C.rule).lineWidth(0.3)
       .moveTo(MARGIN, Y.y + rh).lineTo(MARGIN + CW, Y.y + rh).stroke();
    Y.y += rh;
  });
}