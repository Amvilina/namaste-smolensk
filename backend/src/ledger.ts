import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { listExpenses, listSales, listWriteoffs, openExpenses, removeSale, writeSale } from "./expenses-db.ts";
import type { Expense, ExpenseStore } from "./expenses.ts";
import type { SalesStore } from "./sales.ts";
import type { Writeoff, WriteoffStore } from "./writeoffs.ts";

function transact(db: DatabaseSync, job: () => void): void {
  db.exec("BEGIN");
  try {
    job();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function expenseStore(db: DatabaseSync): ExpenseStore {
  const insert = db.prepare(
    "INSERT INTO expenses (id, kind, name, amount, day, month, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const update = db.prepare(
    "UPDATE expenses SET kind = ?, name = ?, amount = ?, day = ?, month = ?, updated_at = ? WHERE id = ?",
  );
  const remove = db.prepare("DELETE FROM expenses WHERE id = ?");
  const write = (expense: Expense) => {
    insert.run(expense.id, expense.kind, expense.name, expense.amount, expense.day, expense.month, expense.createdAt, expense.updatedAt);
  };
  return {
    async list() {
      return listExpenses(db);
    },
    async add(expense) {
      transact(db, () => write(expense));
    },
    async replace(id, expense) {
      const updated = update.run(expense.kind, expense.name, expense.amount, expense.day, expense.month, expense.updatedAt, id);
      return Number(updated.changes) > 0;
    },
    async remove(id) {
      const removed = remove.run(id);
      return Number(removed.changes) > 0;
    },
  };
}

function salesStore(db: DatabaseSync): SalesStore {
  return {
    async list() {
      return listSales(db);
    },
    async add(sale) {
      transact(db, () => writeSale(db, sale));
    },
    async replace(id, sale) {
      const found = db.prepare("SELECT 1 AS ok FROM sales WHERE id = ?").get(id);
      if (!found) return false;
      transact(db, () => {
        removeSale(db, id);
        writeSale(db, sale);
      });
      return true;
    },
    async remove(id) {
      let gone = false;
      transact(db, () => {
        gone = removeSale(db, id);
      });
      return gone;
    },
  };
}

function writeoffStore(db: DatabaseSync): WriteoffStore {
  const insert = db.prepare(
    "INSERT INTO writeoffs (id, day, kind, name, volume, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const update = db.prepare("UPDATE writeoffs SET day = ?, kind = ?, name = ?, volume = ?, updated_at = ? WHERE id = ?");
  const remove = db.prepare("DELETE FROM writeoffs WHERE id = ?");
  const write = (item: Writeoff) => {
    insert.run(item.id, item.day, item.kind, item.name, item.volume, item.createdAt, item.updatedAt);
  };
  return {
    async list() {
      return listWriteoffs(db);
    },
    async add(item) {
      transact(db, () => write(item));
    },
    async replace(id, item) {
      const updated = update.run(item.day, item.kind, item.name, item.volume, item.updatedAt, id);
      return Number(updated.changes) > 0;
    },
    async remove(id) {
      const removed = remove.run(id);
      return Number(removed.changes) > 0;
    },
  };
}

export function ledgerStores(path: string): { sales: SalesStore; expenses: ExpenseStore; writeoffs: WriteoffStore } {
  mkdirSync(dirname(path), { recursive: true });
  const db = openExpenses(path);
  return { sales: salesStore(db), expenses: expenseStore(db), writeoffs: writeoffStore(db) };
}
