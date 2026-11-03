import { readFileSync } from "node:fs";
import { legacySales, legacyWriteoffs, listExpenses, listSales, listWriteoffs, openExpenses, replaceSales, replaceWriteoffs } from "./expenses-db.ts";

const salesPath = process.argv[2];
const writeoffsPath = process.argv[3];
const dest = process.argv[4];
if (!salesPath || !writeoffsPath || !dest) {
  console.error("usage: import-sales.ts <sales.json> <writeoffs.json> <namaste.sqlite>");
  process.exit(1);
}

const sales = legacySales(JSON.parse(readFileSync(salesPath, "utf8")) as unknown);
const writeoffs = legacyWriteoffs(JSON.parse(readFileSync(writeoffsPath, "utf8")) as unknown);
const db = openExpenses(dest);
const expensesBefore = listExpenses(db).length;
replaceSales(db, sales);
replaceWriteoffs(db, writeoffs);
const storedSales = listSales(db);
const storedWriteoffs = listWriteoffs(db);
const expensesAfter = listExpenses(db).length;
db.close();

const revenue = storedSales.reduce((sum, sale) => sum + sale.lines.reduce((lineSum, line) => lineSum + line.price * line.qty, 0), 0);
const lines = storedSales.reduce((sum, sale) => sum + sale.lines.length, 0);
const extras = storedSales.reduce((sum, sale) => sum + sale.lines.reduce((lineSum, line) => lineSum + line.extras.length, 0), 0);
console.log(`${dest}: продажи ${storedSales.length}, строк ${lines}, добавок ${extras}, ${revenue} ₽`);
console.log(`нал ${storedSales.filter((sale) => sale.pay === "cash").length}, безнал ${storedSales.filter((sale) => sale.pay === "card").length}`);
console.log(`списания ${storedWriteoffs.length}: блюда ${storedWriteoffs.filter((item) => item.kind === "dish").length}, продукты ${storedWriteoffs.filter((item) => item.kind === "product").length}`);
console.log(`расходы на месте: ${expensesBefore} → ${expensesAfter}`);
