const copy = {
  eyebrow: "TypeScript",
  greeting: "Hello, world",
} as const;

const eyebrow = document.querySelector("#eyebrow");
const greeting = document.querySelector("#greeting");

if (!(eyebrow instanceof HTMLParagraphElement) || !(greeting instanceof HTMLHeadingElement)) {
  throw new Error("Page markup is missing.");
}

eyebrow.textContent = copy.eyebrow;
greeting.textContent = copy.greeting;
