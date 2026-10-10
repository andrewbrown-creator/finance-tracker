# Finance Manager

A personal payday planner. Enter what you were paid and it tells you:

1. **Keep in Halifax**: every direct debit and standing order until the next payday, plus a small buffer.
2. **Monzo pots**: Shopping (food, petrol, haircuts), Spend (your spending money) and Bills (Monzo direct debits).
3. **Payday transfers**: daughter's saver, paying back a friend, anything you move yourself.
4. **Left over**: what's free, with a suggested split between savings and extra debt payments.

It then gives you a tick list for payday and shows the full working so you can check every figure.

## How the maths works

* A pay period runs from payday (the 15th, or the Friday before if that's a weekend) to the day before the next payday.
* Every monthly payment dated inside that window is counted **once**. The old version counted bills dated after payday twice, which understated what was left over each month.
* Bills on the 29th to 31st fall on the last day of shorter months.
* All sums are done in whole pence, so totals never drift.
* "Show the working" on the Payday screen lists every line and confirms that what came in equals what was planned.

## Using it

Open `finance-manager.html` in any browser. On iPhone, add it to the Home Screen for an app icon.

Your figures are stored **only in the browser you use**. Nothing is sent anywhere. That also means:

* Download a backup from Settings now and then (the app reminds you after 30 days).
* A different web address, a different browser, or the iPhone Home Screen icon versus Safari each keep separate data. Use a backup to move between them.

### Moving from the old version

If the new file replaces the old one **at the same web address**, it picks up your existing payments, debts and savings automatically on first open. The old data is left untouched.

## Checking the maths

`tests/engine.test.js` runs 23 checks against the calculation code taken straight from `finance-manager.html`, including two years of pay periods to prove no bill is missed or counted twice.

```
node tests/engine.test.js
```

GitHub runs these checks automatically on every change.

## Files

* `finance-manager.html`: the whole app in one file
* `index.html`: sends the site's home page to the app
* `tests/engine.test.js`: maths checks
