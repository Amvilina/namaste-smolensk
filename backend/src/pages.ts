function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    return "&#39;";
  });
}

const shell = (title: string, body: string) => `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>${title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500&family=Unbounded:wght@500&display=swap"
      rel="stylesheet"
    />
    <style>
      body {
        margin: 0;
        min-height: 100dvh;
        display: grid;
        place-items: center;
        background: oklch(0.97 0.04 98);
        color: oklch(0.28 0.03 75);
        font-family: "Golos Text", "Avenir Next", sans-serif;
      }
      form {
        display: grid;
        gap: 0.75rem;
        width: min(100% - 2rem, 22rem);
      }
      h1 {
        margin: 0;
        font-family: Unbounded, "Avenir Next", sans-serif;
        font-size: 1.45rem;
        font-weight: 500;
      }
      label {
        display: grid;
        gap: 0.3rem;
      }
      input,
      button {
        font: inherit;
      }
      input {
        padding: 0.55rem 0.7rem;
        border: 1px solid oklch(0.28 0.03 75);
        border-radius: 0.4rem;
        background: #fff;
      }
      button {
        padding: 0.6rem 0.8rem;
        border: 2px solid oklch(0.28 0.03 75);
        border-radius: 0.4rem;
        background: #fed502;
        font-weight: 600;
      }
      p {
        margin: 0;
      }
      .out {
        position: fixed;
        top: 1rem;
        right: 1rem;
        width: auto;
      }
    </style>
  </head>
  <body>
    ${body}
  </body>
</html>
`;

export function loginPage(failed: boolean, login = ""): string {
  const error = failed ? "<p>Неверный логин или пароль</p>" : "";
  return shell(
    "Вход",
    `<form method="post" action="/login">
      <h1>Вход</h1>
      <label>Логин <input name="login" autocomplete="username" required value="${escapeHtml(login)}" /></label>
      <label>Пароль <input name="password" type="password" autocomplete="current-password" required /></label>
      ${error}
      <button type="submit">Войти</button>
    </form>`,
  );
}

export function emptyPage(title: string): string {
  return shell(
    title,
    `<form class="out" method="post" action="/logout"><button type="submit">Выйти</button></form>`,
  );
}
