import { defineConfig } from "vite";

function pagesBase(): string {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) return "/";

  const [owner, name] = repository.split("/");
  if (!name || name === `${owner}.github.io`) return "/";

  return `/${name}/`;
}

export default defineConfig({
  base: pagesBase(),
});
