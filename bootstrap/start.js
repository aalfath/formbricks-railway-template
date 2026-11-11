// Entry point of the Cube service in the Formbricks Railway template.
//
// Formbricks runs `prisma migrate deploy`, which refuses to start on a non-empty `public` schema.
// So Hub (and Cube, which reads Hub's tables) and SpiceDB each get their own database on the same
// Postgres server, the way upstream's development compose separates them. Railway's Postgres creates
// only one database, so this script creates the missing ones (BOOTSTRAP_DATABASES) and then starts
// Cube exactly as the upstream image would. It never drops or changes anything that already exists.

const { Client } = require("/cube/node_modules/pg");

const names = (process.env.BOOTSTRAP_DATABASES || "")
  .split(/[\s,]+/)
  .filter(Boolean);
const maxAttempts = 60;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureDatabases() {
  for (const name of names) {
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) {
      throw new Error(`BOOTSTRAP_DATABASES: invalid database name "${name}"`);
    }
  }
  for (let attempt = 1; ; attempt++) {
    const client = new Client({
      host: process.env.CUBEJS_DB_HOST,
      port: Number(process.env.CUBEJS_DB_PORT || 5432),
      user: process.env.CUBEJS_DB_USER,
      password: process.env.CUBEJS_DB_PASS,
      database: process.env.BOOTSTRAP_ADMIN_DATABASE || "postgres",
      connectionTimeoutMillis: 5000,
    });
    try {
      await client.connect();
      for (const name of names) {
        const found = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
        if (found.rowCount === 0) {
          try {
            await client.query(`CREATE DATABASE "${name}"`);
            console.log(`db-bootstrap: created database ${name}`);
          } catch (error) {
            if (error.code !== "42P04") throw error; // created meanwhile
          }
        } else {
          console.log(`db-bootstrap: database ${name} already exists`);
        }
      }
      await client.end();
      return;
    } catch (error) {
      await client.end().catch(() => {});
      console.error(`db-bootstrap: attempt ${attempt}/${maxAttempts} failed: ${error.message}`);
      if (attempt >= maxAttempts) throw error;
      await sleep(5000);
    }
  }
}

ensureDatabases()
  .then(() => {
    require("/cube/node_modules/@cubejs-backend/server/bin/server");
  })
  .catch((error) => {
    console.error(`db-bootstrap: giving up: ${error.message}`);
    process.exit(1);
  });
