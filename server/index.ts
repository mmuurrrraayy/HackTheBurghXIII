import { createApp } from './app.js';
import { getConfig } from './config.js';
import { JsonStore } from './storage.js';

const config = getConfig();
const store = new JsonStore(config.dataDirectory);
const app = createApp({ config, store, serveFrontend: true });

app.listen(config.port, config.host, () => {
  console.log(`Labyrinth backend listening on http://localhost:${config.port}`);
  if (!config.difyApiKey) console.warn('DIFY_API_KEY is not set; Dify agents and trials are disabled.');
});
