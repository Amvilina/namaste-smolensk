export type Dish = {
  id: string;
  name: string;
  note: string;
  amount: string;
};

type Stepper = {
  add: HTMLButtonElement;
  box: HTMLElement;
  num: HTMLElement;
};

const catalog = new Map<string, Dish>();
const counts = new Map<string, number>();
const rows = new Map<string, Stepper>();

const fab = document.createElement("button");
const badge = document.createElement("span");
const dialog = document.createElement("dialog");
const lines = document.createElement("ul");

function total() {
  let sum = 0;
  for (const count of counts.values()) sum += count;
  return sum;
}

function setCount(id: string, next: number) {
  if (next <= 0) counts.delete(id);
  else counts.set(id, next);
  paintRow(id);
  paintFab();
  if (dialog.open) {
    if (total() === 0) dialog.close();
    else paintLines();
  }
}

function paintRow(id: string) {
  const row = rows.get(id);
  if (!row) return;
  const count = counts.get(id) ?? 0;
  row.add.hidden = count > 0;
  row.box.hidden = count === 0;
  row.num.textContent = String(count);
}

function paintFab() {
  const count = total();
  fab.hidden = count === 0;
  badge.textContent = String(count);
  fab.setAttribute("aria-label", `Корзина, ${count}`);
}

function stepper(id: string, num: HTMLElement) {
  const box = document.createElement("div");
  box.className = "stepper";

  const dec = document.createElement("button");
  dec.type = "button";
  dec.textContent = "−";
  dec.setAttribute("aria-label", "Меньше");
  dec.addEventListener("click", () => setCount(id, (counts.get(id) ?? 0) - 1));

  const inc = document.createElement("button");
  inc.type = "button";
  inc.textContent = "+";
  inc.setAttribute("aria-label", "Больше");
  inc.addEventListener("click", () => setCount(id, (counts.get(id) ?? 0) + 1));

  box.append(dec, num, inc);
  return box;
}

function paintLines() {
  lines.replaceChildren();
  for (const [id, count] of counts) {
    const dish = catalog.get(id);
    if (!dish) continue;

    const item = document.createElement("li");
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

    const amount = document.createElement("p");
    amount.className = "cart-amount";
    amount.textContent = dish.amount;
    copy.append(amount);

    const num = document.createElement("span");
    num.className = "qty";
    num.textContent = String(count);
    item.append(copy, stepper(id, num));
    lines.append(item);
  }
}

export function dishControl(dish: Dish) {
  catalog.set(dish.id, dish);

  const wrap = document.createElement("div");
  wrap.className = "dish-add";

  const add = document.createElement("button");
  add.type = "button";
  add.className = "add";
  add.textContent = "+";
  add.setAttribute("aria-label", "Добавить");
  add.addEventListener("click", () => setCount(dish.id, 1));

  const num = document.createElement("span");
  num.className = "qty";
  const box = stepper(dish.id, num);
  box.hidden = true;

  wrap.append(add, box);
  rows.set(dish.id, { add, box, num });
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
  window.scrollTo(0, scrollY);
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
  title.textContent = "Корзина";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "cart-close";
  close.setAttribute("aria-label", "Закрыть");
  close.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  close.addEventListener("click", () => dialog.close());
  head.append(title, close);

  lines.className = "cart-lines";
  dialog.append(head, lines);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", unlockScroll);

  document.body.append(fab, dialog);
}
