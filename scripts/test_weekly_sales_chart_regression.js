const assert = require('node:assert/strict');

function parseDate(value) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]) ? date : null;
}

function isValidRangeWithinOneYear(from, to) {
  const start = parseDate(from);
  const end = parseDate(to);
  if (!start || !end || start > end) return false;
  const maxEnd = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate());
  if (maxEnd.getMonth() !== start.getMonth()) maxEnd.setDate(0);
  return end <= maxEnd;
}

function key(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

function monday(date) {
  const result = new Date(date);
  const day = result.getDay();
  result.setDate(result.getDate() - day + (day === 0 ? -6 : 1));
  return result;
}

function aggregateWeekly(from, to, records) {
  const start = parseDate(from);
  const end = parseDate(to);
  assert(start && end && start <= end, 'Date range must be valid');

  const days = {};
  for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) days[key(date)] = 0;

  for (const record of records) {
    const date = parseDate(record.date);
    const amount = typeof record.amount === 'number'
      ? record.amount
      : typeof record.amount === 'string' && record.amount.trim()
        ? Number(record.amount)
        : NaN;
    if (!date || !Number.isFinite(amount) || date < start || date > end) continue;
    days[key(date)] += amount;
  }

  const weeks = {};
  Object.keys(days).sort().forEach((dayKey) => {
    const weekKey = key(monday(parseDate(dayKey)));
    weeks[weekKey] = (weeks[weekKey] || 0) + days[dayKey];
  });
  return weeks;
}

function sum(values) {
  return Object.values(values).reduce((total, value) => total + value, 0);
}

function aggregateMonthly(from, to, records) {
  const start = parseDate(from);
  const end = parseDate(to);
  assert(start && end && start <= end, 'Date range must be valid');

  const days = {};
  for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) days[key(date)] = 0;

  for (const record of records) {
    const date = parseDate(record.date);
    const amount = typeof record.amount === 'number'
      ? record.amount
      : typeof record.amount === 'string' && record.amount.trim()
        ? Number(record.amount)
        : NaN;
    if (!date || !Number.isFinite(amount) || date < start || date > end) continue;
    days[key(date)] += amount;
  }

  const months = {};
  Object.keys(days).sort().forEach((dayKey) => {
    const monthKey = dayKey.slice(0, 7);
    months[monthKey] = (months[monthKey] || 0) + days[dayKey];
  });
  return months;
}

function aggregateQuarterly(from, to, records) {
  const start = parseDate(from);
  const end = parseDate(to);
  assert(start && end && start <= end, 'Date range must be valid');

  const days = {};
  for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) days[key(date)] = 0;

  for (const record of records) {
    const date = parseDate(record.date);
    const amount = typeof record.amount === 'number'
      ? record.amount
      : typeof record.amount === 'string' && record.amount.trim()
        ? Number(record.amount)
        : NaN;
    if (!date || !Number.isFinite(amount) || date < start || date > end) continue;
    days[key(date)] += amount;
  }

  const quarters = {};
  Object.keys(days).sort().forEach((dayKey) => {
    const date = parseDate(dayKey);
    const quarterKey = date.getFullYear() + '-Q' + (Math.floor(date.getMonth() / 3) + 1);
    quarters[quarterKey] = (quarters[quarterKey] || 0) + days[dayKey];
  });
  return quarters;
}

const partialWeeks = aggregateWeekly('2026-06-03', '2026-06-10', [
  { date: '2026-06-01', amount: 900 },
  { date: '2026-06-03', amount: 100 },
  { date: '2026-06-07', amount: '50' },
  { date: '2026-06-08', amount: 200 },
  { date: '2026-06-10', amount: 75 },
  { date: '2026-06-11', amount: 800 },
]);
assert.deepEqual(partialWeeks, { '2026-06-01': 150, '2026-06-08': 275 });
assert.equal(sum(partialWeeks), 425);

const newYearWeeks = aggregateWeekly('2025-12-29', '2026-01-05', [
  { date: '2025-12-29', amount: 10 },
  { date: '2026-01-01', amount: 20 },
  { date: '2026-01-05', amount: 30 },
]);
assert.deepEqual(newYearWeeks, { '2025-12-29': 30, '2026-01-05': 30 });

const zeroAndInvalid = aggregateWeekly('2026-06-01', '2026-06-07', [
  { date: '2026-06-02', amount: 0 },
  { date: '2026-06-03', amount: null },
  { date: 'invalid', amount: 500 },
]);
assert.deepEqual(zeroAndInvalid, { '2026-06-01': 0 });

const emptyWeek = aggregateWeekly('2026-06-01', '2026-06-21', []);
assert.deepEqual(emptyWeek, { '2026-06-01': 0, '2026-06-08': 0, '2026-06-15': 0 });

assert.throws(() => aggregateWeekly('2026-06-10', '2026-06-01', []), /Date range must be valid/);
assert.equal(isValidRangeWithinOneYear('2026-06-03', '2027-06-03'), true);
assert.equal(isValidRangeWithinOneYear('2026-06-03', '2027-06-04'), false);
assert.equal(isValidRangeWithinOneYear('2024-02-29', '2025-02-28'), true);
assert.equal(isValidRangeWithinOneYear('2024-02-29', '2025-03-01'), false);
assert.equal(isValidRangeWithinOneYear('2026-06-10', '2026-06-01'), false);

const partialMonths = aggregateMonthly('2025-12-29', '2026-02-03', [
  { date: '2025-12-28', amount: 500 },
  { date: '2025-12-29', amount: 100 },
  { date: '2026-01-15', amount: 200 },
  { date: '2026-02-03', amount: -50 },
  { date: '2026-02-04', amount: 800 },
]);
assert.deepEqual(partialMonths, { '2025-12': 100, '2026-01': 200, '2026-02': -50 });
assert.equal(sum(partialMonths), 250);
assert.equal(sum(Object.values(partialMonths)) / Object.keys(partialMonths).length, 250 / 3);

const emptyMonths = aggregateMonthly('2026-01-15', '2026-03-10', []);
assert.deepEqual(emptyMonths, { '2026-01': 0, '2026-02': 0, '2026-03': 0 });

const partialQuarters = aggregateQuarterly('2025-12-29', '2026-04-03', [
  { date: '2025-12-29', amount: 100 },
  { date: '2026-01-15', amount: 200 },
  { date: '2026-03-31', amount: -25 },
  { date: '2026-04-03', amount: 300 },
  { date: '2026-04-04', amount: 900 },
]);
assert.deepEqual(partialQuarters, { '2025-Q4': 100, '2026-Q1': 175, '2026-Q2': 300 });
assert.equal(sum(partialQuarters), 575);

const emptyQuarters = aggregateQuarterly('2026-01-01', '2026-06-30', []);
assert.deepEqual(emptyQuarters, { '2026-Q1': 0, '2026-Q2': 0 });
console.log('Weekly sales chart regression checks passed.');
