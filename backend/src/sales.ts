import { randomUUID } from "node:crypto";
import type { CatalogDish } from "./catalog.ts";

export type SaleExtra = {
  id: string;
  name: string;
  price: number;
};

export type Pay = "cash" | "card";

export type SaleLine = {
  dishId: string;
  name: string;
  price: number;
  qty: number;
  extras: SaleExtra[];
};

export type Sale = {
  id: string;
  day: string;
  pay: Pay;
  lines: SaleLine[];
  createdAt: string;
  updatedAt: string;
};

export type SalesStore = {
  list(): Promise<Sale[]>;
  add(sale: Sale): Promise<void>;
  replace(id: string, sale: Sale): Promise<boolean>;
  remove(id: string): Promise<boolean>;
};

export function moscowDay(now: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}

export function parsePay(value: unknown, fallback: Pay): Pay | null {
  if (value === undefined) return fallback;
  if (value === "cash" || value === "card") return value;
  return null;
}

export function parseLines(input: unknown, catalog: CatalogDish[]): SaleLine[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > 40) return null;
  const lines: SaleLine[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return null;
    const row = raw as { dishId?: unknown; name?: unknown; price?: unknown; qty?: unknown; extras?: unknown };
    if (typeof row.qty !== "number" || !Number.isInteger(row.qty) || row.qty < 1 || row.qty > 99) return null;
    if (typeof row.price !== "number" || !Number.isInteger(row.price) || row.price < 0 || row.price > 100_000) {
      return null;
    }
    if (typeof row.dishId !== "string") {
      if (typeof row.name !== "string") return null;
      const name = row.name.trim().replace(/\s+/g, " ");
      if (name.length < 1 || name.length > 80) return null;
      if (row.extras !== undefined && (!Array.isArray(row.extras) || row.extras.length > 0)) return null;
      lines.push({ dishId: "", name, price: row.price, qty: row.qty, extras: [] });
      continue;
    }
    const dish = catalog.find((item) => item.id === row.dishId);
    if (!dish) return null;
    const picked = row.extras === undefined ? [] : row.extras;
    if (!Array.isArray(picked) || picked.length > 12) return null;
    const extras: SaleExtra[] = [];
    for (const item of picked) {
      if (typeof item === "string") {
        if (extras.some((extra) => extra.id === item)) return null;
        const extra = dish.extras.find((option) => option.id === item);
        if (!extra) return null;
        extras.push({ id: extra.id, name: extra.name, price: extra.price });
        continue;
      }
      if (!item || typeof item !== "object") return null;
      const snap = item as { id?: unknown; name?: unknown; price?: unknown };
      if (typeof snap.id !== "string" || snap.id.length < 1 || snap.id.length > 40) return null;
      if (typeof snap.name !== "string") return null;
      const name = snap.name.trim().replace(/\s+/g, " ");
      if (!name || name.length > 80 || extras.some((extra) => extra.id === snap.id)) return null;
      if (typeof snap.price !== "number" || !Number.isInteger(snap.price) || snap.price < 0 || snap.price > 100_000) return null;
      extras.push({ id: snap.id, name, price: snap.price });
    }
    lines.push({ dishId: dish.id, name: dish.name, price: row.price, qty: row.qty, extras });
  }
  return lines;
}

export function parseDay(value: unknown, today: string): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  if (value > today) return null;
  return value;
}

export function memorySales(): SalesStore {
  const items: Sale[] = [];
  return {
    async list() {
      return items.map((sale) => structuredClone(sale));
    },
    async add(sale) {
      items.push(structuredClone(sale));
    },
    async replace(id, sale) {
      const index = items.findIndex((item) => item.id === id);
      if (index < 0) return false;
      items[index] = structuredClone(sale);
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

export function newSale(day: string, lines: SaleLine[], now: number, pay: Pay): Sale {
  const stamp = new Date(now).toISOString();
  return { id: randomUUID(), day, pay, lines, createdAt: stamp, updatedAt: stamp };
}
