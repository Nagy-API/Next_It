/** An expected, user-facing failure (validation, invalid transition). Safe to show in the UI. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

export function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new UserError(message);
}
