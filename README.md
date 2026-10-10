# Finance Manager

A personal payday planner that keeps you a month ahead. Enter what you were paid and your Halifax balance, and it walks you through:

1. **What came in:** pay, plus any work pay-backs (internet, phone).
2. **Rest of this month:** every Halifax bill from payday to the end of the month.
3. **All of next month:** every Halifax bill next month. Together with step 2, that's what to **leave in Halifax**.
4. **Monzo for next month:** weekly budgets (food, petrol, spending) times the Mondays in the month, plus monthly ones (haircuts).
5. **Payday transfers:** your daughter's savings and anything else.
6. **Left over:** into the savings pot, or some towards a debt.
7. **Where you stand:** savings against everything owed. In the black or in the red.

Then a tick list for payday, a Halifax check for any day of the month, and the full working.

## How the maths works

* Each pay keeps the rest of the current month covered and pays for every bill next month.
* Leave in Halifax = rest of this month + all of next month (+ an optional cushion).
* Free to share out = Halifax balance minus that. With no balance entered, it assumes last month kept back exactly enough.
* Bills on the 29th to 31st fall on the last day of shorter months. Weekend paydays move to the Friday before.
* All sums are done in whole pence. "Show the working" confirms every pound is accounted for.

## Your figures and privacy

* This app holds **no figures**. Anyone opening the link sees an empty planner.
* Your figures save to a **private** GitHub repository you create (`finance-data`), using a key that only opens that one repository. Each device needs the key once.
* Every save is kept as a version in that repository, so you can see what changed and when.
* The page only talks to GitHub (a security rule in the page blocks everything else) and asks search engines not to list it.
* To cut off a device, delete the key on GitHub and make a new one.

## Checking the maths

`tests/engine.test.js` runs 26 checks against the calculation code taken straight from `finance-manager.html`, including a two-year simulation proving Halifax never runs short and arrives at each payday holding exactly the rest of that month.

```
node tests/engine.test.js
```

GitHub runs these checks on every change.

## Files

* `finance-manager.html`: the whole app in one file
* `index.html`: sends the site's home page to the app
* `tests/engine.test.js`: maths checks
