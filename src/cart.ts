import { bindAllPhoneInputs, isPhoneRuComplete, setPhoneValidity } from "./phone-ru";

export type Extra = {
  id: string;
  name: string;
  price: number;
  image?: string;
};

export type Dish = {
  id: string;
  name: string;
  note: string;
  amount: string;
  image: string;
  price?: number;
  per?: string;
  extras?: Extra[];
};

type Line = {
  id: string;
  extras: string[];
  count: number;
};

export function formatPrice(price: number, per?: string) {
  const text = `${new Intl.NumberFormat("ru-RU").format(price)}\u00a0₽`;
  return per ? `${text} / ${per}` : text;
}

type Stepper = {
  add: HTMLButtonElement;
  box: HTMLElement;
  num: HTMLElement;
};

const STORAGE = "namaste-cart";
const catalog = new Map<string, Dish>();
const orders = new Map<string, Line>();
const rows = new Map<string, Stepper>();
const picks = new Map<string, () => string[]>();

function lineKey(id: string, extras: string[]) {
  const list = [...extras].sort();
  return list.length ? `${id}:${list.join(",")}` : id;
}

function chosen(id: string) {
  return picks.get(id)?.() ?? [];
}

export function orderPrice(dish: Dish, extraIds: string[]) {
  if (dish.price == null) return null;
  let value = dish.price;
  for (const id of extraIds) {
    const extra = dish.extras?.find((item) => item.id === id);
    if (!extra) return null;
    value += extra.price;
  }
  return value;
}

function readCounts() {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return;
    const data = JSON.parse(raw) as Record<string, unknown>;
    for (const [stored, count] of Object.entries(data)) {
      if (typeof count !== "number" || count <= 0) continue;
      const cut = stored.indexOf(":");
      const id = cut === -1 ? stored : stored.slice(0, cut);
      const extras = cut === -1 ? [] : stored.slice(cut + 1).split(",").filter(Boolean);
      const key = lineKey(id, extras);
      const prev = orders.get(key);
      orders.set(key, {
        id,
        extras: [...extras].sort(),
        count: (prev?.count ?? 0) + Math.floor(count),
      });
    }
  } catch {
    localStorage.removeItem(STORAGE);
  }
}

function saveCounts() {
  const data: Record<string, number> = {};
  for (const [key, line] of orders) data[key] = line.count;
  localStorage.setItem(STORAGE, JSON.stringify(data));
}

readCounts();

const fab = document.createElement("button");
const badge = document.createElement("span");
const dialog = document.createElement("dialog");
const lines = document.createElement("ul");
const sum = document.createElement("p");

function total() {
  let sum = 0;
  for (const line of orders.values()) sum += line.count;
  return sum;
}

function pricedTotal() {
  let value = 0;
  let any = false;
  for (const line of orders.values()) {
    const dish = catalog.get(line.id);
    if (!dish) continue;
    const price = orderPrice(dish, line.extras);
    if (price == null) continue;
    any = true;
    value += price * line.count;
  }
  return any ? value : null;
}

function setCount(key: string, next: number) {
  const current = orders.get(key);
  const cut = key.indexOf(":");
  const id = current?.id ?? (cut === -1 ? key : key.slice(0, cut));
  const extras = current?.extras ?? (cut === -1 ? [] : key.slice(cut + 1).split(",").filter(Boolean));
  const dish = catalog.get(id);
  const price = dish ? orderPrice(dish, extras) : null;
  if (next > (current?.count ?? 0) && price == null) return;
  if (next <= 0) orders.delete(key);
  else orders.set(key, { id, extras, count: next });
  paintRow(id);
  paintFab();
  saveCounts();
  if (dialog.open) {
    if (total() === 0) dialog.close();
    else paintLines();
  }
}

function paintRow(id: string) {
  const row = rows.get(id);
  if (!row) return;
  const count = orders.get(lineKey(id, chosen(id)))?.count ?? 0;
  row.add.hidden = count > 0;
  row.box.hidden = count === 0;
  row.num.textContent = String(count);
}

export function refreshDish(id: string) {
  paintRow(id);
}

function paintFab() {
  const count = total();
  fab.hidden = count === 0;
  badge.textContent = String(count);
  fab.setAttribute("aria-label", `Корзина, ${count}`);
}

function emptyCart() {
  const ids = new Set([...orders.values()].map((line) => line.id));
  orders.clear();
  for (const id of ids) paintRow(id);
  paintFab();
  saveCounts();
}

function stepper(getKey: () => string, num: HTMLElement, priced: boolean) {
  const box = document.createElement("div");
  box.className = "stepper";

  const dec = document.createElement("button");
  dec.type = "button";
  dec.textContent = "−";
  dec.setAttribute("aria-label", "Меньше");
  dec.addEventListener("click", () => {
    const key = getKey();
    setCount(key, (orders.get(key)?.count ?? 0) - 1);
  });

  const inc = document.createElement("button");
  inc.type = "button";
  inc.textContent = "+";
  inc.setAttribute("aria-label", "Больше");
  inc.disabled = !priced;
  inc.addEventListener("click", () => {
    const key = getKey();
    setCount(key, (orders.get(key)?.count ?? 0) + 1);
  });

  box.append(dec, num, inc);
  return box;
}

function paintLines() {
  lines.replaceChildren();
  for (const line of orders.values()) {
    const dish = catalog.get(line.id);
    if (!dish) continue;
    const count = line.count;

    const item = document.createElement("li");
    const photo = document.createElement("img");
    photo.className = "cart-photo";
    photo.src = dish.image || "/logo.webp";
    photo.alt = "";
    photo.width = 885;
    photo.height = 808;
    const copy = document.createElement("div");
    const name = document.createElement("p");
    name.className = "cart-name";
    name.textContent = dish.name;
    copy.append(name);

    if (dish.note) {
      const note = document.createElement("p");
      note.className = "cart-note";
      note.textContent = dish.note;
      copy.append(note);
    }

    const mix = (dish.extras ?? [])
      .filter((extra) => line.extras.includes(extra.id))
      .map((extra) => extra.name);
    if (mix.length) {
      const picked = document.createElement("p");
      picked.className = "cart-mix";
      picked.textContent = mix.join(", ");
      copy.append(picked);
    }

    if (dish.amount) {
      const amount = document.createElement("p");
      amount.className = "cart-amount";
      amount.textContent = dish.amount;
      copy.append(amount);
    }

    const side = document.createElement("div");
    side.className = "cart-side";
    const price = orderPrice(dish, line.extras);
    if (price != null) {
      const cost = document.createElement("p");
      cost.className = "cart-cost";
      cost.textContent = formatPrice(price * count);
      side.append(cost);
    }

    const num = document.createElement("span");
    num.className = "qty";
    num.textContent = String(count);
    side.append(stepper(() => lineKey(line.id, line.extras), num, price != null));
    item.append(photo, copy, side);
    lines.append(item);
  }

  const priced = pricedTotal();
  sum.hidden = priced == null;
  if (priced != null) {
    const label = document.createElement("span");
    label.textContent = "Итого";
    const value = document.createElement("span");
    value.textContent = formatPrice(priced);
    sum.replaceChildren(label, value);
  }
}

export function dishControl(dish: Dish, getExtras?: () => string[]) {
  catalog.set(dish.id, dish);
  if (getExtras) picks.set(dish.id, getExtras);

  const wrap = document.createElement("div");
  wrap.className = "dish-add";

  const add = document.createElement("button");
  add.type = "button";
  add.className = "add";
  add.textContent = "+";
  add.setAttribute("aria-label", "Добавить");
  add.disabled = dish.price == null;
  add.addEventListener("click", () => {
    const key = lineKey(dish.id, chosen(dish.id));
    setCount(key, (orders.get(key)?.count ?? 0) + 1);
  });

  const num = document.createElement("span");
  num.className = "qty";
  const box = stepper(() => lineKey(dish.id, chosen(dish.id)), num, dish.price != null);
  box.hidden = true;

  wrap.append(add, box);
  rows.set(dish.id, { add, box, num });
  paintRow(dish.id);
  return wrap;
}

let scrollY = 0;
let locked = false;

function lockScroll() {
  if (locked) return;
  locked = true;
  scrollY = window.scrollY;
  document.body.style.position = "fixed";
  document.body.style.top = `-${scrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
}

function unlockScroll() {
  if (!locked) return;
  locked = false;
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  const root = document.documentElement;
  const behavior = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  window.scrollTo(0, scrollY);
  root.style.scrollBehavior = behavior;
}

export function mountCart() {
  fab.type = "button";
  fab.className = "cart-fab";
  fab.hidden = true;
  const mark = document.createElement("img");
  mark.src = "/cart.webp";
  mark.alt = "";
  mark.width = 162;
  mark.height = 185;
  fab.append(mark);
  badge.className = "cart-count";
  fab.append(badge);
  fab.addEventListener("click", () => {
    paintLines();
    lockScroll();
    dialog.showModal();
  });

  dialog.className = "cart-dialog";
  dialog.setAttribute("aria-labelledby", "cart-title");

  const head = document.createElement("div");
  head.className = "cart-head";
  const title = document.createElement("h2");
  title.id = "cart-title";
  title.textContent = "КОРЗИНА";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "cart-close";
  close.setAttribute("aria-label", "Закрыть");
  close.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  close.addEventListener("click", () => dialog.close());
  head.append(title, close);

  lines.className = "cart-lines";
  sum.className = "cart-total";
  sum.hidden = true;

  const body = document.createElement("div");
  body.className = "cart-body";

  const form = document.createElement("form");
  form.className = "cart-form";
  form.noValidate = true;
  form.innerHTML = `
    <div class="handoff" role="group" aria-label="Способ получения">
      <button type="button" data-handoff="pickup" aria-pressed="false">Самовывоз</button>
      <button type="button" data-handoff="delivery" aria-pressed="true">Доставка</button>
    </div>
    <label class="field field-address">
      <span>Адрес</span>
      <textarea class="input" name="address" rows="4" autocomplete="street-address"></textarea>
    </label>
    <label class="field">
      <span>Телефон</span>
      <input class="input" type="tel" name="phone" data-phone-ru inputmode="tel" autocomplete="tel" maxlength="18" value="+7" required>
    </label>
    <button type="submit">Заказать</button>
  `;

  const success = document.createElement("div");
  success.className = "cart-success";
  success.hidden = true;
  const bear = document.createElement("img");
  bear.src = "/logo.webp";
  bear.alt = "";
  bear.width = 885;
  bear.height = 808;
  const done = document.createElement("p");
  done.textContent = "Всё успешно. Скоро свяжемся с вами для подтверждения заказа.";
  success.append(bear, done);

  const phone = form.querySelector<HTMLInputElement>("[data-phone-ru]");
  const submit = form.querySelector<HTMLButtonElement>("button[type=submit]");
  const handoff = [...form.querySelectorAll<HTMLButtonElement>("[data-handoff]")];
  const address = form.querySelector<HTMLLabelElement>(".field-address");
  if (!phone || !submit || handoff.length !== 2 || !address) throw new Error("Order form is missing.");

  const paintHandoff = () => {
    const pickup = handoff.find((button) => button.dataset.handoff === "pickup");
    address.hidden = pickup?.getAttribute("aria-pressed") === "true";
  };
  for (const button of handoff) {
    button.addEventListener("click", () => {
      for (const item of handoff) item.setAttribute("aria-pressed", item === button ? "true" : "false");
      paintHandoff();
    });
  }

  const paintOrder = () => {
    const ready = isPhoneRuComplete(phone.value);
    submit.disabled = !ready;
    submit.classList.toggle("is-ready", ready);
  };
  phone.addEventListener("input", paintOrder);
  phone.addEventListener("blur", paintOrder);
  paintOrder();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    setPhoneValidity(phone);
    if (!form.reportValidity()) {
      const invalid = form.querySelector<HTMLInputElement>(":invalid");
      invalid?.focus();
      return;
    }
    emptyCart();
    body.hidden = true;
    success.hidden = false;
    dialog.classList.add("is-done");
  });

  dialog.addEventListener("close", () => {
    unlockScroll();
    body.hidden = false;
    success.hidden = true;
    dialog.classList.remove("is-done");
    form.reset();
    phone.value = "+7";
    phone.setCustomValidity("");
    for (const button of handoff) {
      button.setAttribute("aria-pressed", button.dataset.handoff === "delivery" ? "true" : "false");
    }
    paintHandoff();
    paintOrder();
  });

  const basket = document.createElement("div");
  basket.className = "cart-basket";
  basket.append(lines, sum);
  body.append(basket, form);
  dialog.append(head, body, success);
  bindAllPhoneInputs(dialog);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  for (const [key, line] of [...orders]) {
    const dish = catalog.get(line.id);
    const known = new Set(dish?.extras?.map((extra) => extra.id) ?? []);
    const extrasOk = line.extras.every((id) => known.has(id));
    if (!dish || !extrasOk) orders.delete(key);
  }
  for (const id of catalog.keys()) paintRow(id);
  saveCounts();
  paintFab();

  document.body.append(fab, dialog);
}
