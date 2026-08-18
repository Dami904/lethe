import { config } from "dotenv";

/**
 * Loads .env into process.env if the file exists; silently no-ops if it
 * doesn't (e.g. CI, which relies on the defaults baked into src/env.ts and
 * never sets an LLM key). Must be imported FIRST, before anything that
 * reads process.env at module-load time -- see src/server.ts and the
 * scripts under scripts/ that call an LLM directly.
 */
config();
