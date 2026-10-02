import app from './index.js';
import { db } from './db.js';

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.LISTEN_HOST || '0.0.0.0';

await db.ready;
const { n: users } = await db.prepare(`SELECT COUNT(*) AS n FROM users`).get();
app.listen(PORT, HOST, () => {
  console.log(`\n  Udhaar · friendship ledger`);
  console.log(`  → http://${HOST}:${PORT}   (${users} accounts)\n`);
});
