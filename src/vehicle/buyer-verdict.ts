import { BuyerVerdict, VerdictLevel } from '../types/report';
// If your folder is actually src/types/ then change to '../types/report'

interface VerdictInput {
  tier: 'standard' | 'premium';
  riskScore?: number | null;
  writeOff?: any;
  finance?: any;
  stolen?: any;
  vehicle?: any;
  motHistory?: any[];
  keeperHistory?: any[];
  vehicleRecalls?: any;
  insights?: any[];
}

function isFlagged(v: any): boolean {
  if (v === undefined || v === null) return false;
  const s = String(v).toLowerCase();
  return s !== 'clear' && s !== 'no' && s !== 'false' && s !== 'none' && s !== 'unknown' && s !== '';
}

function countAdvisories(motHistory: any[]): number {
  if (!Array.isArray(motHistory)) return 0;
  return motHistory.reduce((sum, mot) => {
    const adv = mot.AdvisoryNotices_V2 || mot.AdvisoryNotices || mot.advisories || [];
    return sum + (Array.isArray(adv) ? adv.length : 0);
  }, 0);
}

function hasMileageAnomaly(motHistory: any[]): boolean {
  if (!Array.isArray(motHistory)) return false;
  return motHistory.some((mot) => mot.HasMileageIssue === true);
}

function motPassRate(motHistory: any[]): number {
  if (!Array.isArray(motHistory) || motHistory.length === 0) return 1;
  const passes = motHistory.filter((m) => {
    const r = String(m.ResultText || m.Result || '').toLowerCase();
    return r.includes('pass') || m.Result === true;
  }).length;
  return passes / motHistory.length;
}

function recentKeeperTurnover(keeperHistory: any[]): boolean {
  if (!Array.isArray(keeperHistory) || keeperHistory.length < 4) return false;
  const latest = keeperHistory[0];
  if (!latest) return false;
  const dateStr = latest.DateOfLastKeeperChange || latest.date;
  if (!dateStr) return false;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return false;
  const monthsAgo = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 30.4);
  return monthsAgo < 6;
}

function recallCount(recalls: any): number {
  if (!recalls) return 0;
  if (Array.isArray(recalls)) return recalls.length;
  if (Array.isArray(recalls?.RecallRecordList)) return recalls.RecallRecordList.length;
  return 0;
}

export function computeBuyerVerdict(input: VerdictInput): BuyerVerdict {
  const {
    tier,
    riskScore,
    writeOff,
    finance,
    stolen,
    vehicle = {},
    motHistory = [],
    keeperHistory = [],
    vehicleRecalls,
    insights = [],
  } = input;

  const score = typeof riskScore === 'number' ? riskScore : parseInt(String(riskScore || 0)) || 0;
  const advCount = countAdvisories(motHistory);
  const passRate = motPassRate(motHistory);
  // Mileage anomaly: local MOT scan OR upstream API flag
  const mileageAnomaly = hasMileageAnomaly(motHistory) || !!vehicle.mileageIssueIdentified;
  const keeperCount = keeperHistory.length;
  const recentTurnover = recentKeeperTurnover(keeperHistory);
  const recalls = recallCount(vehicleRecalls);
  const colourChanges = parseInt(String(vehicle.colourChanges || 0)) || 0;

  const isExported = !!(vehicle.markedForExport || vehicle.Exported || vehicle.exportStatus);
  const isScrapped = !!(vehicle.isScrapped || vehicle.IsScrapped);
  const isImported = !!(vehicle.isImported || vehicle.IsImported);
  const isSORN = !!(vehicle.isVehicleSORN || vehicle.IsVehicleSORN);

  const writeOffFlagged = isFlagged(writeOff);
  const financeFlagged = tier === 'premium' && isFlagged(finance);
  const stolenFlagged = tier === 'premium' && isFlagged(stolen);

  let criticalCount = 0;
  let highCount = 0;
  if (Array.isArray(insights)) {
    insights.forEach((f: any) => {
      const sev = String(f.severity || f.level || '').toUpperCase();
      if (sev === 'CRITICAL') criticalCount++;
      else if (sev === 'HIGH') highCount++;
    });
  }

  // ── HIGH_RISK conditions ──
  const highRiskReasons: string[] = [];
  if (score >= 60) highRiskReasons.push('high risk score');
  if (writeOffFlagged) highRiskReasons.push('insurance write-off recorded');
  if (financeFlagged) highRiskReasons.push('outstanding finance');
  if (stolenFlagged) highRiskReasons.push('stolen marker');
  if (isScrapped) highRiskReasons.push('scrapped marker');
  if (isExported) highRiskReasons.push('marked for export');
  if (criticalCount >= 2) highRiskReasons.push('multiple critical findings');

  // ── CAUTION conditions ──
  const cautionReasons: string[] = [];
  if (score >= 30 && score < 60) cautionReasons.push('moderate risk score');
  if (criticalCount === 1 || highCount >= 2) cautionReasons.push('significant findings detected');
  if (keeperCount >= 5) cautionReasons.push(`${keeperCount} previous keepers`);
  if (advCount >= 15) cautionReasons.push(`${advCount} MOT advisories`);
  if (mileageAnomaly) cautionReasons.push('mileage anomaly detected');
  if (recentTurnover) cautionReasons.push('current keeper tenure under 6 months');
  if (isImported) cautionReasons.push('imported vehicle');
  if (isSORN) cautionReasons.push('vehicle is SORN-declared');
  if (recalls > 0) cautionReasons.push(`${recalls} outstanding recall${recalls > 1 ? 's' : ''}`);
  if (colourChanges >= 2) cautionReasons.push(`colour changed ${colourChanges} times`);

  // ── Pros ──
  const pros: string[] = [];
  if (passRate === 1 && motHistory.length > 0) pros.push(`100% MOT pass rate across ${motHistory.length} tests`);
  else if (passRate >= 0.85 && motHistory.length > 0) pros.push(`Strong MOT history (${Math.round(passRate * 100)}% pass rate)`);
  if (!mileageAnomaly && motHistory.length >= 3) pros.push('Consistent mileage progression');
  if (keeperCount > 0 && keeperCount <= 2) pros.push('Low keeper turnover');
  if (!isExported && !isScrapped && !isImported && !isSORN) pros.push('Active UK registration');
  if (recalls === 0 && vehicleRecalls !== undefined) pros.push('No outstanding manufacturer recalls');
  if (tier === 'premium' && !financeFlagged && finance !== undefined) pros.push('No outstanding finance');
  if (tier === 'premium' && !stolenFlagged && stolen !== undefined) pros.push('Not reported stolen');

  // ── Watch-outs ──
  const watchOuts: string[] = [];
  if (writeOffFlagged) watchOuts.push('Insurance write-off recorded — repair history unverified');
  if (financeFlagged) watchOuts.push('Outstanding finance — vehicle may be repossessed by lender');
  if (stolenFlagged) watchOuts.push('Stolen marker on Police National Computer');
  if (isScrapped) watchOuts.push('DVLA marked as scrapped — verify roadworthiness');
  if (isExported) watchOuts.push('Marked for export — confirm vehicle is still in UK');
  if (isImported) watchOuts.push('Imported vehicle — verify history with original-market records');
  if (isSORN) watchOuts.push('Vehicle is declared off-road (SORN) — confirm reason before driving');
  if (recalls > 0) watchOuts.push(`${recalls} outstanding manufacturer recall${recalls > 1 ? 's' : ''} — check whether work has been completed`);
  if (colourChanges >= 2) watchOuts.push(`Colour changed ${colourChanges} times — investigate respray history`);
  if (mileageAnomaly) watchOuts.push('Possible mileage discrepancy in MOT records');
  if (advCount >= 15) watchOuts.push(`${advCount} MOT advisories — review for recurring issues`);
  if (keeperCount >= 5) watchOuts.push(`${keeperCount} previous keepers — investigate ownership history`);
  if (recentTurnover) watchOuts.push('Current keeper has held vehicle less than 6 months');
  if (criticalCount >= 1) watchOuts.push(`${criticalCount} critical finding${criticalCount > 1 ? 's' : ''} detected`);
  if (highCount >= 1 && criticalCount === 0) watchOuts.push(`${highCount} high-priority finding${highCount > 1 ? 's' : ''} detected`);
  
  // ── Decide verdict ──
  let verdict: VerdictLevel;
  let headline: string;
  let action: string;

  if (highRiskReasons.length > 0) {
    verdict = 'HIGH_RISK';
    headline = 'Multiple warning signals detected — review carefully before purchase.';
    action = 'Independent inspection strongly recommended before committing.';
  } else if (cautionReasons.length > 0) {
    verdict = 'CAUTION';
    headline = 'No critical issues detected, but some history requires review.';
    action = 'Review watch-outs and consider an independent inspection.';
  } else {
    verdict = 'SAFE_BUY';
    headline = 'Low-risk vehicle with healthy history and no major warning patterns.';
    action = 'Proceed with normal pre-purchase checks.';
  }

  return { verdict, headline, pros, watchOuts, action };
}