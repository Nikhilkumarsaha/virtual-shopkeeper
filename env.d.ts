/// <reference types="vite/client" />
/// <reference types="@remix-run/node" />

declare namespace NodeJS {
  interface ProcessEnv {
    ANTHROPIC_API_KEY: string;
    GEMINI_API_KEY: string;
    // ...existing env vars
  }
}
