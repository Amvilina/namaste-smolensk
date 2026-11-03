import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { legacyExpenseRows, listExpenses, openExpenses, replaceExpenses } from "../src/expenses-db.ts";

const legacy = JSON.parse(readFileSync(new URL("../../expenses.json", import.meta.url), "utf8")) as unknown;

test("старые расходы раскладываются на затраты и инвестиции", () => {
  const rows = legacyExpenseRows(legacy);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const investment = rows.filter((row) => row.kind === "investment");
  const investmentSum = investment.reduce((sum, row) => sum + row.amount, 0);
  assert.equal(rows.length, 303);
  assert.equal(total, 237560);
  assert.equal(investment.length, 47);
  assert.equal(investmentSum, 62179);
  assert.ok(rows.every((row) => (row.day === null) !== (row.month === null)));
  assert.equal("label" in rows[0]!, false);
  assert.equal("title" in rows[0]!, false);

  const rent = rows.filter((row) => row.month === "2026-10" && row.name.toLowerCase().includes("аренд"));
  assert.deepEqual(
    rent.map((row) => row.amount).sort((a, b) => a - b),
    [20000, 21000],
  );
  assert.ok(rent.every((row) => row.day === null && row.kind === "cost"));

  const link = rows.find((row) => row.name === "Связь");
  assert.equal(link?.month, "2026-10");
  assert.equal(link?.day, null);
  assert.equal(link?.kind, "cost");

  const acquiring = rows.find((row) => row.name === "Эквайринг");
  assert.equal(acquiring?.kind, "cost");
  assert.equal(acquiring?.day, "2026-10-24");
  assert.equal(acquiring?.month, null);

  assert.equal(rows.find((row) => row.name === "Стол разделочный")?.kind, "investment");
  assert.equal(rows.find((row) => row.name === "Стакан бумажный 400 мл, 50 шт")?.kind, "cost");
  assert.equal(rows.find((row) => row.name === "Баннер")?.kind, "investment");
  assert.equal(rows.find((row) => row.name === "Наклейки 3")?.kind, "cost");
  assert.equal(rows.find((row) => row.name === "Курица 7.5")?.kind, "cost");
  assert.equal(rows.find((row) => row.day === "2026-11-01" && row.name === "Сергей")?.kind, "cost");
});

test("строки записываются в sqlite и читаются обратно", () => {
  const dir = mkdtempSync(join(tmpdir(), "namaste-expenses-"));
  try {
    const db = openExpenses(join(dir, "namaste.sqlite"));
    const rows = legacyExpenseRows(legacy);
    replaceExpenses(db, rows);
    const stored = listExpenses(db);
    db.close();
    assert.equal(stored.length, rows.length);
    assert.equal(
      stored.reduce((sum, row) => sum + row.amount, 0),
      rows.reduce((sum, row) => sum + row.amount, 0),
    );
    assert.equal(stored.filter((row) => row.month).length, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
