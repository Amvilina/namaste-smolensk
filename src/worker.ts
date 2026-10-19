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

type Category = "products" | "tech" | "wage" | "rent" | "other";

type CostLine = {
  key: string;
  name: string;
  amount: number | null;
};

type Expense = {
  id: string;
  day: string;
  category: Category;
  label: string;
  title: string;
  lines: { name: string; amount: number }[];
};

const CATS: { id: Category; name: string }[] = [
  { id: "products", name: "Продукты" },
  { id: "tech", name: "Техническое" },
  { id: "wage", name: "Зарплата" },
  { id: "rent", name: "Аренда" },
  { id: "other", name: "Другое" },
];

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
  mode: "sales" | "costs";
  costs: Expense[];
  costCategory: Category;
  costLabel: string;
  costTitle: string;
  costItem: string;
  costPrice: number | null;
  costDraft: CostLine[];
  costEditing: string | null;
  costDay: string;
  costError: string;
  costFocus: string | null;
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
  mode: "sales",
  costs: [],
  costCategory: "products",
  costLabel: "",
  costTitle: "",
  costItem: "",
  costPrice: 0,
  costDraft: [],
  costEditing: null,
  costDay: "",
  costError: "",
  costFocus: null,
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

function neat(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function costReady(): boolean {
  if (!neat(state.costTitle) || neat(state.costTitle).length > 80) return false;
  if (state.costCategory === "other" && (!neat(state.costLabel) || neat(state.costLabel).length > 80)) return false;
  return state.costDraft.length > 0 && state.costDraft.every((line) => line.amount !== null);
}

function addPosition(): void {
  const name = neat(state.costItem);
  if (!name || name.length > 80) return;
  state.costDraft.unshift({ key: lineKey(), name, amount: state.costPrice ?? 0 });
  state.costItem = "";
  state.costPrice = 0;
  state.costError = "";
  state.costFocus = "item";
}

function costGroups(): { day: string; items: Expense[] }[] {
  const map = new Map<string, Expense[]>();
  for (const item of state.costs) {
    const list = map.get(item.day) ?? [];
    list.push(item);
    map.set(item.day, list);
  }
  return [...map.entries()].map(([day, items]) => ({ day, items }));
}

function costDesk(): string {
  const total = state.costDraft.reduce((sum, line) => sum + (line.amount ?? 0), 0);
  return `
    <section>
      <p class="day-line">
        <time datetime="${esc(state.costDay)}">${esc(dayLabel(state.costDay))}</time>
      </p>
      <div class="cats">
        ${CATS.map(
          (cat) =>
            `<button type="button" class="add${state.costCategory === cat.id ? " is-on" : ""}" data-cat="${cat.id}">${cat.name}</button>`,
        ).join("")}
        ${
          state.costCategory === "other"
            ? `<label class="other"><input data-cost-label value="${esc(state.costLabel)}" placeholder="Название" maxlength="80" autocomplete="off" /></label>`
            : ""
        }
      </div>
      <label class="find cost-title">
        <input data-cost-title value="${esc(state.costTitle)}" placeholder="Название" maxlength="80" autocomplete="off" />
      </label>
      <div class="adder">
        <input data-cost-item value="${esc(state.costItem)}" placeholder="Позиция" maxlength="80" autocomplete="off" />
        <input class="rub-edit" data-cost-price inputmode="numeric" value="${state.costPrice ?? ""}" />
        <span class="step"><button type="button" data-add-cost aria-label="Добавить">+</button></span>
      </div>
      <div class="slip">
        ${state.costDraft
          .map(
            (line) => `<article class="cost-line">
              <div class="line-name">${esc(line.name)}</div>
              <div class="line-tools">
                ${
                  state.costFocus === line.key
                    ? `<input class="rub-edit" data-cost-amount="${esc(line.key)}" inputmode="numeric" value="${line.amount ?? ""}" />`
                    : `<button class="rub" type="button" data-cost-open="${esc(line.key)}">${line.amount === null ? "—" : rub(line.amount)}</button>`
                }
                <button class="drop" type="button" data-drop-cost-line="${esc(line.key)}" aria-label="Убрать">×</button>
              </div>
            </article>`,
          )
          .join("")}
        ${state.costDraft.length ? `<p class="total">${rub(total)}</p>` : ""}
        <div>
          ${
            state.costEditing && state.costDraft.length === 0
              ? `<button class="record" type="button" data-drop-cost>Удалить</button>`
              : `<button class="record" type="button" data-save-cost ${costReady() ? "" : "disabled"}>${state.costEditing ? "Сохранить" : "Записать"}</button>`
          }
          ${state.costEditing ? `<button class="ghost" type="button" data-cancel-cost>Отмена</button>` : ""}
        </div>
        ${state.costError ? `<p class="miss">${esc(state.costError)}</p>` : ""}
      </div>
    </section>
    <section class="history">
      <ul class="past">
        ${costGroups()
          .map(
            (group) => `<li>
              <h2>${esc(dayLabel(group.day))}</h2>
              ${group.items
                .map(
                  (item) => `<article class="bill">
                    <div class="bill-top">
                      <span class="tag">${esc(item.label)}</span>
                      <div class="bill-title">${esc(item.title)}</div>
                    </div>
                    <ul class="bill-lines">
                      ${item.lines
                        .map(
                          (line) => `<li><span>${esc(line.name)}</span><b>${rub(line.amount)}</b></li>`,
                        )
                        .join("")}
                    </ul>
                    <div class="bill-sum">${rub(item.lines.reduce((sum, line) => sum + line.amount, 0))}</div>
                    <button type="button" data-edit-cost="${esc(item.id)}">Править</button>
                  </article>`,
                )
                .join("")}
            </li>`,
          )
          .join("")}
      </ul>
    </section>
  `;
}

function deskBar(): string {
  return `<header class="desk-bar">
      <div class="modes">
        <button type="button" class="add${state.mode === "sales" ? " is-on" : ""}" data-mode="sales">Продажи</button>
        <button type="button" class="add${state.mode === "costs" ? " is-on" : ""}" data-mode="costs">Затраты</button>
      </div>
      <form method="post" action="/logout"><button class="leave" type="submit">Выйти</button></form>
    </header>`;
}

function focusDesk(caret: number | null): void {
  if (state.costFocus === "label") {
    root.querySelector<HTMLInputElement>("[data-cost-label]")?.focus();
    return;
  }
  if (state.costFocus === "item") {
    root.querySelector<HTMLInputElement>("[data-cost-item]")?.focus();
    return;
  }
  if (state.costFocus) {
    const field = root.querySelector<HTMLInputElement>(`[data-cost-amount="${state.costFocus}"]`);
    field?.focus();
    field?.select();
    return;
  }
  const nextSearch = root.querySelector<HTMLInputElement>(".find input:not([data-cost-title]):not([data-cost-item])");
  if (caret !== null && nextSearch) {
    nextSearch.focus();
    nextSearch.setSelectionRange(caret, caret);
  }
  if (state.priceFocus) {
    const field = root.querySelector<HTMLInputElement>("[data-price]");
    field?.focus();
    field?.select();
  }
}

function paint(): void {
  const search = root.querySelector<HTMLInputElement>(".find input:not([data-cost-title]):not([data-cost-item])");
  const caret = search && document.activeElement === search ? search.selectionStart : null;
  const total = state.draft.reduce((sum, line) => sum + lineSum(line), 0);
  const hits = matches();
  const own = ownQuery();

  if (state.mode === "costs") {
    root.innerHTML = `${deskBar()}<main class="desk"><div class="desk-grid">${costDesk()}</div></main>`;
    focusDesk(caret);
    return;
  }

  root.innerHTML = `
    ${deskBar()}
    <main class="desk">
      <div class="desk-grid">
        <section>
          <p class="day-line">
            <time datetime="${esc(state.day)}">${esc(dayLabel(state.day))}</time>
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

  focusDesk(caret);
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

function blankCost(): void {
  state.costEditing = null;
  state.costCategory = "products";
  state.costLabel = "";
  state.costTitle = "";
  state.costItem = "";
  state.costPrice = 0;
  state.costDraft = [];
  state.costDay = state.today;
  state.costError = "";
  state.costFocus = null;
}

async function reloadCosts(): Promise<void> {
  state.costs = (await (await fetch("/api/expenses")).json()) as Expense[];
}

async function saveCost(): Promise<void> {
  if (!costReady()) return;
  const path = state.costEditing ? `/api/expenses/${state.costEditing}` : "/api/expenses";
  const response = await fetch(path, {
    method: state.costEditing ? "PATCH" : "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      category: state.costCategory,
      title: neat(state.costTitle),
      ...(state.costCategory === "other" ? { label: neat(state.costLabel) } : {}),
      lines: state.costDraft.map((line) => ({ name: line.name, amount: line.amount })),
    }),
  });
  if (!response.ok) {
    state.costError = "Не записалось";
    paint();
    return;
  }
  blankCost();
  await reloadCosts();
  paint();
}

async function dropCost(): Promise<void> {
  if (!state.costEditing) return;
  const response = await fetch(`/api/expenses/${state.costEditing}`, { method: "DELETE" });
  if (!response.ok) {
    state.costError = "Не записалось";
    paint();
    return;
  }
  blankCost();
  await reloadCosts();
  paint();
}

function editCost(id: string): void {
  const item = state.costs.find((row) => row.id === id);
  if (!item) return;
  state.costEditing = item.id;
  state.costDay = item.day;
  state.costCategory = item.category;
  state.costLabel = item.category === "other" ? item.label : "";
  state.costTitle = item.title;
  state.costItem = "";
  state.costPrice = 0;
  state.costDraft = item.lines.map((line) => ({
    key: lineKey(),
    name: line.name,
    amount: line.amount,
  }));
  state.costError = "";
  state.costFocus = null;
  paint();
  window.scrollTo({ top: 0, behavior: "smooth" });
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
  if (target.dataset.costTitle !== undefined) {
    state.costTitle = target.value;
    const record = root.querySelector<HTMLButtonElement>("[data-save-cost]");
    if (record) record.disabled = !costReady();
    return;
  }
  if (target.dataset.costLabel !== undefined) {
    state.costLabel = target.value;
    const record = root.querySelector<HTMLButtonElement>("[data-save-cost]");
    if (record) record.disabled = !costReady();
    return;
  }
  if (target.dataset.costItem !== undefined) {
    state.costItem = target.value;
    return;
  }
  if (target.dataset.costPrice !== undefined) {
    const digits = target.value.replace(/\D/g, "");
    state.costPrice = digits === "" ? null : Number(digits);
    target.value = digits;
    return;
  }
  if (target.closest(".find")) {
    state.query = target.value;
    state.priceFocus = null;
    paint();
    return;
  }
  if (target.dataset.costAmount) {
    const line = state.costDraft.find((item) => item.key === target.dataset.costAmount);
    if (!line) return;
    const digits = target.value.replace(/\D/g, "");
    line.amount = digits === "" ? null : Number(digits);
    target.value = digits;
    const record = root.querySelector<HTMLButtonElement>("[data-save-cost]");
    if (record) record.disabled = !costReady();
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
  const mode = target.closest<HTMLElement>("[data-mode]")?.dataset.mode;
  if (mode === "sales" || mode === "costs") {
    state.mode = mode;
    state.priceFocus = null;
    state.costFocus = null;
    paint();
    return;
  }
  const cat = target.closest<HTMLElement>("[data-cat]")?.dataset.cat;
  if (cat === "products" || cat === "tech" || cat === "wage" || cat === "rent" || cat === "other") {
    state.costCategory = cat;
    state.costFocus = cat === "other" ? "label" : null;
    paint();
    return;
  }
  if (target.closest("[data-add-cost]")) {
    addPosition();
    paint();
    return;
  }
  const openCost = target.closest<HTMLElement>("[data-cost-open]")?.dataset.costOpen;
  if (openCost) {
    state.costFocus = openCost;
    paint();
    return;
  }
  const dropCostLine = target.closest<HTMLElement>("[data-drop-cost-line]")?.dataset.dropCostLine;
  if (dropCostLine) {
    state.costDraft = state.costDraft.filter((line) => line.key !== dropCostLine);
    state.costFocus = null;
    paint();
    return;
  }
  if (target.closest("[data-save-cost]")) {
    void saveCost();
    return;
  }
  if (target.closest("[data-drop-cost]")) {
    void dropCost();
    return;
  }
  if (target.closest("[data-cancel-cost]")) {
    blankCost();
    paint();
    return;
  }
  const editCostId = target.closest<HTMLElement>("[data-edit-cost]")?.dataset.editCost;
  if (editCostId) {
    editCost(editCostId);
    return;
  }
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
  if (!(target instanceof HTMLInputElement)) return;
  if (target.closest(".adder")) {
    if (!neat(state.costItem)) return;
    event.preventDefault();
    addPosition();
    paint();
    return;
  }
  if (!target.closest(".find")) return;
  if (target.dataset.costTitle !== undefined || target.dataset.costLabel !== undefined) return;
  if (!state.query.trim()) return;
  event.preventDefault();
  takeTyped();
  paint();
});

root.addEventListener("focusout", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.dataset.price) {
    state.priceFocus = null;
    paint();
    return;
  }
  if (target.dataset.costAmount) {
    state.costFocus = null;
    paint();
  }
});

const me = await fetch("/api/me");
if (!me.ok) location.replace("/login");
else {
  const who = (await me.json()) as { role?: string };
  if (who.role !== "worker") location.replace("/admin");
  else {
    const [menu, sales, costs] = await Promise.all([
      fetch("/api/menu").then((response) => response.json() as Promise<Dish[]>),
      fetch("/api/sales").then((response) => response.json() as Promise<Sale[]>),
      fetch("/api/expenses").then((response) => response.json() as Promise<Expense[]>),
    ]);
    state.catalog = menu;
    state.sales = sales;
    state.costs = costs;
    state.today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Moscow",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    state.day = state.today;
    state.costDay = state.today;
    paint();
  }
}
