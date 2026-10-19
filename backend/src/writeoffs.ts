import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

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

function settle(item: {
  id?: string;
  day?: string;
  kind?: unknown;
  name?: unknown;
  volume?: unknown;
  lines?: unknown;
  createdAt?: string;
  updatedAt?: string;
}): Writeoff | null {
  if (!item.id || !item.day) return null;
  const direct = parseWriteoffBody(item);
  const parsed =
    direct ??
    (() => {
      const kind = parseKind(item.kind);
      const first = Array.isArray(item.lines) ? (item.lines[0] as { name?: unknown; qty?: unknown } | undefined) : undefined;
      const name = parseText(first?.name);
      const volume = typeof first?.qty === "number" ? String(first.qty) : null;
      if (!kind || !name || !volume) return null;
      return { kind, name, volume };
    })();
  if (!parsed) return null;
  return {
    id: item.id,
    day: item.day,
    ...parsed,
    createdAt: item.createdAt ?? "",
    updatedAt: item.updatedAt ?? "",
  };
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

export function fileWriteoffs(dir: string): WriteoffStore {
  const file = join(dir, "writeoffs.json");
  let chain = Promise.resolve();
  const run = <T>(job: () => Promise<T>): Promise<T> => {
    const next = chain.then(job, job);
    chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
  const read = async (): Promise<Writeoff[]> => {
    try {
      const parsed = JSON.parse(await readFile(file, "utf8")) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.flatMap((item) => {
        const row = settle(item as Writeoff);
        return row ? [row] : [];
      });
    } catch {
      return [];
    }
  };
  const write = async (items: Writeoff[]) => {
    await mkdir(dir, { recursive: true });
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify(items));
    await rename(tmp, file);
  };
  return {
    list: () => run(read),
    add: (item) =>
      run(async () => {
        const items = await read();
        items.push(item);
        await write(items);
      }),
    replace: (id, item) =>
      run(async () => {
        const items = await read();
        const index = items.findIndex((row) => row.id === id);
        if (index < 0) return false;
        items[index] = item;
        await write(items);
        return true;
      }),
    remove: (id) =>
      run(async () => {
        const items = await read();
        const index = items.findIndex((row) => row.id === id);
        if (index < 0) return false;
        items.splice(index, 1);
        await write(items);
        return true;
      }),
  };
}

export function newWriteoff(day: string, body: Pick<Writeoff, "kind" | "name" | "volume">, now: number): Writeoff {
  const stamp = new Date(now).toISOString();
  return { id: randomUUID(), day, ...body, createdAt: stamp, updatedAt: stamp };
}
