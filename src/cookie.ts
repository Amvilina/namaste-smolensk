const KEY = "namaste-cookie-ok";

function mountCookie() {
  if (document.querySelector(".cookie")) return;
  try {
    if (localStorage.getItem(KEY)) return;
  } catch {
    /* show the note */
  }

  const bar = document.createElement("div");
  bar.className = "cookie";
  bar.innerHTML = `
    <p>Мы используем cookie. Продолжая пользоваться сайтом, вы соглашаетесь с <a href="/legal/privacy">политикой конфиденциальности</a>.</p>
    <button type="button" aria-label="Закрыть">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
    </button>
  `;
  bar.querySelector("button")?.addEventListener("click", () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    bar.remove();
  });
  document.body.append(bar);
}

mountCookie();
