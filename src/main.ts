import { dishes } from "./menu";

const priceFormat = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

const list = document.querySelector("#menu");

if (!(list instanceof HTMLUListElement)) {
  throw new Error("Menu list is missing.");
}

for (const dish of dishes) {
  const item = document.createElement("li");
  item.className = "dish";

  const image = document.createElement("img");
  image.src = dish.image;
  image.alt = dish.name;
  image.width = 960;
  image.height = 960;
  image.loading = "lazy";

  const body = document.createElement("div");
  body.className = "dish-body";

  const name = document.createElement("h3");
  name.textContent = dish.name;

  const note = document.createElement("p");
  note.className = "dish-note";
  note.textContent = dish.note;

  const price = document.createElement("p");
  price.className = "dish-price";
  price.textContent = priceFormat.format(dish.price);

  body.append(name, note, price);
  item.append(image, body);
  list.append(item);
}
