import { menu } from "./menu";

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

    const copy = document.createElement("div");
    copy.className = "dish-body";

    const name = document.createElement("h3");
    name.textContent = dish.name;
    copy.append(name);

    if (dish.note) {
      const note = document.createElement("p");
      note.className = "dish-note";
      note.textContent = dish.note;
      copy.append(note);
    }

    const amount = document.createElement("p");
    amount.className = "dish-amount";
    amount.textContent = dish.amount;

    item.append(copy, amount);
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
