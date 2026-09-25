import { readFile } from 'node:fs/promises';
import { createApp } from './app.js';
import { createDataService } from './data.js';
const demo = process.argv.includes('--demo')
  ? JSON.parse(await readFile(new URL('../fixtures/demo.json', import.meta.url), 'utf8')) : null;
const server = createApp({ service: createDataService({ demo }) });
const port = Number(process.env.PORT ?? 3000);
server.listen(port, '0.0.0.0', () => console.log(`Park / SG running at http://localhost:${port} (${demo ? 'demo' : 'live'})`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
});
