export type Role = "admin" | "worker";

export type StoredUser = {
  login: string;
  role: Role;
  passwordHash: string;
};

export const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$AhgY2tv5N237xZjh1r6nLw$QldF7T3/DG6E+rsd6YX6rmO53apuOzrydpmkUrmANhw";

export const users: StoredUser[] = [
  {
    login: "admin",
    role: "admin",
    passwordHash:
      "$argon2id$v=19$m=19456,t=2,p=1$JGGRf+9k8KJmC4qxCt7rAA$fc9cOIvE8CH5tiomxE3hWbComF864XCifZYQMFKe6sw",
  },
  {
    login: "worker",
    role: "worker",
    passwordHash:
      "$argon2id$v=19$m=19456,t=2,p=1$gPQfjJMdKVww5cqlPGk8Ug$x1sY4Mphs0TuTC5JXn34JkrOqLiIXBJwEJSQ2IcKYsM",
  },
];
