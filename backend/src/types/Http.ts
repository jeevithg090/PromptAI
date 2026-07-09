/** Hono context variable bindings shared across handlers/middleware. */
export interface AppEnv {
  Variables: {
    userId: string;
  };
}
