import { dishControl, formatPrice, mountCart, orderPrice, refreshDish } from "./cart";
import menu from "./menu.json";

const board = document.querySelector("#menu");

if (!(board instanceof HTMLElement)) {
  throw new Error("Menu is missing.");
}

for (const section of menu) {
  const block = document.createElement("section");
  block.className = "board-section";
  block.id = section.id;

  const inner = document.createElement("div");
  inner.className = "wrap";

  const title = document.createElement("h2");
  title.textContent = section.title;

  const list = document.createElement("ul");
  list.className = "menu-list";

  for (const dish of section.dishes) {
    const item = document.createElement("li");
    item.className = "dish";
    if (dish.price == null) item.classList.add("is-off");

    const photo = document.createElement("img");
    photo.className = "dish-photo";
    photo.src = dish.image || "/logo.webp";
    photo.alt = "";
    photo.width = 885;
    photo.height = 808;

    const copy = document.createElement("div");
    copy.className = "dish-body";

    const name = document.createElement("h3");
    name.textContent = dish.name;

    const head = document.createElement("div");
    head.className = "dish-head";
    head.append(name);

    const picked = new Set<string>();
    const extras = "extras" in dish && dish.extras ? dish.extras : [];
    if (extras.length) item.classList.add("has-extras");

    let showPrice = () => {};
    if (dish.price != null) {
      const price = document.createElement("p");
      price.className = "dish-price";
      showPrice = () => {
        const value = orderPrice(dish, [...picked]);
        if (value != null) price.textContent = formatPrice(value);
      };
      showPrice();
      head.append(price);
    }

    copy.append(head);

    if (dish.amount) {
      const amount = document.createElement("p");
      amount.className = "dish-amount";
      amount.textContent = dish.amount;
      copy.append(amount);
    }

    if (dish.note) {
      const note = document.createElement("p");
      note.className = "dish-note";
      note.textContent = dish.note;
      copy.append(note);
    }

    if (extras.length) {
      const group = document.createElement("div");
      group.className = "extras";
      const heading = document.createElement("p");
      heading.className = "extras-title";
      heading.textContent = "Начинки";
      const table = document.createElement("div");
      table.className = "extras-table";
      group.append(heading, table);
      for (const extra of extras) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "extra";
        button.setAttribute("aria-pressed", "false");
        const mark = document.createElement("img");
        mark.className = "extra-icon";
        mark.src = "/logo.webp";
        mark.alt = "";
        mark.width = 885;
        mark.height = 808;
        const label = document.createElement("span");
        label.className = "extra-name";
        label.textContent = extra.name;
        const cost = document.createElement("span");
        cost.className = "extra-price";
        cost.textContent = formatPrice(extra.price);
        button.append(mark, label, cost);
        button.addEventListener("click", () => {
          if (picked.has(extra.id)) picked.delete(extra.id);
          else picked.add(extra.id);
          const on = picked.has(extra.id);
          button.classList.toggle("is-on", on);
          button.setAttribute("aria-pressed", on ? "true" : "false");
          showPrice();
          refreshDish(dish.id);
        });
        table.append(button);
      }
      item.append(group);
    }

    item.append(photo, copy, dishControl(dish, extras.length ? () => [...picked] : undefined));

    list.append(item);
  }

  inner.append(title, list);
  block.append(inner);
  board.append(block);
}

const navLinks = document.querySelectorAll<HTMLAnchorElement>(
  ".site-nav a, .footer-links a",
);

if (navLinks.length > 0) {
  const mark = (id: string) => {
    for (const link of navLinks) {
      const on = link.getAttribute("href") === `#${id}`;
      link.classList.toggle("is-current", on);
      if (on) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  };

  const seen = new IntersectionObserver(
    (entries) => {
      const hit = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (hit?.target instanceof HTMLElement) mark(hit.target.id);
    },
    { rootMargin: "-25% 0px -55% 0px", threshold: [0.15, 0.4] },
  );

  for (const section of board.querySelectorAll(".board-section")) {
    seen.observe(section);
  }
}

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const rising = document.querySelectorAll(".board-section, .contacts, .site-footer");

if (!reduceMotion && rising.length > 0) {
  document.documentElement.classList.add("js");

  const watch = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-shown");
        watch.unobserve(entry.target);
      }
    },
    { threshold: 0.18 },
  );

  for (const block of rising) {
    block.classList.add("will-rise");
    watch.observe(block);
  }
}

mountCart();
