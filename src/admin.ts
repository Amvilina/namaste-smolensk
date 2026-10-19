type Extra = { id: string; name: string; price: number };
type Sale = {
  id: string;
  day: string;
  pay?: "cash" | "card";
  lines: { name: string; price: number; qty: number; extras?: Extra[] }[];
};
type Expense = {
  id: string;
  day: string;
  category: "products" | "tech" | "wage" | "rent" | "other";
  label: string;
  title: string;
  lines: { name: string; amount: number }[];
};
type Writeoff = { id: string; day: string; kind: "dish" | "product"; name: string; volume: string };

const mount = document.querySelector("#admin");
if (!(mount instanceof HTMLElement)) throw new Error("admin root missing");
const root: HTMLElement = mount;

const WEEK = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const CHEVRON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6.5 9 12l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const state: {
  sales: Sale[];
  costs: Expense[];
  offs: Writeoff[];
  year: number;
  month: number;
  picked: string;
  today: string;
} = {
  sales: [],
  costs: [],
  offs: [],
  year: 2026,
  month: 10,
  picked: "",
  today: "",
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

function iso(year: number, month: number, date: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
}

function dayTitle(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, date)),
  );
}

function monthTitle(year: number, month: number): string {
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

function busyDays(): Set<string> {
  const set = new Set<string>();
  for (const item of state.sales) set.add(item.day);
  for (const item of state.costs) set.add(item.day);
  for (const item of state.offs) set.add(item.day);
  return set;
}

function saleItem(sale: Sale): string {
  const sum = sale.lines.reduce((total, line) => total + line.price * line.qty, 0);
  const lines = sale.lines
    .map((line) => {
      const extra = line.extras?.length ? `<em>${line.extras.map((item) => esc(item.name)).join(", ")}</em>` : "";
      return `<li><span>${esc(line.name)}${extra}</span><span class="qty">× ${line.qty}</span><b>${rub(line.price * line.qty)}</b></li>`;
    })
    .join("");
  const card = sale.pay === "card";
  return `<li>
    <div class="entry-top"><span class="mark ${card ? "card" : "cash"}">${card ? "Безнал" : "Нал"}</span><b>${rub(sum)}</b></div>
    <ul class="entry-lines dishes">${lines}</ul>
  </li>`;
}

function calendar(): string {
  const busy = busyDays();
  const first = new Date(Date.UTC(state.year, state.month - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(state.year, state.month, 0)).getUTCDate();
  const cells: string[] = [];
  for (let i = 0; i < lead; i += 1) cells.push("<span></span>");
  for (let date = 1; date <= count; date += 1) {
    const day = iso(state.year, state.month, date);
    const on = day === state.picked ? " is-on" : "";
    const has = busy.has(day) ? " has" : "";
    const future = day > state.today;
    cells.push(
      `<button type="button" data-day="${day}" class="${on}${has}"${future ? " disabled" : ""}><span>${date}</span></button>`,
    );
  }
  while (cells.length % 7) cells.push("<span></span>");
  const atNow = state.year > Number(state.today.slice(0, 4)) || (state.year === Number(state.today.slice(0, 4)) && state.month >= Number(state.today.slice(5, 7)));
  return `<section class="cal">
    <div class="cal-nav">
      <button type="button" data-prev aria-label="Предыдущий месяц">${CHEVRON}</button>
      <h2>${esc(monthTitle(state.year, state.month))}</h2>
      <button type="button" data-next aria-label="Следующий месяц"${atNow ? " disabled" : ""}>${CHEVRON}</button>
    </div>
    <div class="cal-week">${WEEK.map((name) => `<span>${name}</span>`).join("")}</div>
    <div class="cal-grid">${cells.join("")}</div>
  </section>`;
}

function pickedView(): string {
  if (!state.picked) return "";
  const sales = state.sales.filter((item) => item.day === state.picked);
  const costs = state.costs.filter((item) => item.day === state.picked);
  const offs = state.offs.filter((item) => item.day === state.picked);
  const saleItems = sales.map((item) => saleItem(item)).join("");
  const costItems = costs
    .map((item) => {
      const sum = item.lines.reduce((total, line) => total + line.amount, 0);
      const lines =
        item.category === "wage" || item.category === "rent"
          ? ""
          : `<ul class="entry-lines positions">${item.lines
              .map((line) => `<li><span>${esc(line.name)}</span><b>${rub(line.amount)}</b></li>`)
              .join("")}</ul>`;
      return `<li>
        <div class="entry-top"><span class="mark">${esc(item.label)}</span><b>${rub(sum)}</b></div>
        <p class="entry-name">${esc(item.title)}</p>
        ${lines}
      </li>`;
    })
    .join("");
  const offItems = offs
    .map(
      (item) => `<li>
        <div class="entry-top"><span class="mark">${item.kind === "dish" ? "Блюда" : "Продукты"}</span><b class="vol">${esc(item.volume)}</b></div>
        <p class="entry-name">${esc(item.name)}</p>
      </li>`,
    )
    .join("");
  return `<section class="picked">
    <div class="picked-bar">
      <h2>${esc(dayTitle(state.picked))}</h2>
      <a href="/worker?day=${esc(state.picked)}">Редактировать</a>
    </div>
    <div class="day-cols">
      <section><h3>Продажи</h3><ul>${saleItems}</ul></section>
      <section><h3>Затраты</h3><ul>${costItems}</ul></section>
      <section><h3>Списания</h3><ul>${offItems}</ul></section>
    </div>
  </section>`;
}

function shift(delta: number): void {
  const next = new Date(Date.UTC(state.year, state.month - 1 + delta, 1));
  state.year = next.getUTCFullYear();
  state.month = next.getUTCMonth() + 1;
}

function paint(): void {
  root.innerHTML = `
    <header class="desk-bar">
      <b>Календарь</b>
      <form method="post" action="/logout"><button class="leave" type="submit">Выйти</button></form>
    </header>
    <main class="desk">${calendar()}${pickedView()}</main>
  `;
}

root.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const day = target.closest("button[data-day]");
  if (day instanceof HTMLButtonElement && !day.disabled && day.dataset.day) {
    state.picked = day.dataset.day;
    history.replaceState(null, "", `/admin?day=${state.picked}`);
    paint();
    return;
  }
  if (target.closest("[data-prev]")) {
    shift(-1);
    paint();
  } else if (target.closest("[data-next]") && !(target.closest("[data-next]") as HTMLButtonElement).disabled) {
    shift(1);
    paint();
  }
});

const me = await fetch("/api/me");
if (!me.ok) location.replace("/login");
else {
  const who = (await me.json()) as { role?: string };
  if (who.role !== "admin") location.replace("/worker");
  else {
    const [sales, costs, offs] = await Promise.all([
      fetch("/api/sales").then((response) => response.json() as Promise<Sale[]>),
      fetch("/api/expenses").then((response) => response.json() as Promise<Expense[]>),
      fetch("/api/writeoffs").then((response) => response.json() as Promise<Writeoff[]>),
    ]);
    state.sales = sales;
    state.costs = costs;
    state.offs = offs;
    state.today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Moscow",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const asked = new URLSearchParams(location.search).get("day") ?? "";
    const askedOk = /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked <= state.today;
    const focus = askedOk ? asked : state.today;
    state.picked = askedOk ? asked : "";
    state.year = Number(focus.slice(0, 4));
    state.month = Number(focus.slice(5, 7));
    paint();
  }
}
