import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { Sale, SaleExtra, SaleLine } from "./sales.ts";
import type { Writeoff } from "./writeoffs.ts";

export type ExpenseKind = "investment" | "cost";

export type StoredExpense = {
  id: string;
  kind: ExpenseKind;
  name: string;
  amount: number;
  day: string | null;
  month: string | null;
  createdAt: string;
  updatedAt: string;
};

type LegacyLine = { name: string; amount: number };

type LegacyExpense = {
  id: string;
  day: string;
  lines: LegacyLine[];
  createdAt: string;
  updatedAt: string;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('investment', 'cost')),
  name TEXT NOT NULL CHECK (length(name) > 0),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  day TEXT,
  month TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((day IS NOT NULL AND month IS NULL) OR (day IS NULL AND month IS NOT NULL)),
  CHECK (day IS NULL OR day GLOB '????-??-??'),
  CHECK (month IS NULL OR month GLOB '????-??')
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL CHECK (day GLOB '????-??-??'),
  pay TEXT NOT NULL CHECK (pay IN ('cash', 'card')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sale_lines (
  id INTEGER PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  dish_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) > 0),
  price INTEGER NOT NULL CHECK (price >= 0),
  qty INTEGER NOT NULL CHECK (qty >= 1),
  UNIQUE (sale_id, position)
);

CREATE TABLE IF NOT EXISTS sale_extras (
  line_id INTEGER NOT NULL REFERENCES sale_lines(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  extra_id TEXT NOT NULL CHECK (length(extra_id) > 0),
  name TEXT NOT NULL CHECK (length(name) > 0),
  price INTEGER NOT NULL CHECK (price >= 0),
  PRIMARY KEY (line_id, position)
);

CREATE TABLE IF NOT EXISTS writeoffs (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL CHECK (day GLOB '????-??-??'),
  kind TEXT NOT NULL CHECK (kind IN ('dish', 'product')),
  name TEXT NOT NULL CHECK (length(name) > 0),
  volume TEXT NOT NULL CHECK (length(volume) > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

// Чеки, которые целиком остаются в точке: стройка, электрика, мебель, инструмент.
const INVESTMENT_RECEIPTS = new Set([
  "ee030853-0dec-4d29-b412-480c4562dfaa",
  "b578fdb1-d640-49a2-8b87-9a00592dfec0",
  "22725b1a-0200-4536-bf6a-bf95159aceaa",
  "d970bb86-1222-4b06-b450-c6e55f0a9d88",
  "5e0956e3-7e47-494b-bdb9-3fc939463917",
  "6867a6ca-a8cd-4992-a4dc-5050cbfb311e",
  "4f0590d9-8b8c-4280-b46a-a2ae23e50098",
  "2bdeaed1-5760-403a-87c7-8784db40c746",
]);

// Строки из смешанных чеков: посуда и инструмент многоразового пользования, вывеска.
const INVESTMENT_LINES = new Set([
  "Кисточка кулинарная",
  "Нож для шинковки овощей",
  "Набор контейнеров, 5 шт",
  "Сито 18 см",
  "Ёмкость для соуса 0,7 л, 3 шт",
  "Бутылка для соуса 0,7 л",
  "Крышка гастроёмкости 1/6, 3 шт",
  "Гастроёмкость 1/6, 3 шт",
  "Шинковка",
  "Лопатка кухонная",
  "Контейнер для мусора 14 л",
  "Веер для мангала",
  "Щетка проволочная",
  "Набор для уборки",
  "Щетка для пола",
  "Набор металлический",
  "Ведро 12 л",
  "Ведро строительное 12 л",
  "Баннер",
]);

// Аренда и связь не привязаны к дню покупки. null — оставить имя строки.
const MONTHLY_NAME: Record<string, string | null> = {
  "5f3113cf-1a20-45e8-ab3c-51b96eb5e864": null,
  "ec2a50a1-04e7-453a-9306-156f9d16ca7a": "Аренда, вторая половина",
  "04f9363e-1b4c-4cc5-a9ba-f26e5a097249": null,
};

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`expenses.json: ${label}`);
  return value;
}

function legacyList(value: unknown): LegacyExpense[] {
  if (!Array.isArray(value)) throw new Error("expenses.json: ожидался массив");
  return value.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`expenses.json: запись ${index} битая`);
    const row = item as Record<string, unknown>;
    const id = text(row.id, `запись ${index} без id`);
    const day = text(row.day, `запись ${id} без дня`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`expenses.json: день ${day}`);
    if (!Array.isArray(row.lines) || row.lines.length === 0) throw new Error(`expenses.json: запись ${id} без строк`);
    const lines = row.lines.map((line, lineIndex) => {
      if (!line || typeof line !== "object") throw new Error(`expenses.json: строка ${id}/${lineIndex}`);
      const raw = line as Record<string, unknown>;
      const name = text(raw.name, `пустое имя ${id}/${lineIndex}`);
      const amount = raw.amount;
      if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0) {
        throw new Error(`expenses.json: сумма ${id}/${name}`);
      }
      return { name, amount };
    });
    return {
      id,
      day,
      lines,
      createdAt: text(row.createdAt, `запись ${id} без createdAt`),
      updatedAt: text(row.updatedAt, `запись ${id} без updatedAt`),
    };
  });
}

export function legacyExpenseRows(value: unknown): StoredExpense[] {
  const rows: StoredExpense[] = [];
  for (const expense of legacyList(value)) {
    const monthly = Object.prototype.hasOwnProperty.call(MONTHLY_NAME, expense.id);
    for (const line of expense.lines) {
      const renamed = monthly ? MONTHLY_NAME[expense.id] : null;
      rows.push({
        id: randomUUID(),
        kind: INVESTMENT_RECEIPTS.has(expense.id) || INVESTMENT_LINES.has(line.name) ? "investment" : "cost",
        name: renamed ?? line.name,
        amount: line.amount,
        day: monthly ? null : expense.day,
        month: monthly ? expense.day.slice(0, 7) : null,
        createdAt: expense.createdAt,
        updatedAt: expense.updatedAt,
      });
    }
  }
  return rows;
}

export function openExpenses(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}

export function replaceExpenses(db: DatabaseSync, rows: StoredExpense[]): void {
  const insert = db.prepare(
    "INSERT INTO expenses (id, kind, name, amount, day, month, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM expenses");
    for (const row of rows) {
      insert.run(row.id, row.kind, row.name, row.amount, row.day, row.month, row.createdAt, row.updatedAt);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function listExpenses(db: DatabaseSync): StoredExpense[] {
  const rows = db
    .prepare(
      "SELECT id, kind, name, amount, day, month, created_at, updated_at FROM expenses ORDER BY COALESCE(day, month), created_at, id",
    )
    .all() as {
    id: string;
    kind: ExpenseKind;
    name: string;
    amount: number;
    day: string | null;
    month: string | null;
    created_at: string;
    updated_at: string;
  }[];
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    name: row.name,
    amount: row.amount,
    day: row.day,
    month: row.month,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(label);
  return value;
}

function money(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new Error(label);
  return value;
}

function dayText(value: unknown, label: string): string {
  const day = requiredText(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(label);
  return day;
}

export function legacySales(value: unknown): Sale[] {
  if (!Array.isArray(value)) throw new Error("sales.json: ожидался массив");
  return value.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`sales.json: запись ${index} битая`);
    const row = item as Record<string, unknown>;
    const id = requiredText(row.id, `sales.json: запись ${index} без id`);
    const pay = row.pay;
    if (pay !== "cash" && pay !== "card") throw new Error(`sales.json: оплата ${id}`);
    if (!Array.isArray(row.lines) || row.lines.length === 0) throw new Error(`sales.json: запись ${id} без строк`);
    const lines: SaleLine[] = row.lines.map((line, lineIndex) => {
      if (!line || typeof line !== "object") throw new Error(`sales.json: строка ${id}/${lineIndex}`);
      const raw = line as Record<string, unknown>;
      if (typeof raw.dishId !== "string") throw new Error(`sales.json: блюдо ${id}/${lineIndex}`);
      const qty = raw.qty;
      if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1) throw new Error(`sales.json: количество ${id}/${lineIndex}`);
      const extrasRaw = raw.extras;
      if (!Array.isArray(extrasRaw)) throw new Error(`sales.json: добавки ${id}/${lineIndex}`);
      const extras: SaleExtra[] = extrasRaw.map((extra, extraIndex) => {
        if (!extra || typeof extra !== "object") throw new Error(`sales.json: добавка ${id}/${lineIndex}/${extraIndex}`);
        const snap = extra as Record<string, unknown>;
        return {
          id: requiredText(snap.id, `sales.json: добавка ${id}/${lineIndex}/${extraIndex}`),
          name: requiredText(snap.name, `sales.json: добавка ${id}/${lineIndex}/${extraIndex}`),
          price: money(snap.price, `sales.json: цена добавки ${id}/${lineIndex}/${extraIndex}`),
        };
      });
      return {
        dishId: raw.dishId,
        name: requiredText(raw.name, `sales.json: имя ${id}/${lineIndex}`),
        price: money(raw.price, `sales.json: цена ${id}/${lineIndex}`),
        qty,
        extras,
      };
    });
    return {
      id,
      day: dayText(row.day, `sales.json: день ${id}`),
      pay,
      lines,
      createdAt: requiredText(row.createdAt, `sales.json: запись ${id} без createdAt`),
      updatedAt: requiredText(row.updatedAt, `sales.json: запись ${id} без updatedAt`),
    };
  });
}

export function writeSale(db: DatabaseSync, sale: Sale): void {
  db.prepare("INSERT INTO sales (id, day, pay, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(
    sale.id,
    sale.day,
    sale.pay,
    sale.createdAt,
    sale.updatedAt,
  );
  const insertLine = db.prepare(
    "INSERT INTO sale_lines (sale_id, position, dish_id, name, price, qty) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const insertExtra = db.prepare(
    "INSERT INTO sale_extras (line_id, position, extra_id, name, price) VALUES (?, ?, ?, ?, ?)",
  );
  sale.lines.forEach((line, position) => {
    const inserted = insertLine.run(sale.id, position, line.dishId, line.name, line.price, line.qty);
    line.extras.forEach((extra, extraPos) => {
      insertExtra.run(Number(inserted.lastInsertRowid), extraPos, extra.id, extra.name, extra.price);
    });
  });
}

export function removeSale(db: DatabaseSync, id: string): boolean {
  const lines = db.prepare("SELECT id FROM sale_lines WHERE sale_id = ?").all(id) as { id: number }[];
  const dropExtra = db.prepare("DELETE FROM sale_extras WHERE line_id = ?");
  for (const line of lines) dropExtra.run(line.id);
  db.prepare("DELETE FROM sale_lines WHERE sale_id = ?").run(id);
  const removed = db.prepare("DELETE FROM sales WHERE id = ?").run(id);
  return Number(removed.changes) > 0;
}

export function replaceSales(db: DatabaseSync, sales: Sale[]): void {
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM sale_extras");
    db.exec("DELETE FROM sale_lines");
    db.exec("DELETE FROM sales");
    for (const sale of sales) writeSale(db, sale);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function listSales(db: DatabaseSync): Sale[] {
  const sales = db.prepare("SELECT id, day, pay, created_at, updated_at FROM sales ORDER BY day, created_at, id").all() as {
    id: string;
    day: string;
    pay: "cash" | "card";
    created_at: string;
    updated_at: string;
  }[];
  const lines = db
    .prepare("SELECT id, sale_id, position, dish_id, name, price, qty FROM sale_lines ORDER BY sale_id, position")
    .all() as {
    id: number;
    sale_id: string;
    position: number;
    dish_id: string;
    name: string;
    price: number;
    qty: number;
  }[];
  const extras = db
    .prepare("SELECT line_id, position, extra_id, name, price FROM sale_extras ORDER BY line_id, position")
    .all() as { line_id: number; position: number; extra_id: string; name: string; price: number }[];
  const extrasByLine = new Map<number, SaleExtra[]>();
  for (const extra of extras) {
    const list = extrasByLine.get(extra.line_id) ?? [];
    list.push({ id: extra.extra_id, name: extra.name, price: extra.price });
    extrasByLine.set(extra.line_id, list);
  }
  const linesBySale = new Map<string, SaleLine[]>();
  for (const line of lines) {
    const list = linesBySale.get(line.sale_id) ?? [];
    list.push({
      dishId: line.dish_id,
      name: line.name,
      price: line.price,
      qty: line.qty,
      extras: extrasByLine.get(line.id) ?? [],
    });
    linesBySale.set(line.sale_id, list);
  }
  return sales.map((sale) => ({
    id: sale.id,
    day: sale.day,
    pay: sale.pay,
    lines: linesBySale.get(sale.id) ?? [],
    createdAt: sale.created_at,
    updatedAt: sale.updated_at,
  }));
}

export function legacyWriteoffs(value: unknown): Writeoff[] {
  if (!Array.isArray(value)) throw new Error("writeoffs.json: ожидался массив");
  return value.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`writeoffs.json: запись ${index} битая`);
    const row = item as Record<string, unknown>;
    const id = requiredText(row.id, `writeoffs.json: запись ${index} без id`);
    const kind = row.kind;
    if (kind !== "dish" && kind !== "product") throw new Error(`writeoffs.json: вид ${id}`);
    return {
      id,
      day: dayText(row.day, `writeoffs.json: день ${id}`),
      kind,
      name: requiredText(row.name, `writeoffs.json: имя ${id}`),
      volume: requiredText(row.volume, `writeoffs.json: объём ${id}`),
      createdAt: requiredText(row.createdAt, `writeoffs.json: запись ${id} без createdAt`),
      updatedAt: requiredText(row.updatedAt, `writeoffs.json: запись ${id} без updatedAt`),
    };
  });
}

export function replaceWriteoffs(db: DatabaseSync, items: Writeoff[]): void {
  const insert = db.prepare(
    "INSERT INTO writeoffs (id, day, kind, name, volume, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM writeoffs");
    for (const item of items) {
      insert.run(item.id, item.day, item.kind, item.name, item.volume, item.createdAt, item.updatedAt);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function listWriteoffs(db: DatabaseSync): Writeoff[] {
  const rows = db
    .prepare("SELECT id, day, kind, name, volume, created_at, updated_at FROM writeoffs ORDER BY day, created_at, id")
    .all() as {
    id: string;
    day: string;
    kind: "dish" | "product";
    name: string;
    volume: string;
    created_at: string;
    updated_at: string;
  }[];
  return rows.map((row) => ({
    id: row.id,
    day: row.day,
    kind: row.kind,
    name: row.name,
    volume: row.volume,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
