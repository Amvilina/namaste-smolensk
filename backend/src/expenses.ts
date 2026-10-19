import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const CATEGORIES = ["products", "tech", "wage", "rent", "other"] as const;

export type Category = (typeof CATEGORIES)[number];

const NAMES: Record<Exclude<Category, "other">, string> = {
  products: "Продукты",
  tech: "Техническое",
  wage: "Зарплата",
  rent: "Аренда",
};

export type ExpenseLine = {
  name: string;
  amount: number;
};

export type Expense = {
  id: string;
  day: string;
  category: Category;
  label: string;
  title: string;
  lines: ExpenseLine[];
  createdAt: string;
  updatedAt: string;
};

export type ExpenseStore = {
  list(): Promise<Expense[]>;
  add(expense: Expense): Promise<void>;
  replace(id: string, expense: Expense): Promise<boolean>;
  remove(id: string): Promise<boolean>;
};

export function parseCategory(value: unknown): Category | null {
  if (typeof value !== "string") return null;
  return CATEGORIES.find((item) => item === value) ?? null;
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

export function parseExpenseBody(body: {
  category?: unknown;
  label?: unknown;
  title?: unknown;
  lines?: unknown;
} | null): Pick<Expense, "category" | "label" | "title" | "lines"> | null {
  if (!body) return null;
  const category = parseCategory(body.category);
  const title = parseName(body.title);
  if (!category || !title || !Array.isArray(body.lines) || body.lines.length === 0 || body.lines.length > 40) return null;
  const label = category === "other" ? parseName(body.label) : NAMES[category];
  if (!label) return null;
  const lines: ExpenseLine[] = [];
  for (const raw of body.lines) {
    if (!raw || typeof raw !== "object") return null;
    const row = raw as { name?: unknown; amount?: unknown };
    const name = parseName(row.name);
    const amount = parseMoney(row.amount);
    if (!name || amount === null) return null;
    lines.push({ name, amount });
  }
  return { category, label, title, lines };
}

function settleExpense(item: {
  id?: string;
  day?: string;
  category?: unknown;
  label?: unknown;
  title?: unknown;
  lines?: unknown;
  createdAt?: string;
  updatedAt?: string;
}): Expense | null {
  if (!item.id || !item.day) return null;
  const parsed = parseExpenseBody(item);
  if (parsed) {
    return {
      id: item.id,
      day: item.day,
      ...parsed,
      createdAt: item.createdAt ?? "",
      updatedAt: item.updatedAt ?? "",
    };
  }
  if (!Array.isArray(item.lines) || item.lines.length === 0) return null;
  const rows = item.lines as { category?: unknown; name?: unknown; amount?: unknown }[];
  const category = parseCategory(rows[0]?.category) ?? "products";
  const label = category === "other" ? parseName(rows[0]?.name) ?? "Другое" : NAMES[category];
  const lines: ExpenseLine[] = [];
  for (const row of rows) {
    const name = parseName(row.name);
    const amount = parseMoney(row.amount);
    if (!name || amount === null) continue;
    lines.push({ name, amount });
  }
  if (lines.length === 0) return null;
  return {
    id: item.id,
    day: item.day,
    category,
    label,
    title: label,
    lines,
    createdAt: item.createdAt ?? "",
    updatedAt: item.updatedAt ?? "",
  };
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

export function fileExpenses(dir: string): ExpenseStore {
  const file = join(dir, "expenses.json");
  let chain = Promise.resolve();
  const run = <T>(job: () => Promise<T>): Promise<T> => {
    const next = chain.then(job, job);
    chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
  const read = async (): Promise<Expense[]> => {
    try {
      const parsed = JSON.parse(await readFile(file, "utf8")) as unknown;
      if (!Array.isArray(parsed)) return [];
      return (parsed as Expense[]).flatMap((item) => {
        const expense = settleExpense(item);
        return expense ? [expense] : [];
      });
    } catch {
      return [];
    }
  };
  const write = async (items: Expense[]) => {
    await mkdir(dir, { recursive: true });
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify(items));
    await rename(tmp, file);
  };
  return {
    list: () => run(read),
    add: (expense) =>
      run(async () => {
        const items = await read();
        items.push(expense);
        await write(items);
      }),
    replace: (id, expense) =>
      run(async () => {
        const items = await read();
        const index = items.findIndex((item) => item.id === id);
        if (index < 0) return false;
        items[index] = expense;
        await write(items);
        return true;
      }),
    remove: (id) =>
      run(async () => {
        const items = await read();
        const index = items.findIndex((item) => item.id === id);
        if (index < 0) return false;
        items.splice(index, 1);
        await write(items);
        return true;
      }),
  };
}

export function newExpense(day: string, body: Pick<Expense, "category" | "label" | "title" | "lines">, now: number): Expense {
  const stamp = new Date(now).toISOString();
  return { id: randomUUID(), day, ...body, createdAt: stamp, updatedAt: stamp };
}
