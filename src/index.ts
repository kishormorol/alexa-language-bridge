import { config } from './config.js';
import { createApp } from './http.js';
import { HouseholdStore } from './state/store.js';
import { createLanguageProvider } from './lang/index.js';

const store = new HouseholdStore(config.statePath);
const language = createLanguageProvider();

const app = createApp({ store, language });

app.listen(config.port, config.host, () => {
  console.log(`[alexa-language-bridge] MCP on http://${config.host}:${config.port}/mcp`);
  console.log(`[alexa-language-bridge] language provider: ${language.name}`);
});
