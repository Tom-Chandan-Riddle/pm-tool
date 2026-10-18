import { buildApp } from './app.js';
import { parseConfig } from './shared/config.js';
import { installProcessHandlers } from './shared/lifecycle.js';

const config = parseConfig(process.env);
const app = await buildApp(config);
installProcessHandlers({ app });

await app.listen({ host: config.HOST, port: config.PORT });
