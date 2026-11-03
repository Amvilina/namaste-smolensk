import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { legacyExpenseRows, listExpenses, openExpenses, replaceExpenses, type StoredExpense } from "./expenses-db.ts";

const source = process.argv[2];
const dest = process.argv[3];
if (!source || !dest) {
  console.error("usage: import-expenses.ts <expenses.json> <namaste.sqlite>");
  process.exit(1);
}

const sum = (rows: StoredExpense[]) => rows.reduce((total, row) => total + row.amount, 0);
const items = JSON.parse(readFileSync(source, "utf8")) as unknown;
const rows = legacyExpenseRows(items);
mkdirSync(dirname(dest), { recursive: true });
const db = openExpenses(dest);
replaceExpenses(db, rows);
const stored = listExpenses(db);
db.close();

const investment = stored.filter((row) => row.kind === "investment");
const monthly = stored.filter((row) => row.month);
console.log(`${dest}: ${stored.length} строк, ${sum(stored)} ₽`);
console.log(`затраты ${stored.length - investment.length} / ${sum(stored) - sum(investment)} ₽`);
console.log(`инвестиции ${investment.length} / ${sum(investment)} ₽`);
for (const row of investment) console.log(`  ${row.day ?? row.month}  ${row.amount}  ${row.name}`);
console.log(`по месяцу ${monthly.length}`);
for (const row of monthly) console.log(`  ${row.month}  ${row.amount}  ${row.name}`);
