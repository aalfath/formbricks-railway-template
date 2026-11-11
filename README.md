# Formbricks Cube image for Railway

The Cube service of the Railway "Formbricks" template.

Formbricks 6 needs a [Cube](https://cube.dev) semantic layer for its analytics. Upstream's
`docker/docker-compose.yml` runs `ghcr.io/formbricks/cube` and mounts `docker/cube/cube.js` and
`docker/cube/schema/` into it. Railway services can't mount files, so this repo's `Dockerfile`
copies the same files into the same upstream image:

| What | Source |
| --- | --- |
| Base image | `ghcr.io/formbricks/cube:1.7.50-1`, pinned by digest (the tag Formbricks 6.1.4's compose uses) |
| `cube/cube.js` | `formbricks/formbricks@6.1.4:docker/cube/cube.js`, unchanged |
| `cube/schema/FeedbackRecords.js` | `formbricks/formbricks@6.1.4:docker/cube/schema/FeedbackRecords.js`, unchanged |
| `bootstrap/start.js` | Ours: one-time setup (below), then starts Cube the way the upstream image does |
| `bootstrap/package*.json` | Ours: pins `@aws-sdk/client-s3`, the start script's only dependency |

## What the start script does

It runs before Cube on every start, and never drops or overwrites anything.

1. **Creates the Hub and SpiceDB databases.** Formbricks applies its schema with `prisma migrate deploy`,
   which refuses to run on a `public` schema that already holds other tables. On Railway, Hub, Cube and SpiceDB
   come up before Formbricks, so they can't share Formbricks' database the way upstream's production compose
   does. They get their own databases on the same Postgres server instead (`hub` for Hub and Cube, `spicedb`
   for SpiceDB), as upstream's development compose does. Railway's Postgres creates only one database, and the
   Hub and SpiceDB images have no `psql`. So the script uses the `pg` module that's already in the Cube image
   to run `CREATE DATABASE` for each missing name in `BOOTSTRAP_DATABASES`, through the `postgres` maintenance
   database. Hub and SpiceDB retry their migrations until their database exists.
2. **Adds a CORS rule to the uploads bucket.** Formbricks uploads files straight from the browser to S3 with
   presigned POSTs, which needs CORS on the bucket. A new Railway bucket has no CORS rules. If
   `BOOTSTRAP_BUCKET` is set and the bucket has no rules yet, the script adds one allowing `GET`, `HEAD`,
   `POST` and `PUT` from `BOOTSTRAP_BUCKET_CORS_ORIGINS` (default `*`). The bucket stays private: every upload
   and download still needs a URL signed by Formbricks. If the bucket already has CORS rules, it leaves them
   alone, so you can set your own. A failure here is logged, and Cube starts anyway.

## Variables

The image sets these defaults, the values upstream's compose uses: `PORT=4000`, `CUBEJS_DB_TYPE=postgres`,
`CUBEJS_DB_NAME=hub`, `CUBEJS_JWT_ISSUER=formbricks-web`, `CUBEJS_JWT_AUDIENCE=formbricks-cube` (Formbricks'
own defaults), `CUBEJS_DEFAULT_API_SCOPES=meta,data`, `CUBEJS_CACHE_AND_QUEUE_DRIVER=memory`,
`CUBEJS_EXTERNAL_DEFAULT=false`, `BOOTSTRAP_DATABASES="hub spicedb"` and `BOOTSTRAP_BUCKET_CORS_ORIGINS="*"`.
They're image defaults because Railway templates can't carry fixed variable values; a service variable with
the same name overrides any of them.

The template's Cube service sets only the connection details: `CUBEJS_DB_HOST`, `CUBEJS_DB_PORT`,
`CUBEJS_DB_USER` and `CUBEJS_DB_PASS` from Postgres, `CUBEJS_API_SECRET` (shared with Formbricks), and
`BOOTSTRAP_BUCKET`, `BOOTSTRAP_BUCKET_ENDPOINT`, `BOOTSTRAP_BUCKET_REGION`, `BOOTSTRAP_BUCKET_ACCESS_KEY_ID` and
`BOOTSTRAP_BUCKET_SECRET_ACCESS_KEY` from the bucket. Railway checks `/readyz`.

## Image

`.github/workflows/image.yml` builds the image on every `v*` tag and publishes it as
`ghcr.io/aalfath/formbricks-railway-cube:<tag without v>` (for example `v6.1.4-2` → `6.1.4-2`). The template pins
it by digest, so deployers don't build anything.

## Updating

To move to a newer Formbricks release, copy `docker/cube/` from that release tag and set the base image to the
Cube tag its compose file names.

## License

The files in `cube/` come from [Formbricks](https://github.com/formbricks/formbricks) and are licensed under the
GNU AGPL v3, as is this repository (see `LICENSE`).
