import { randomUUID } from "node:crypto";

export const KINDS = ["dish", "product"] as const;

export type WriteoffKind = (typeof KINDS)[number];

export type Writeoff = {
  id: string;
  day: string;
  kind: WriteoffKind;
  name: string;
  volume: string;
  createdAt: string;
  updatedAt: string;
};

export type WriteoffStore = {
  list(): Promise<Writeoff[]>;
  add(item: Writeoff): Promise<void>;
  replace(id: string, item: Writeoff): Promise<boolean>;
  remove(id: string): Promise<boolean>;
};

export function parseKind(value: unknown): WriteoffKind | null {
  if (value === "dish" || value === "product") return value;
  return null;
}

function parseText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length < 1 || text.length > 80) return null;
  return text;
}

export function parseWriteoffBody(body: { kind?: unknown; name?: unknown; volume?: unknown } | null): Pick<Writeoff, "kind" | "name" | "volume"> | null {
  if (!body) return null;
  const kind = parseKind(body.kind);
  const name = parseText(body.name);
  const volume = parseText(body.volume);
  if (!kind || !name || !volume) return null;
  return { kind, name, volume };
}

export function memoryWriteoffs(): WriteoffStore {
  const items: Writeoff[] = [];
  return {
    async list() {
      return items.map((item) => structuredClone(item));
    },
    async add(item) {
      items.push(structuredClone(item));
    },
    async replace(id, item) {
      const index = items.findIndex((row) => row.id === id);
      if (index < 0) return false;
      items[index] = structuredClone(item);
      return true;
    },
    async remove(id) {
      const index = items.findIndex((row) => row.id === id);
      if (index < 0) return false;
      items.splice(index, 1);
      return true;
    },
  };
}

export function newWriteoff(day: string, body: Pick<Writeoff, "kind" | "name" | "volume">, now: number): Writeoff {
  const stamp = new Date(now).toISOString();
  return { id: randomUUID(), day, ...body, createdAt: stamp, updatedAt: stamp };
}
