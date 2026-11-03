import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { legacyExpenseRows, legacySales, legacyWriteoffs, listExpenses, listSales, listWriteoffs, openExpenses, replaceExpenses, replaceSales, replaceWriteoffs } from "../src/expenses-db.ts";
import { ledgerStores } from "../src/ledger.ts";

const read = (name: string) => JSON.parse(readFileSync(new URL(`../../${name}`, import.meta.url), "utf8")) as unknown;

test("продажи и списания переносятся в sqlite без потерь", () => {
  const sales = legacySales(read("sales.json"));
  const writeoffs = legacyWriteoffs(read("writeoffs.json"));
  const revenue = sales.reduce((sum, sale) => sum + sale.lines.reduce((lineSum, line) => lineSum + line.price * line.qty, 0), 0);
  const lineCount = sales.reduce((sum, sale) => sum + sale.lines.length, 0);
  const extraCount = sales.reduce((sum, sale) => sum + sale.lines.reduce((lineSum, line) => lineSum + line.extras.length, 0), 0);
  assert.equal(sales.length, 286);
  assert.equal(lineCount, 318);
  assert.equal(extraCount, 54);
  assert.equal(revenue, 99328);
  assert.equal(sales.filter((sale) => sale.pay === "cash").length, 224);
  assert.equal(sales.filter((sale) => sale.pay === "card").length, 62);
  assert.equal(writeoffs.length, 23);
  assert.equal(writeoffs.filter((item) => item.kind === "dish").length, 16);
  assert.equal(writeoffs.filter((item) => item.kind === "product").length, 7);

  const dir = mkdtempSync(join(tmpdir(), "namaste-sales-"));
  try {
    const db = openExpenses(join(dir, "namaste.sqlite"));
    replaceExpenses(db, legacyExpenseRows(read("expenses.json")));
    replaceSales(db, sales);
    replaceWriteoffs(db, writeoffs);
    const storedSales = new Map(listSales(db).map((sale) => [sale.id, sale]));
    const storedWriteoffs = new Map(listWriteoffs(db).map((item) => [item.id, item]));
    for (const sale of sales) assert.deepEqual(storedSales.get(sale.id), sale);
    for (const item of writeoffs) assert.deepEqual(storedWriteoffs.get(item.id), item);
    assert.equal(listExpenses(db).length, 303);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("хранилище дописывает продажу, затрату и списание", async () => {
  const dir = mkdtempSync(join(tmpdir(), "namaste-ledger-"));
  try {
    const stores = ledgerStores(join(dir, "namaste.sqlite"));
    await stores.expenses.add({
      id: "11111111-1111-4111-8111-111111111111",
      kind: "cost",
      name: "Мука",
      amount: 200,
      day: null,
      month: "2026-10",
      createdAt: "2026-10-19T10:00:00.000Z",
      updatedAt: "2026-10-19T10:00:00.000Z",
    });
    assert.equal((await stores.expenses.list())[0]?.month, "2026-10");
    await stores.sales.add({
      id: "22222222-2222-4222-8222-222222222222",
      day: "2026-10-19",
      pay: "cash",
      lines: [{ dishId: "kystyby", name: "Кыстыбый", price: 290, qty: 1, extras: [{ id: "beef", name: "Говядина", price: 40 }] }],
      createdAt: "2026-10-19T10:00:00.000Z",
      updatedAt: "2026-10-19T10:00:00.000Z",
    });
    const sale = (await stores.sales.list())[0];
    assert.equal(sale?.lines[0]?.extras[0]?.name, "Говядина");
    assert.equal(await stores.sales.remove(sale?.id ?? ""), true);
    assert.equal((await stores.sales.list()).length, 0);
    await stores.writeoffs.add({
      id: "33333333-3333-4333-8333-333333333333",
      day: "2026-10-19",
      kind: "dish",
      name: "Чай",
      volume: "1 шт",
      createdAt: "2026-10-19T10:00:00.000Z",
      updatedAt: "2026-10-19T10:00:00.000Z",
    });
    assert.equal((await stores.writeoffs.list())[0]?.volume, "1 шт");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
