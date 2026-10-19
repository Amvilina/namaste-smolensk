type Extra = { id: string; name: string; price: number };

type Dish = {
  id: string;
  name: string;
  amount: string;
  image: string;
  price: number | null;
  extras: Extra[];
};

type Line = {
  key: string;
  dishId: string;
  name: string;
  amount: string;
  image: string;
  price: number | null;
  qty: number;
  extras: string[];
};

type Pay = "cash" | "card";

type Sale = {
  id: string;
  day: string;
  pay?: Pay;
  lines: { dishId: string; name: string; price: number; qty: number; extras?: Extra[] }[];
};

let lineSeq = 0;

function lineKey(): string {
  lineSeq += 1;
  return String(lineSeq);
}

const OWN_IMAGE = "/own.svg";

const mount = document.querySelector("#worker");
if (!(mount instanceof HTMLElement)) throw new Error("worker root missing");
const root: HTMLElement = mount;

const state: {
  today: string;
  day: string;
  catalog: Dish[];
  sales: Sale[];
  draft: Line[];
  editing: string | null;
  pay: Pay;
  query: string;
  priceFocus: string | null;
  error: string;
} = {
  today: "",
  day: "",
  catalog: [],
  sales: [],
  draft: [],
  editing: null,
  pay: "cash",
  query: "",
  priceFocus: null,
  error: "",
};

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    return "&#39;";
  });
}

function rub(value: number): string {
  return `${value.toLocaleString("ru-RU")}\u00a0₽`;
}

function dayLabel(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function shiftDay(iso: string, delta: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function lineSum(line: Line): number {
  return (line.price ?? 0) * line.qty;
}

function ready(): boolean {
  return state.draft.length > 0 && state.draft.every((line) => line.price !== null);
}

function ownQuery(): string {
  const query = state.query.trim().replace(/\s+/g, " ");
  if (!query || query.length > 80) return "";
  const exact = state.catalog.some((dish) => dish.name.toLocaleLowerCase("ru") === query.toLocaleLowerCase("ru"));
  return exact ? "" : query;
}

function matches(): Dish[] {
  const query = state.query.trim().toLocaleLowerCase("ru");
  if (!query) return [];
  return state.catalog
    .filter((dish) => dish.name.toLocaleLowerCase("ru").includes(query))
    .slice(0, 8);
}

function paint(): void {
  const search = root.querySelector<HTMLInputElement>(".find input");
  const caret = search && document.activeElement === search ? search.selectionStart : null;
  const total = state.draft.reduce((sum, line) => sum + lineSum(line), 0);
  const hits = matches();
  const own = ownQuery();

  root.innerHTML = `
    <header class="desk-bar">
      <h1>Продажи</h1>
      <form method="post" action="/logout"><button class="leave" type="submit">Выйти</button></form>
    </header>
    <main class="desk">
      <div class="desk-grid">
        <section>
          <p class="day-line">
            ${
              state.editing
                ? `<button class="shift" type="button" data-shift="-1" aria-label="День раньше">‹</button>`
                : ""
            }
            <time datetime="${esc(state.day)}">${esc(dayLabel(state.day))}</time>
            ${
              state.editing
                ? `<button class="shift" type="button" data-shift="1" aria-label="День позже" ${state.day >= state.today ? "disabled" : ""}>›</button>`
                : ""
            }
          </p>
          <label class="find">
            <input value="${esc(state.query)}" placeholder="Блюдо" autocomplete="off" spellcheck="false" enterkeyhint="search" />
          </label>
          <ul class="hits">
            ${hits
              .map(
                (dish) => `<li><button type="button" data-add="${esc(dish.id)}">
                  <img src="${esc(dish.image)}" alt="" width="128" height="128" />
                  <span><span class="hit-name">${esc(dish.name)}</span><br /><span class="hit-amount">${esc(dish.amount)}</span></span>
                  <span class="rub">${dish.price === null ? "—" : rub(dish.price)}</span>
                </button></li>`,
              )
              .join("")}
            ${
              own
                ? `<li><button type="button" data-own="${esc(own)}">
                  <img src="${OWN_IMAGE}" alt="" width="128" height="128" />
                  <span><span class="hit-name">${esc(own)}</span></span>
                  <span class="rub">${rub(0)}</span>
                </button></li>`
                : ""
            }
          </ul>
          <div class="slip">
            ${state.draft
              .map(
                (line) => `<article class="line${line.image ? "" : " is-plain"}">
                  ${line.image ? `<img src="${esc(line.image)}" alt="" width="128" height="128" />` : ""}
                  <div>
                    <div class="line-name">${esc(line.name)}</div>
                    ${line.amount ? `<div class="line-amount">${esc(line.amount)}</div>` : ""}
                  </div>
                  <div class="line-tools">
                    <span class="step">
                      <button type="button" data-qty="${esc(line.key)}" data-dir="-1" aria-label="Меньше">−</button>
                      <b>${line.qty}</b>
                      <button type="button" data-qty="${esc(line.key)}" data-dir="1" aria-label="Больше">+</button>
                    </span>
                    ${
                      state.priceFocus === line.key
                        ? `<input class="rub-edit" data-price="${esc(line.key)}" inputmode="numeric" value="${line.price ?? ""}" />`
                        : `<button class="rub" type="button" data-price-open="${esc(line.key)}">${line.price === null ? "—" : rub(line.price)}</button>`
                    }
                    ${state.editing ? `<button class="drop" type="button" data-drop-line="${esc(line.key)}" aria-label="Убрать">×</button>` : ""}
                  </div>
                  ${extraChips(line)}
                </article>`,
              )
              .join("")}
            ${
              state.draft.length
                ? `<p class="total">${rub(total)}</p>
              <div class="pay">
                <button type="button" class="add${state.pay === "cash" ? " is-on" : ""}" data-pay="cash">Нал</button>
                <button type="button" class="add${state.pay === "card" ? " is-on" : ""}" data-pay="card">Безнал</button>
              </div>`
                : ""
            }
            <div>
              ${
                state.editing && state.draft.length === 0
                  ? `<button class="record" type="button" data-drop>Удалить</button>`
                  : `<button class="record" type="button" data-save ${ready() ? "" : "disabled"}>${state.editing ? "Сохранить" : "Записать"}</button>`
              }
              ${state.editing ? `<button class="ghost" type="button" data-cancel>Отмена</button>` : ""}
            </div>
            ${state.error ? `<p class="miss">${esc(state.error)}</p>` : ""}
          </div>
        </section>
        <section class="history">
          <ul class="past">
            ${groups()
              .map(
                (group) => `<li>
                  <h2>${esc(dayLabel(group.day))}</h2>
                  ${group.sales
                    .map(
                      (sale) => `<article>
                        <div>${sale.lines.map((line) => `${esc(line.name)}${line.extras?.length ? ` (${line.extras.map((extra) => esc(extra.name)).join(", ")})` : ""} × ${line.qty}`).join(", ")}</div>
                        <span class="rub">${rub(sale.lines.reduce((sum, line) => sum + line.price * line.qty, 0))}</span>
                        <span class="pay-mark">${sale.pay === "card" ? "Безнал" : "Нал"}</span>
                        <button type="button" data-edit="${esc(sale.id)}">Править</button>
                      </article>`,
                    )
                    .join("")}
                </li>`,
              )
              .join("")}
          </ul>
        </section>
      </div>
    </main>
  `;

  const nextSearch = root.querySelector<HTMLInputElement>(".find input");
  if (caret !== null && nextSearch) {
    nextSearch.focus();
    nextSearch.setSelectionRange(caret, caret);
  }
  if (state.priceFocus) {
    const field = root.querySelector<HTMLInputElement>(".rub-edit");
    field?.focus();
    field?.select();
  }
}

function groups(): { day: string; sales: Sale[] }[] {
  const map = new Map<string, Sale[]>();
  for (const sale of state.sales) {
    const list = map.get(sale.day) ?? [];
    list.push(sale);
    map.set(sale.day, list);
  }
  return [...map.entries()].map(([day, sales]) => ({ day, sales }));
}

function extraChips(line: Line): string {
  const dish = state.catalog.find((item) => item.id === line.dishId);
  if (!dish?.extras.length) return "";
  return `<div class="adds">${dish.extras
    .map((extra) => {
      const on = line.extras.includes(extra.id);
      return `<button type="button" class="add${on ? " is-on" : ""}" data-extra-line="${esc(line.key)}" data-extra-id="${esc(extra.id)}">${esc(extra.name)} ${rub(extra.price)}</button>`;
    })
    .join("")}</div>`;
}

function toggleExtra(key: string, extraId: string): void {
  const line = state.draft.find((item) => item.key === key);
  const dish = state.catalog.find((item) => item.id === line?.dishId);
  const extra = dish?.extras.find((item) => item.id === extraId);
  if (!line || !extra) return;
  if (line.extras.includes(extraId)) {
    line.extras = line.extras.filter((id) => id !== extraId);
    if (line.price !== null) line.price = Math.max(0, line.price - extra.price);
    return;
  }
  line.extras = [...line.extras, extraId];
  line.price = (line.price ?? dish?.price ?? 0) + extra.price;
}

function addDish(id: string): void {
  const dish = state.catalog.find((item) => item.id === id);
  if (!dish) return;
  state.draft.unshift({
    key: lineKey(),
    dishId: dish.id,
    name: dish.name,
    amount: dish.amount,
    image: dish.image,
    price: dish.price,
    qty: 1,
    extras: [],
  });
  state.query = "";
  state.error = "";
}

function addCustom(name: string): void {
  const text = name.trim().replace(/\s+/g, " ");
  if (!text || text.length > 80) return;
  state.draft.unshift({
    key: lineKey(),
    dishId: "",
    name: text,
    amount: "",
    image: OWN_IMAGE,
    price: 0,
    qty: 1,
    extras: [],
  });
  state.query = "";
  state.error = "";
}

function takeTyped(): void {
  const exact = state.catalog.find((dish) => dish.name.toLocaleLowerCase("ru") === state.query.trim().toLocaleLowerCase("ru"));
  if (exact) addDish(exact.id);
  else addCustom(state.query);
}

async function save(): Promise<void> {
  if (!ready()) return;
  const lines = state.draft.map((line) =>
    line.dishId
      ? { dishId: line.dishId, price: line.price, qty: line.qty, extras: line.extras }
      : { name: line.name, price: line.price, qty: line.qty },
  );
  const path = state.editing ? `/api/sales/${state.editing}` : "/api/sales";
  const body = state.editing ? { lines, day: state.day, pay: state.pay } : { lines, pay: state.pay };
  const response = await fetch(path, {
    method: state.editing ? "PATCH" : "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    state.error = "Не записалось";
    paint();
    return;
  }
  state.draft = [];
  state.editing = null;
  state.pay = "cash";
  state.day = state.today;
  state.error = "";
  state.sales = (await (await fetch("/api/sales")).json()) as Sale[];
  paint();
}

async function dropSale(): Promise<void> {
  if (!state.editing) return;
  const response = await fetch(`/api/sales/${state.editing}`, { method: "DELETE" });
  if (!response.ok) {
    state.error = "Не записалось";
    paint();
    return;
  }
  state.draft = [];
  state.editing = null;
  state.pay = "cash";
  state.day = state.today;
  state.error = "";
  state.sales = (await (await fetch("/api/sales")).json()) as Sale[];
  paint();
}

function editSale(id: string): void {
  const sale = state.sales.find((item) => item.id === id);
  if (!sale) return;
  state.editing = sale.id;
  state.day = sale.day;
  state.pay = sale.pay === "card" ? "card" : "cash";
  state.draft = sale.lines.map((line) => {
    const dish = line.dishId ? state.catalog.find((item) => item.id === line.dishId) : undefined;
    return {
      key: lineKey(),
      dishId: line.dishId,
      name: line.name,
      amount: dish?.amount ?? "",
      image: dish?.image ?? (line.dishId ? "" : OWN_IMAGE),
      price: line.price,
      qty: line.qty,
      extras: (line.extras ?? []).map((extra) => extra.id),
    };
  });
  state.query = "";
  state.error = "";
  paint();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

root.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.closest(".find")) {
    state.query = target.value;
    state.priceFocus = null;
    paint();
    return;
  }
  const id = target.dataset.price;
  if (!id) return;
  const line = state.draft.find((item) => item.key === id);
  if (!line) return;
  const digits = target.value.replace(/\D/g, "");
  line.price = digits === "" ? null : Number(digits);
  target.value = digits;
});

root.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const extraChip = target.closest<HTMLElement>("[data-extra-id]");
  if (extraChip?.dataset.extraLine && extraChip.dataset.extraId) {
    toggleExtra(extraChip.dataset.extraLine, extraChip.dataset.extraId);
    state.priceFocus = null;
    paint();
    return;
  }
  const own = target.closest<HTMLElement>("[data-own]")?.dataset.own;
  if (own) {
    addCustom(own);
    paint();
    return;
  }
  const picked = target.closest<HTMLElement>("[data-pay]")?.dataset.pay;
  if (picked === "cash" || picked === "card") {
    state.pay = picked;
    state.priceFocus = null;
    paint();
    return;
  }
  const add = target.closest<HTMLElement>("[data-add]")?.dataset.add;
  if (add) {
    addDish(add);
    paint();
    return;
  }
  const qty = target.closest<HTMLElement>("[data-qty]");
  if (qty?.dataset.qty && qty.dataset.dir) {
    const line = state.draft.find((item) => item.key === qty.dataset.qty);
    if (!line) return;
    const next = line.qty + Number(qty.dataset.dir);
    if (next < 1) state.draft = state.draft.filter((item) => item.key !== line.key);
    else line.qty = Math.min(99, next);
    state.priceFocus = null;
    paint();
    return;
  }
  const open = target.closest<HTMLElement>("[data-price-open]")?.dataset.priceOpen;
  if (open) {
    state.priceFocus = open;
    paint();
    return;
  }
  const shift = target.closest<HTMLElement>("[data-shift]")?.dataset.shift;
  if (shift && state.editing) {
    const next = shiftDay(state.day, Number(shift));
    if (next <= state.today) state.day = next;
    paint();
    return;
  }
  const dropLine = target.closest<HTMLElement>("[data-drop-line]")?.dataset.dropLine;
  if (dropLine) {
    state.draft = state.draft.filter((item) => item.key !== dropLine);
    state.priceFocus = null;
    paint();
    return;
  }
  if (target.closest("[data-save]")) {
    void save();
    return;
  }
  if (target.closest("[data-drop]")) {
    void dropSale();
    return;
  }
  if (target.closest("[data-cancel]")) {
    state.editing = null;
    state.draft = [];
    state.pay = "cash";
    state.day = state.today;
    state.error = "";
    paint();
    return;
  }
  const edit = target.closest<HTMLElement>("[data-edit]")?.dataset.edit;
  if (edit) editSale(edit);
});

root.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.closest(".find")) return;
  if (!state.query.trim()) return;
  event.preventDefault();
  takeTyped();
  paint();
});

root.addEventListener("focusout", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.dataset.price) return;
  state.priceFocus = null;
  paint();
});

const me = await fetch("/api/me");
if (!me.ok) location.replace("/login");
else {
  const who = (await me.json()) as { role?: string };
  if (who.role !== "worker") location.replace("/admin");
  else {
    const [menu, sales] = await Promise.all([
      fetch("/api/menu").then((response) => response.json() as Promise<Dish[]>),
      fetch("/api/sales").then((response) => response.json() as Promise<Sale[]>),
    ]);
    state.catalog = menu;
    state.sales = sales;
    state.today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Moscow",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    state.day = state.today;
    paint();
  }
}
