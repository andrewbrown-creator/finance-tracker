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

const makeState = (extra = {}) => ({
  settings: { payDay: 15, weekendRule: 'before', weekDay: 1, buffer: 0, ...(extra.settings || {}) },
  bills: extra.bills || [], budgets: extra.budgets || [], transfers: extra.transfers || [],
  debts: extra.debts || [], savings: extra.savings || { balance: 0 }, months: extra.months || {}
});
const bill = (id, amount, day, more = {}) => ({ id, name: id, amount, day, active: true, ...more });
const weekly = (id, amount, pot = 'shop') => ({ id, name: id, amount, per: 'week', pot, active: true });
const monthly = (id, amount, pot = 'shop') => ({ id, name: id, amount, per: 'month', pot, active: true });

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
};

console.log('Finance Manager maths checks');

// ---- Paydays ----
test('payday on a weekday stays on the 15th', () => {
  assert.strictEqual(Engine.nominalPayday('2026-10', makeState().settings), '2026-10-15');
});
test('payday on a Sunday moves to the Friday before', () => {
  assert.strictEqual(Engine.nominalPayday('2026-11', makeState().settings), '2026-11-13');
});
test('payday on a Saturday moves to the Monday after when set that way', () => {
  assert.strictEqual(Engine.nominalPayday('2026-08', makeState({ settings: { weekendRule: 'after' } }).settings), '2026-08-17');
});
test('finds which payday a date falls after', () => {
  const s = makeState();
  assert.strictEqual(Engine.monthIdFor('2026-10-10', s), '2026-09');
  assert.strictEqual(Engine.monthIdFor('2026-10-15', s), '2026-10');
  assert.strictEqual(Engine.monthIdFor('2026-11-12', s), '2026-10');
  assert.strictEqual(Engine.monthIdFor('2026-11-13', s), '2026-11');
});
test('a changed payday is respected', () => {
  const s = makeState({ months: { '2027-04': { paydayOverride: '2027-04-14' } } });
  assert.strictEqual(Engine.period('2027-04', s).payday, '2027-04-14');
  assert.strictEqual(Engine.period('2027-03', s).end, '2027-04-13');
});

// ---- Weeks ----
test('weeks are counted by the Mondays in the month', () => {
  assert.deepStrictEqual(Engine.weeksIn('2026-11', 1), [2, 9, 16, 23, 30]);
  assert.deepStrictEqual(Engine.weeksIn('2026-12', 1), [7, 14, 21, 28]);
  assert.strictEqual(Engine.weeksIn('2027-02', 1).length, 4);
  assert.strictEqual(Engine.weeksIn('2027-03', 1).length, 5);
});
test('a full year has 52 or 53 Mondays across its months', () => {
  let total = 0;
  for (let i = 0; i < 12; i++) total += Engine.weeksIn(Engine.shiftMonth('2027-01', i), 1).length;
  assert.ok(total === 52 || total === 53, `got ${total}`);
});

// ---- Halifax: rest of this month plus all of next ----
test('keeps the rest of this month and all of next month', () => {
  const s = makeState({ bills: [1, 14, 15, 20, 31].map(d => bill('d' + d, 1000 * d, d)) });
  const p = Engine.buildPlan(s, '2026-10', '2026-10-15');
  assert.deepStrictEqual(p.rest.map(l => l.date), ['2026-10-15', '2026-10-20', '2026-10-31']);
  assert.deepStrictEqual(p.next.map(l => l.date), ['2026-11-01', '2026-11-14', '2026-11-15', '2026-11-20', '2026-11-30']);
  assert.strictEqual(p.restTotal, 15000 + 20000 + 31000);
  assert.strictEqual(p.nextTotal, 1000 + 14000 + 15000 + 20000 + 31000);
  assert.strictEqual(p.keep, p.restTotal + p.nextTotal);
});
test('free money is the Halifax balance less what has to stay', () => {
  const s = makeState({ settings: { buffer: 5000 }, bills: [bill('Mortgage', 85000, 1), bill('Sky', 6500, 20)],
    months: { '2026-10': { pay: 320000, halifax: 335000 } } });
  const p = Engine.buildPlan(s, '2026-10', '2026-10-15');
  assert.strictEqual(p.keep, 6500 + 85000 + 6500 + 5000);
  assert.strictEqual(p.free, 335000 - p.keep);
});
test('without a Halifax balance it assumes last month kept back exactly enough', () => {
  const s = makeState({ bills: [bill('Mortgage', 85000, 1), bill('Sky', 6500, 20)], months: { '2026-10': { pay: 320000 } } });
  const p = Engine.buildPlan(s, '2026-10', '2026-10-15');
  assert.strictEqual(p.entered, false);
  assert.strictEqual(p.free, 320000 - p.nextTotal);
});
test('when payday moves early, the rest of the month starts on the new payday', () => {
  const s = makeState({ bills: [bill('Water', 3800, 14)] });
  const p = Engine.buildPlan(s, '2026-11', '2026-11-13'); // paid Fri 13 Nov
  assert.deepStrictEqual(p.rest.map(l => l.date), ['2026-11-14']);
  assert.deepStrictEqual(p.next.map(l => l.date), ['2026-12-14']);
});
test('a one-off bill only appears in its month', () => {
  const s = makeState({ bills: [bill('MOT', 5485, 20, { once: '2026-11' })] });
  assert.strictEqual(Engine.buildPlan(s, '2026-10', '2026-10-15').nextTotal, 5485);
  assert.strictEqual(Engine.buildPlan(s, '2026-11', '2026-11-13').nextTotal, 0);
  assert.strictEqual(Engine.buildPlan(s, '2026-11', '2026-11-13').restTotal, 5485);
  assert.strictEqual(Engine.buildPlan(s, '2026-12', '2026-12-15').restTotal, 0);
});
test('paused and zero bills are left out', () => {
  const s = makeState({ bills: [bill('Gym', 3000, 1, { active: false }), bill('Free trial', 0, 2)] });
  assert.strictEqual(Engine.buildPlan(s, '2026-10', '2026-10-15').keep, 0);
});
test('works in whole pence so small amounts add up exactly', () => {
  const s = makeState({ bills: [bill('a', 10, 1), bill('b', 20, 2)] });
  assert.strictEqual(Engine.buildPlan(s, '2026-10', '2026-10-15').nextTotal, 30);
});

// ---- Staying a month ahead, proved by simulation ----
test('following the plan for two years, Halifax never runs short and stays a month ahead', () => {
  const bills = [1, 3, 5, 13, 14, 15, 18, 22, 28, 29, 30, 31].map(d => bill('d' + d, 1000 + d * 37, d));
  const s = makeState({ settings: { buffer: 2500 }, bills });
  const pay = 150000;
  let id = '2026-01';
  const first = Engine.buildPlan(s, id, '2026-01-15');
  let balance = first.restTotal + first.buffer; // start already a month ahead
  for (let i = 0; i < 24; i++) {
    const per = Engine.period(id, s);
    s.months[id] = { pay, halifax: balance + pay };
    const p = Engine.buildPlan(s, id, per.payday);
    assert.ok(p.free >= 0, `${id} not covered`);
    assert.strictEqual(p.free, pay - p.nextTotal, `${id} free should equal pay less next month's bills`);
    balance = p.keep; // payday moves done
    for (const l of Engine.billsBetween(s, per.payday, per.end)) {
      balance -= l.amount;
      assert.ok(balance >= p.buffer, `${id}: Halifax dipped below the buffer on ${l.date}`);
    }
    const nextPer = Engine.period(Engine.shiftMonth(id, 1), s);
    const nextRest = Engine.billsBetween(s, nextPer.payday, nextPer.monthEnd).reduce((t, l) => t + l.amount, 0);
    assert.strictEqual(balance, nextRest + p.buffer, `${id}: should arrive at next payday holding exactly the rest of that month`);
    id = Engine.shiftMonth(id, 1);
  }
});

// ---- Monzo, transfers, leftover ----
test('weekly budgets times the weeks in next month, plus monthly ones', () => {
  const s = makeState({
    budgets: [weekly('Food', 7000), weekly('Petrol', 5000), monthly('Haircuts', 3500), weekly('Spending', 4000, 'spend')],
    transfers: [{ id: 'kid', name: "Daughter's savings", amount: 5000, active: true }],
    months: { '2026-10': { halifax: 400000 } }
  });
  const p = Engine.buildPlan(s, '2026-10', '2026-10-15');
  assert.strictEqual(p.weeks, 5); // November 2026 has five Mondays
  assert.strictEqual(p.shop, 7000 * 5 + 5000 * 5 + 3500);
  assert.strictEqual(p.spend, 4000 * 5);
  assert.strictEqual(p.leftover, 400000 - p.monzo - 5000);
  assert.strictEqual(p.toSavings, p.leftover);
});
test('weeks can be changed for a month', () => {
  const s = makeState({ budgets: [weekly('Food', 7000)], months: { '2026-10': { halifax: 100000, weeks: 4 } } });
  assert.strictEqual(Engine.buildPlan(s, '2026-10', '2026-10-15').shop, 28000);
});
test('every pound is accounted for', () => {
  const s = makeState({
    settings: { buffer: 5000 },
    bills: [bill('Mortgage', 85000, 1), bill('Council tax', 16200, 3), bill('Internet', 3000, 20, { reimbursed: true })],
    budgets: [weekly('Food', 7000), weekly('Petrol', 5000), monthly('Haircuts', 3500), weekly('Spending', 6000, 'spend')],
    transfers: [{ id: 'kid', name: "Daughter's savings", amount: 5000, active: true }],
    debts: [{ id: 'v', name: 'Store card', balance: 40000, apr: 29.9, updated: '2026-10-01', updatedTs: 1 }],
    months: { '2026-10': { pay: 320000, halifax: 341234, extra: { amount: 10000, debtId: 'v' } } }
  });
  const p = Engine.buildPlan(s, '2026-10', '2026-10-15');
  assert.strictEqual(p.keep + p.monzo + p.transfersTotal + p.extra + p.toSavings, p.halifax);
  assert.ok(p.balanced);
  assert.strictEqual(p.reimbTotal, 3000);
});
test('a short month is shown as short, with nothing to savings', () => {
  const s = makeState({ bills: [bill('Mortgage', 120000, 1)], months: { '2026-10': { halifax: 150000 } },
    budgets: [weekly('Food', 7000)] });
  const p = Engine.buildPlan(s, '2026-10', '2026-10-15');
  assert.ok(p.leftover < 0);
  assert.strictEqual(p.toSavings, 0);
  assert.strictEqual(p.extra, 0);
});
test('an extra debt payment is capped at the leftover and the balance', () => {
  const s = makeState({
    debts: [{ id: 'f', name: 'Friend', balance: 20000, apr: 0, updated: '2026-10-01', updatedTs: 1 }],
    months: { '2026-10': { halifax: 100000, extra: { amount: 50000, debtId: 'f' } } }
  });
  const p = Engine.buildPlan(s, '2026-10', '2026-10-15');
  assert.strictEqual(p.extra, 20000);
  assert.strictEqual(p.toSavings, 80000);
});

// ---- Where you stand ----
test('in the black or the red: savings after this month less all debts', () => {
  const s = makeState({
    savings: { balance: 50000 },
    debts: [{ id: 'cc', name: 'Card', balance: 120000, apr: 0, updated: '2026-10-01', updatedTs: 1 }],
    months: { '2026-10': { halifax: 30000 } }
  });
  const p = Engine.buildPlan(s, '2026-10', '2026-10-15');
  assert.strictEqual(p.savingsAfter, 80000);
  assert.strictEqual(p.net, 80000 - 120000);
});
test('once the savings step is ticked it is not counted twice', () => {
  const s = makeState({ savings: { balance: 80000 }, months: { '2026-10': { halifax: 30000, ticks: { 'x:savings': { ts: 5, amount: 30000 } } } } });
  assert.strictEqual(Engine.buildPlan(s, '2026-10', '2026-10-15').savingsAfter, 80000);
});

// ---- Debts ----
test('debt balance drops as linked bills pass and extra payments are ticked', () => {
  const s = makeState({
    bills: [bill('Card DD', 15000, 5, { debtId: 'cc' })],
    debts: [{ id: 'cc', name: 'Card', balance: 150000, updated: '2026-10-01', updatedTs: 1000 }],
    months: { '2026-10': { ticks: { 'x:debt': { ts: 2000, amount: 5000, debtId: 'cc' }, old: { ts: 500, amount: 9999, debtId: 'cc' } } } }
  });
  const d = s.debts[0];
  assert.strictEqual(Engine.debtBalance(d, s, '2026-10-04'), 150000 - 5000);
  assert.strictEqual(Engine.debtBalance(d, s, '2026-10-05'), 150000 - 15000 - 5000);
  assert.strictEqual(Engine.debtBalance(d, s, '2026-12-05'), 150000 - 45000 - 5000);
});
test('debt projection: interest free, with interest, and never clearing', () => {
  assert.deepStrictEqual(Engine.projectDebt(100000, 0, 10000), { months: 10, interest: 0 });
  assert.strictEqual(Engine.projectDebt(100000, 24, 10000).months, 12);
  assert.ok(Engine.projectDebt(100000, 24, 1000).never);
  assert.ok(Engine.projectDebt(100000, 0, 0).never);
});

// ---- Mid-month check ----
test('the Halifax check covers everything still to come up to the end of next month', () => {
  const s = makeState({ settings: { buffer: 5000 }, bills: [bill('A', 1000, 20), bill('B', 2000, 2)] });
  const p = Engine.buildPlan(s, '2026-10', '2026-10-25');
  // Still to come: B on 2 Nov, A on 20 Nov (A on 20 Oct has gone)
  assert.strictEqual(p.todayCheck.required, 1000 + 2000 + 5000);
  assert.strictEqual(p.todayCheck.count, 2);
});
test('the bill-by-bill list ends on the buffer', () => {
  const s = makeState({ settings: { buffer: 5000 }, bills: [bill('A', 1000, 20), bill('B', 2000, 2)] });
  const p = Engine.buildPlan(s, '2026-10', '2026-10-15');
  assert.strictEqual(p.timeline[p.timeline.length - 1].after, 5000);
});

console.log(`\n${passed} checks passed${process.exitCode ? ', some FAILED' : ''}.`);
