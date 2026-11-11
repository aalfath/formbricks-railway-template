// Entry point of the Cube service in the Formbricks Railway template.
//
// 1. Databases. Formbricks runs `prisma migrate deploy`, which refuses to start on a non-empty `public`
//    schema. So Hub (and Cube, which reads Hub's tables) and SpiceDB each get their own database on the
//    same Postgres server, the way upstream's development compose separates them. Railway's Postgres
//    creates only one database, so this script creates the missing ones (BOOTSTRAP_DATABASES).
// 2. Bucket CORS. Formbricks uploads files from the browser straight to S3 with presigned POSTs, which
//    needs a CORS rule on the bucket. A new Railway bucket has none, so if BOOTSTRAP_BUCKET is set and the
//    bucket has no CORS rules yet, this script adds one (origins from BOOTSTRAP_BUCKET_CORS_ORIGINS).
//    Existing rules are left alone.
// Then it starts Cube exactly as the upstream image would. It never drops or overwrites anything.

const { Client } = require("/cube/node_modules/pg");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const list = (value) => (value || "").split(/[\s,]+/).filter(Boolean);

async function ensureDatabases() {
  const names = list(process.env.BOOTSTRAP_DATABASES);
  for (const name of names) {
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) {
      throw new Error(`BOOTSTRAP_DATABASES: invalid database name "${name}"`);
    }
  }
  if (names.length === 0) return;
  const maxAttempts = 60;
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
            console.log(`bootstrap: created database ${name}`);
          } catch (error) {
            if (error.code !== "42P04") throw error; // created meanwhile
          }
        } else {
          console.log(`bootstrap: database ${name} already exists`);
        }
      }
      await client.end();
      return;
    } catch (error) {
      await client.end().catch(() => {});
      console.error(`bootstrap: database attempt ${attempt}/${maxAttempts} failed: ${error.message}`);
      if (attempt >= maxAttempts) throw error;
      await sleep(5000);
    }
  }
}

async function ensureBucketCors() {
  const bucket = process.env.BOOTSTRAP_BUCKET;
  if (!bucket) return;
  const { S3Client, GetBucketCorsCommand, PutBucketCorsCommand } = require("@aws-sdk/client-s3");
  const s3 = new S3Client({
    region: process.env.BOOTSTRAP_BUCKET_REGION || "auto",
    endpoint: process.env.BOOTSTRAP_BUCKET_ENDPOINT,
    credentials: {
      accessKeyId: process.env.BOOTSTRAP_BUCKET_ACCESS_KEY_ID,
      secretAccessKey: process.env.BOOTSTRAP_BUCKET_SECRET_ACCESS_KEY,
    },
  });
  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      let rules = [];
      try {
        rules = (await s3.send(new GetBucketCorsCommand({ Bucket: bucket }))).CORSRules || [];
      } catch (error) {
        if (error.name !== "NoSuchCORSConfiguration") throw error;
      }
      if (rules.length > 0) {
        console.log(`bootstrap: bucket ${bucket} already has CORS rules, leaving them as they are`);
        return;
      }
      const origins = list(process.env.BOOTSTRAP_BUCKET_CORS_ORIGINS);
      await s3.send(
        new PutBucketCorsCommand({
          Bucket: bucket,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedOrigins: origins.length > 0 ? origins : ["*"],
                AllowedMethods: ["GET", "HEAD", "POST", "PUT"],
                AllowedHeaders: ["*"],
                ExposeHeaders: ["ETag"],
                MaxAgeSeconds: 3600,
              },
            ],
          },
        })
      );
      console.log(`bootstrap: added a CORS rule to bucket ${bucket}`);
      return;
    } catch (error) {
      console.error(`bootstrap: bucket CORS attempt ${attempt}/12 failed: ${error.name}: ${error.message}`);
      await sleep(5000);
    }
  }
  // Uploads fail without CORS, but Cube itself doesn't need the bucket, so start anyway.
  console.error("bootstrap: could not set the bucket CORS rule; file uploads from the browser will fail");
}

ensureDatabases()
  .then(ensureBucketCors)
  .then(() => {
    require("/cube/node_modules/@cubejs-backend/server/bin/server");
  })
  .catch((error) => {
    console.error(`bootstrap: giving up: ${error.message}`);
    process.exit(1);
  });
