declare global {
  interface Error {
    code?: string;
    refusal?: unknown;
    intelligence?: unknown;
    missing?: unknown;
  }
}

export {};
