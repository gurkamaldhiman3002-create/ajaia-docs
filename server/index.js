import { createApp } from './app.js';
import { createDb, migrate, seed } from './db.js';

const port = Number(process.env.PORT) || 3001;
const sessionSecret = process.env.SESSION_SECRET || 'dev-only-secret-change-me';
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  console.warn('SESSION_SECRET is not set. Using an insecure default.');
}

const db = createDb();
await migrate(db);
if (await seed(db)) console.log('Seeded demo users and sample document.');

const app = createApp({ db, sessionSecret, serveClient: true });
app.listen(port, () => console.log(`Ajaia Docs listening on http://localhost:${port}`));
