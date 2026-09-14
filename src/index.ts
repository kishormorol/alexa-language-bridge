import { config } from './config.js';
import { createApp } from './http.js';
import { HouseholdStore } from './state/store.js';
import { createLanguageProvider } from './lang/index.js';
import { HouseholdOAuthProvider } from './auth/provider.js';

const store = new HouseholdStore(config.statePath);
const language = createLanguageProvider();

const canonicalResource = new URL('/mcp', config.publicUrl).href;
const auth = config.authEnabled
  ? { provider: new HouseholdOAuthProvider(canonicalResource), publicUrl: config.publicUrl }
  : undefined;

const app = createApp({ store, language, ...(auth ? { auth } : {}) });

app.listen(config.port, config.host, () => {
  console.log(`[alexa-language-bridge] MCP on http://${config.host}:${config.port}/mcp`);
  console.log(`[alexa-language-bridge] language provider: ${language.name}`);
  console.log(
    auth
      ? `[alexa-language-bridge] OAuth 2.1 enforced for ${canonicalResource}`
      : '[alexa-language-bridge] OAuth DISABLED (AUTH_ENABLED=false)',
  );
});
