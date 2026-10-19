import { readFileSync } from "node:fs";

export type CatalogExtra = {
  id: string;
  name: string;
  price: number;
};

export type CatalogDish = {
  id: string;
  name: string;
  amount: string;
  image: string;
  price: number | null;
  extras: CatalogExtra[];
};

type MenuSection = {
  dishes?: {
    id?: string;
    name?: string;
    amount?: string;
    image?: string;
    price?: number;
    extras?: { id?: string; name?: string; price?: number }[];
  }[];
};

export function catalogFromMenu(raw: unknown): CatalogDish[] {
  if (!Array.isArray(raw)) return [];
  const dishes: CatalogDish[] = [];
  for (const section of raw as MenuSection[]) {
    for (const dish of section.dishes ?? []) {
      if (!dish.id || !dish.name) continue;
      const extras: CatalogExtra[] = [];
      for (const extra of dish.extras ?? []) {
        if (!extra.id || !extra.name || typeof extra.price !== "number") continue;
        extras.push({ id: extra.id, name: extra.name, price: extra.price });
      }
      dishes.push({
        id: dish.id,
        name: dish.name,
        amount: dish.amount ?? "",
        image: dish.image ?? "",
        price: typeof dish.price === "number" ? dish.price : null,
        extras,
      });
    }
  }
  return dishes;
}

export function loadCatalog(file = process.env.MENU_PATH): CatalogDish[] {
  const path = file ?? new URL("../../src/menu.json", import.meta.url);
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return catalogFromMenu(raw);
}
