# Finance Manager

A personal payday planner that keeps you a month ahead. Enter what you were paid and your Halifax balance, and it walks you through:

1. **What came in:** pay, plus any work pay-backs (internet, phone).
2. **Rest of this month:** every Halifax bill from payday to the end of the month.
3. **All of next month:** every Halifax bill next month. Together with step 2, that's what to **leave in Halifax**.
4. **Monzo for next month:** weekly budgets (food, petrol, spending) times the Mondays in the month, plus monthly ones (haircuts).
5. **Payday transfers:** your daughter's savings and anything else.
6. **Left over:** into the savings pot, or some towards a debt.
7. **Where you stand:** savings against everything owed. In the black or in the red.

## On payday (about 5 minutes)

1. Pay fills in from last month. Type your **Halifax balance**.
2. **Your payday moves** shows exactly what to do, grouped by app. Tap an amount to copy it into the banking app, and tick each move off.
3. **How it adds up** shows every line. Tap a line to change or skip something for that month only, or add a one-off (a bill, extra for a pot, a payment to someone).
4. Short month? One tap to top up from savings or trim the Spend pot.

**Owed back to you:** paid for something out of Halifax that's coming back, like a work trip? Add it, and the plan counts it straight away if Halifax can still pay every bill until it lands. If not, it tells you why and reminds you to move it to savings when it arrives. Tap *It's back* when it lands.

On a laptop the Payday screen shows a summary strip and two columns; on a phone it's a single column.

**Your progress** (Debts tab): a chart of savings against debts, with your past paydays as a solid line and the next 12 months projected as a dashed line. Above it: in the black or red now, when you'll be debt-free, and savings in a year. Hover or use the arrow keys to read any month, or switch to a table.

Also: **Can I afford it?** for any amount, quick *I paid / I owe more* buttons for debts, *Put in / Took out* for savings, a Halifax check for any day of the month, and a payday reminder for your calendar.

## How the maths works

* Each pay keeps the rest of the current month covered and pays for every bill next month.
* Leave in Halifax = rest of this month + all of next month (+ an optional cushion).
* Free to share out = Halifax balance minus that. With no balance entered, it assumes last month kept back exactly enough.
* Bills on the 29th to 31st fall on the last day of shorter months. Weekend paydays move to the Friday before.
* All sums are done in whole pence. "How it adds up" on the Payday screen confirms every pound is accounted for.

## Your figures and privacy

* This app holds **no figures**. Anyone opening the link sees an empty planner.
* Your figures save to a **private** GitHub repository you create (`finance-data`), using a key that only opens that one repository. Each device needs the key once.
* Every save is kept as a version in that repository, so you can see what changed and when.
* The page only talks to GitHub (a security rule in the page blocks everything else) and asks search engines not to list it.
* To cut off a device, delete the key on GitHub and make a new one.

## Checking the maths

`tests/engine.test.js` runs 41 checks against the calculation code taken straight from `finance-manager.html`, including a two-year simulation proving Halifax never runs short and arrives at each payday holding exactly the rest of that month.

```
node tests/engine.test.js
```

GitHub runs these checks on every change.

## Files

* `finance-manager.html`: the whole app in one file
* `index.html`: sends the site's home page to the app
* `tests/engine.test.js`: maths checks
