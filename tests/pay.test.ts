import assert from "node:assert/strict";
import { test } from "node:test";
import { accrual, daysInRange, differentialMinutes, dollars, grossPay, rateOn, timeOffInPeriod, type Differential, type PayLineInput } from "../src/lib/pay";

test("the rate in force is the latest that started on or before the day", () => {
  const rates = [{ effectiveFrom: "2026-01-01", centsPerHour: 1500 }, { effectiveFrom: "2026-07-01", centsPerHour: 1600 }];
  assert.equal(rateOn(rates, "2025-12-31"), null);
  assert.equal(rateOn(rates, "2026-06-30"), 1500);
  assert.equal(rateOn(rates, "2026-07-01"), 1600);
});

const night: Differential = { id: "n", name: "Overnight", kind: "hours", startTime: "23:00", endTime: "07:00", days: [], homeId: null, centsPerHour: 100 };
const weekend: Differential = { id: "w", name: "Weekend", kind: "days", startTime: "", endTime: "", days: [6, 7], homeId: null, centsPerHour: 75 };
const riverside: Differential = { id: "r", name: "Riverside", kind: "home", startTime: "", endTime: "", days: [], homeId: "h2", centsPerHour: 50 };

// Central daylight time is UTC-5 in October: 19:00 Central = 00:00Z next day.
const line = (id: string, inIso: string, outIso: string, minutes: number, extra: Partial<PayLineInput> = {}): PayLineInput => ({
  id, day: inIso.slice(0, 10), clockInAt: new Date(inIso), clockOutAt: new Date(outIso), minutes, overtime: 0, homeId: "h1", holiday: null, open: false, ...extra,
});

test("differentials: overnight windows cross midnight, weekends by Central day, homes for the whole punch", () => {
  // 19:00 Fri Oct 9 to 07:00 Sat Oct 10 Central: 8 hours inside 23:00-07:00.
  const overnight = line("a", "2026-10-10T00:00:00Z", "2026-10-10T12:00:00Z", 720);
  assert.equal(differentialMinutes(night, overnight), 480);
  // Of that shift, midnight to 07:00 Saturday is weekend: 7 hours.
  assert.equal(differentialMinutes(weekend, overnight), 420);
  assert.equal(differentialMinutes(riverside, overnight), 0);
  assert.equal(differentialMinutes(riverside, { ...overnight, homeId: "h2" }), 720);
  // A 30-minute unpaid meal scales the covered time down.
  assert.equal(differentialMinutes(riverside, { ...overnight, homeId: "h2", minutes: 690 }), 690);
  assert.equal(differentialMinutes(night, { ...overnight, minutes: 690 }), 460);
});

test("gross pay: straight time, overtime at the regular rate including differentials, holiday premium", () => {
  const rules = { overtimePercent: 150, holidayPercent: 150, weekStartsOn: 1 };
  const rates = [{ effectiveFrom: "2026-01-01", centsPerHour: 2000 }];
  // A Monday-Friday week of 45 hours: five 9-hour days; the last has 5 hours overtime.
  const week = ["12", "13", "14", "15", "16"].map((d, i) => line(d, `2026-10-${d}T12:00:00Z`, `2026-10-${d}T21:00:00Z`, 540, { day: `2026-10-${d}`, overtime: i === 4 ? 300 : 0 }));
  const plain = grossPay({ lines: week, allLines: week, rates, differentials: [], rules, timeOff: [], adjustments: [] });
  assert.equal(plain.straight, 45 * 2000);
  assert.equal(plain.overtimePremium, 5 * 1000);
  assert.equal(plain.gross, 95000);
  assert.equal(plain.missingRate, false);

  // A $0.50 home differential on every hour raises the regular rate to $20.50, so the premium is 5 x $10.25.
  const atRiverside = week.map(item => ({ ...item, homeId: "h2" }));
  const withDiff = grossPay({ lines: atRiverside, allLines: atRiverside, rates, differentials: [riverside], rules, timeOff: [], adjustments: [] });
  assert.equal(withDiff.differentials, 45 * 50);
  assert.equal(withDiff.overtimePremium, 5125);
  assert.deepEqual(withDiff.byDifferential, [{ name: "Riverside", minutes: 2700, cents: 2250 }]);

  const holiday = [line("h", "2026-11-26T13:00:00Z", "2026-11-26T21:00:00Z", 480, { holiday: "Thanksgiving" })];
  const holidayPay = grossPay({ lines: holiday, allLines: holiday, rates, differentials: [], rules, timeOff: [{ day: "2026-11-27", minutes: 480 }], adjustments: [{ minutes: 60, overtime: true, day: "2026-11-26" }] });
  assert.equal(holidayPay.straight, 16000);
  assert.equal(holidayPay.holidayPremium, 8000);
  assert.equal(holidayPay.timeOff, 16000);
  assert.equal(holidayPay.adjustments, 3000);
});

test("gross pay flags a missing rate rather than guessing", () => {
  const result = grossPay({ lines: [line("x", "2026-10-12T12:00:00Z", "2026-10-12T20:00:00Z", 480)], allLines: [line("x", "2026-10-12T12:00:00Z", "2026-10-12T20:00:00Z", 480)], rates: [], differentials: [], rules: { overtimePercent: 150, holidayPercent: 100, weekStartsOn: 1 }, timeOff: [], adjustments: [] });
  assert.equal(result.missingRate, true);
  assert.equal(result.gross, 0);
});

test("time off spreads over its days and only counts days in the period", () => {
  assert.deepEqual(daysInRange("2026-10-30", "2026-11-02"), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  assert.deepEqual(timeOffInPeriod({ startDate: "2026-10-30", endDate: "2026-11-02", minutes: 1920 }, { start: "2026-11-01", end: "2026-11-15" }), [
    { day: "2026-11-01", minutes: 480 },
    { day: "2026-11-02", minutes: 480 },
  ]);
});

test("accrual earns one hour per so many worked, capped at the maximum balance", () => {
  assert.equal(accrual(2400, 30, 0, 80 * 60), 80);
  assert.equal(accrual(2400, 30, 80 * 60 - 20, 80 * 60), 20);
  assert.equal(accrual(2400, 0, 0, 4800), 0);
  assert.equal(dollars(123456), "$1,234.56");
});
