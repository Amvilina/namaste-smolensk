import { randomUUID } from "node:crypto";

export type ExpenseKind = "investment" | "cost";

export type Expense = {
  id: string;
  kind: ExpenseKind;
  name: string;
  amount: number;
  day: string | null;
  month: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseStore = {
  list(): Promise<Expense[]>;
  add(expense: Expense): Promise<void>;
  replace(id: string, expense: Expense): Promise<boolean>;
  remove(id: string): Promise<boolean>;
};

export function parseKind(value: unknown): ExpenseKind | null {
  if (value === "investment" || value === "cost") return value;
  return null;
}

export function parseMoney(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 10_000_000) return null;
  return value;
}

export function parseName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length < 1 || text.length > 80) return null;
  return text;
}

export function parseExpenseBody(body: { kind?: unknown; name?: unknown; amount?: unknown } | null): Pick<Expense, "kind" | "name" | "amount"> | null {
  if (!body) return null;
  const kind = parseKind(body.kind);
  const name = parseName(body.name);
  const amount = parseMoney(body.amount);
  if (!kind || !name || amount === null) return null;
  return { kind, name, amount };
}

export function expensePeriod(monthly: boolean, day: string): { day: string | null; month: string | null } {
  if (monthly) return { day: null, month: day.slice(0, 7) };
  return { day, month: null };
}

export function memoryExpenses(): ExpenseStore {
  const items: Expense[] = [];
  return {
    async list() {
      return items.map((item) => structuredClone(item));
    },
    async add(expense) {
      items.push(structuredClone(expense));
    },
    async replace(id, expense) {
      const index = items.findIndex((item) => item.id === id);
      if (index < 0) return false;
      items[index] = structuredClone(expense);
      return true;
    },
    async remove(id) {
      const index = items.findIndex((item) => item.id === id);
      if (index < 0) return false;
      items.splice(index, 1);
      return true;
    },
  };
}

export function newExpense(
  period: { day: string | null; month: string | null },
  body: Pick<Expense, "kind" | "name" | "amount">,
  now: number,
): Expense {
  const stamp = new Date(now).toISOString();
  return { id: randomUUID(), ...period, ...body, createdAt: stamp, updatedAt: stamp };
}
