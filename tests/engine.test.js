// Checks the planner's maths. Run with: node tests/engine.test.js
// It reads the calculation code straight out of finance-manager.html, so what is tested is what ships.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'finance-manager.html'), 'utf8');
const match = html.match(/\/\/ ===== ENGINE START =====([\s\S]*?)\/\/ ===== ENGINE END =====/);
if (!match) throw new Error('Could not find the engine in finance-manager.html');
const Engine = new Function(`${match[1]}\nreturn Engine;`)();

const settings = (extra = {}) => ({
  payDay: 15, weekendRule: 'before', buffer: 0, extrasDefault: 0,
  safetyNet: 0, debtSplitPct: 50, savingsLabel: 'Savings', savingsInMonzo: true, ...extra
});
const makeState = (extra = {}) => ({
  settings: settings(extra.settings), items: extra.items || [], debts: extra.debts || [],
  savings: extra.savings || { balance: 0 }, cycles: extra.cycles || {}
});
const bill = (id, amount, day, from = 'halifax', more = {}) => ({ id, name: id, amount, day, from, kind: 'bill', active: true, ...more });

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
};

console.log('Finance Manager maths checks');

test('payday on a weekday stays on the 15th', () => {
  const s = makeState();
  assert.strictEqual(Engine.nominalPayday('2026-10', s.settings), '2026-10-15'); // Thursday
});

test('payday on a Sunday moves to the Friday before', () => {
  const s = makeState();
  assert.strictEqual(Engine.nominalPayday('2026-11', s.settings), '2026-11-13'); // 15 Nov 2026 is a Sunday
});

test('payday on a Saturday moves to the Monday after when set that way', () => {
  const s = makeState({ settings: { weekendRule: 'after' } });
  assert.strictEqual(Engine.nominalPayday('2026-08', s.settings), '2026-08-17'); // 15 Aug 2026 is a Saturday
});

test('pay period runs from payday to the day before the next payday', () => {
  const c = Engine.getCycle('2026-10', makeState());
  assert.deepStrictEqual([c.start, c.end, c.nextPayday, c.days], ['2026-10-15', '2026-11-12', '2026-11-13', 29]);
});

test('finds the right pay period for a date', () => {
  const s = makeState();
  assert.strictEqual(Engine.cycleIdFor('2026-10-10', s), '2026-09');
  assert.strictEqual(Engine.cycleIdFor('2026-10-15', s), '2026-10');
  assert.strictEqual(Engine.cycleIdFor('2026-11-12', s), '2026-10');
  assert.strictEqual(Engine.cycleIdFor('2026-11-13', s), '2026-11');
});

test('a manual payday change moves the start of that period and the end of the one before', () => {
  const s = makeState({ cycles: { '2027-04': { paydayOverride: '2027-04-14' } } });
  assert.strictEqual(Engine.getCycle('2027-04', s).start, '2027-04-14');
  assert.strictEqual(Engine.getCycle('2027-03', s).end, '2027-04-13');
});

test('pay periods join up with no gaps or overlaps across two years', () => {
  const s = makeState();
  let id = '2026-01';
  for (let i = 0; i < 24; i++) {
    const a = Engine.getCycle(id, s);
    const b = Engine.getCycle(Engine.shiftMonth(id, 1), s);
    assert.strictEqual(Engine.addDays(a.end, 1), b.start, `gap after ${id}`);
    id = Engine.shiftMonth(id, 1);
  }
});

test('every monthly bill is counted exactly once per month over two years', () => {
  const items = [1, 5, 13, 14, 15, 16, 28, 29, 30, 31].map(d => bill('d' + d, 1000, d));
  const s = makeState({ items });
  const seen = {};
  const first = Engine.getCycle('2026-01', s).start;
  let id = '2026-01', last;
  for (let i = 0; i < 24; i++) {
    const p = Engine.buildPlan(s, id, '2026-01-01');
    for (const l of p.groups.halifax) (seen[l.id] = seen[l.id] || []).push(l.date);
    last = p.cycle.end;
    id = Engine.shiftMonth(id, 1);
  }
  for (const it of items) {
    const expected = Engine.datesInRange(it.day, first, last);
    assert.ok(expected.length >= 23, `${it.id} only due ${expected.length} times`);
    // Same dates, none twice, none missing
    assert.deepStrictEqual(seen[it.id], expected, `${it.id} dates differ`);
  }
});

test('fixes the old double counting: bills after payday are not reserved twice', () => {
  // Old planner: 1000 - (this month's remaining 100) - (all of next month 200) = 700
  const s = makeState({ items: [bill('Late bill', 10000, 20), bill('Early bill', 10000, 5)], cycles: { '2026-10': { pay: 100000 } } });
  const p = Engine.buildPlan(s, '2026-10', '2026-10-15');
  assert.strictEqual(p.keep, 20000);
  assert.strictEqual(p.leftover, 80000);
});

test('a bill on the 31st falls on the last day of shorter months', () => {
  assert.deepStrictEqual(Engine.datesInRange(31, '2027-02-01', '2027-02-28'), ['2027-02-28']);
  assert.deepStrictEqual(Engine.datesInRange(31, '2026-04-01', '2026-04-30'), ['2026-04-30']);
});

test('when payday moves early, bills on the 13th and 14th move with it', () => {
  // Pay lands Fri 13 Nov 2026, so the October period ends on 12 Nov
  const s = makeState({ items: [bill('Water', 3000, 14)] });
  const oct = Engine.buildPlan(s, '2026-10', '2026-10-15');
  const nov = Engine.buildPlan(s, '2026-11', '2026-10-15');
  assert.strictEqual(oct.groups.halifax.length, 0);
  assert.strictEqual(oct.notInCycle.length, 1);
  assert.deepStrictEqual(nov.groups.halifax.map(l => l.date), ['2026-11-14', '2026-12-14']);
  assert.strictEqual(nov.twiceInCycle.length, 1);
});

test('works in whole pence so small amounts add up exactly', () => {
  const s = makeState({ items: [bill('a', 10, 1), bill('b', 20, 2)], cycles: { '2026-10': { pay: 30 } } });
  const p = Engine.buildPlan(s, '2026-10', '2026-10-15');
  assert.strictEqual(p.keep, 30);
  assert.strictEqual(p.leftover, 0);
});

test('every pound is accounted for across Halifax, Monzo, transfers and leftover', () => {
  const s = makeState({
    settings: { buffer: 5000, extrasDefault: 4800 },
    items: [
      bill('Rent', 95000, 1), bill('Council tax', 16200, 3), bill('Phone', 2500, 20, 'monzo'),
      { id: 'food', name: 'Food shop', amount: 40000, from: 'shopping', kind: 'bill' },
      { id: 'fun', name: 'Spending', amount: 30000, from: 'spend', kind: 'bill' },
      { id: 'kid', name: "Daughter's saver", amount: 10000, from: 'transfer', kind: 'daughter' }
    ],
    cycles: { '2026-10': { pay: 320000, carried: 5000, oneOffs: [{ id: 'mot', name: 'MOT', amount: 5485, from: 'halifax', date: '2026-10-30' }] } }
  });
  const p = Engine.buildPlan(s, '2026-10', '2026-10-15');
  assert.strictEqual(p.income.total, 320000 + 4800 + 5000);
  assert.strictEqual(p.keep, 95000 + 16200 + 5485 + 5000);
  assert.strictEqual(p.monzoPots, 2500 + 40000 + 30000);
  assert.strictEqual(p.totals.transfer, 10000);
  assert.strictEqual(p.keep + p.monzoPots + p.totals.transfer + p.leftover, p.income.total);
  assert.strictEqual(p.daughter, 10000);
  assert.ok(p.balanced);
});

test('the Halifax timeline ends on the buffer', () => {
  const s = makeState({ settings: { buffer: 5000 }, items: [bill('A', 1000, 20), bill('B', 2000, 2), bill('C', 3000, 25)] });
  const p = Engine.buildPlan(s, '2026-10', '2026-10-15');
  assert.deepStrictEqual(p.timeline.map(l => l.name), ['A', 'C', 'B']);
  assert.strictEqual(p.timeline[p.timeline.length - 1].after, 5000);
});

test('today check only counts Halifax payments still to come', () => {
  const s = makeState({ settings: { buffer: 5000 }, items: [bill('A', 1000, 20), bill('B', 2000, 2)] });
  const p = Engine.buildPlan(s, '2026-10', '2026-10-25');
  assert.strictEqual(p.todayCheck.required, 2000 + 5000);
  assert.strictEqual(p.todayCheck.count, 1);
});

test('paused items are left out and listed', () => {
  const s = makeState({ items: [bill('Gym', 3000, 1, 'halifax', { active: false })] });
  const p = Engine.buildPlan(s, '2026-10', '2026-10-15');
  assert.strictEqual(p.keep, 0);
  assert.strictEqual(p.paused.length, 1);
});

test('leftover fills the safety net first', () => {
  const s = makeState({
    settings: { safetyNet: 100000 }, savings: { balance: 80000 },
    debts: [{ id: 'cc', name: 'Card', balance: 150000, apr: 24.9, updated: '2026-10-01', updatedTs: 1 }],
    cycles: { '2026-10': { pay: 15000 } }
  });
  const p = Engine.buildPlan(s, '2026-10', '2026-10-15');
  assert.strictEqual(p.split.reason, 'safety-net');
  assert.strictEqual(p.split.toSavings, 15000);
  assert.strictEqual(p.split.toDebt, 0);
});

test('after the safety net, part goes to the highest interest debt in whole pounds', () => {
  const s = makeState({
    settings: { safetyNet: 100000, debtSplitPct: 50 }, savings: { balance: 90000 },
    debts: [
      { id: 'f', name: 'Friend', balance: 50000, apr: 0, updated: '2026-10-01', updatedTs: 1 },
      { id: 'cc', name: 'Card', balance: 150000, apr: 24.9, updated: '2026-10-01', updatedTs: 1 }
    ],
    cycles: { '2026-10': { pay: 40099 } }
  });
  const p = Engine.buildPlan(s, '2026-10', '2026-10-15');
  // 10,000 tops up the safety net, half of the remaining 30,099 rounded down to whole pounds = 15,000
  assert.strictEqual(p.split.debtId, 'cc');
  assert.strictEqual(p.split.toDebt, 15000);
  assert.strictEqual(p.split.toSavings, 40099 - 15000);
});

test('with no interest charged, the suggestion picks the smallest debt and never overpays it', () => {
  const s = makeState({
    settings: { debtSplitPct: 100 },
    items: [{ id: 't', name: 'Pay friend', amount: 10000, from: 'transfer', kind: 'debt', debtId: 'f' }],
    debts: [
      { id: 'f', name: 'Friend', balance: 25000, apr: 0, updated: '2026-10-01', updatedTs: 1 },
      { id: 'v', name: 'Store card', balance: 60000, apr: 0, updated: '2026-10-01', updatedTs: 1 }
    ],
    cycles: { '2026-10': { pay: 100000 } }
  });
  const p = Engine.buildPlan(s, '2026-10', '2026-10-15');
  assert.strictEqual(p.split.debtId, 'f');
  assert.strictEqual(p.split.toDebt, 15000); // 250 owed less this month's regular 100
  assert.strictEqual(p.covered.f, 25000);
});

test('your own choice of extra payment is respected but capped at what is owed', () => {
  const s = makeState({
    debts: [{ id: 'f', name: 'Friend', balance: 20000, apr: 0, updated: '2026-10-01', updatedTs: 1 }],
    cycles: { '2026-10': { pay: 100000, split: { toDebt: 50000, debtId: 'f' } } }
  });
  const p = Engine.buildPlan(s, '2026-10', '2026-10-15');
  assert.strictEqual(p.split.toDebt, 20000);
  assert.strictEqual(p.split.toSavings, 80000);
  assert.ok(p.split.custom);
});

test('a short month is flagged rather than hidden', () => {
  const s = makeState({ items: [bill('Rent', 120000, 1)], cycles: { '2026-10': { pay: 100000 } } });
  const p = Engine.buildPlan(s, '2026-10', '2026-10-15');
  assert.strictEqual(p.leftover, -20000);
  assert.strictEqual(p.split.reason, 'short');
  assert.strictEqual(p.split.toSavings, 0);
});

test('debt balance drops as direct debits pass and transfers are ticked', () => {
  const s = makeState({
    items: [bill('Card DD', 15000, 5, 'halifax', { kind: 'debt', debtId: 'cc' })],
    debts: [{ id: 'cc', name: 'Card', balance: 150000, apr: 0, updated: '2026-10-01', updatedTs: 1000 }],
    cycles: { '2026-10': { ticks: { 'x:debt': { ts: 2000, amount: 5000, debtId: 'cc' }, old: { ts: 500, amount: 9999, debtId: 'cc' } } } }
  });
  const d = s.debts[0];
  assert.strictEqual(Engine.debtBalance(d, s, '2026-10-04'), 150000 - 5000);
  assert.strictEqual(Engine.debtBalance(d, s, '2026-10-05'), 150000 - 15000 - 5000);
  assert.strictEqual(Engine.debtBalance(d, s, '2026-12-05'), 150000 - 45000 - 5000);
});

test('debt projection: interest free, with interest, and never clearing', () => {
  assert.deepStrictEqual(Engine.projectDebt(100000, 0, 10000), { months: 10, interest: 0 });
  // £1,000 at 24% (2% a month) paying £100: 11.3 payments by the standard formula, so 12
  const withApr = Engine.projectDebt(100000, 24, 10000);
  assert.strictEqual(withApr.months, 12);
  assert.ok(withApr.interest > 0);
  assert.ok(Engine.projectDebt(100000, 24, 1000).never);
  assert.ok(Engine.projectDebt(100000, 0, 0).never);
});

console.log(`\n${passed} checks passed${process.exitCode ? ', some FAILED' : ''}.`);
