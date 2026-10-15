export type Dish = {
  id: string;
  name: string;
  note: string;
  price: number;
  image: string;
};

export const dishes: Dish[] = [
  {
    id: "echpochmak",
    name: "Эчпочмак",
    note: "Говядина, картофель и лук",
    price: 160,
    image: "/dishes/echpochmakwebp",
  },
  {
    id: "peremyach",
    name: "Перемяч",
    note: "Жареный пирожок с мясом",
    price: 150,
    image: "/dishes/peremyachwebp",
  },
  {
    id: "kystyby",
    name: "Кыстыбый",
    note: "Лепёшка с картофелем",
    price: 140,
    image: "/dishes/kystybywebp",
  },
  {
    id: "elesh",
    name: "Элеш",
    note: "Пирог с курицей и картофелем",
    price: 210,
    image: "/dishes/eleshwebp",
  },
  {
    id: "gubadiya",
    name: "Губадия",
    note: "Корт, рис и изюм",
    price: 230,
    image: "/dishes/gubadiyawebp",
  },
  {
    id: "azu",
    name: "Азу",
    note: "Говядина, солёные огурцы и картофель",
    price: 420,
    image: "/dishes/azuwebp",
  },
  {
    id: "tokmach",
    name: "Токмач",
    note: "Суп с домашней лапшой",
    price: 290,
    image: "/dishes/tokmachwebp",
  },
  {
    id: "chak-chak",
    name: "Чак-чак",
    note: "Тесто в меду",
    price: 180,
    image: "/dishes/chak-chakwebp",
  },
];
