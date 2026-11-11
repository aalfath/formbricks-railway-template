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
| `bootstrap/start.js` | Ours: creates the databases in `BOOTSTRAP_DATABASES` if missing, then starts Cube |

## Why the start script

Formbricks applies its schema with `prisma migrate deploy`, which refuses to run on a `public` schema that
already holds other tables. On Railway, Hub, Cube and SpiceDB can come up before Formbricks, so they can't
share Formbricks' database the way upstream's production compose does. Instead they get their own databases
on the same Postgres server (`hub` for Hub and Cube, `spicedb` for SpiceDB), as upstream's development
compose does. Railway's Postgres creates only one database, and the Hub and SpiceDB images have no `psql`,
so `bootstrap/start.js` uses the `pg` module already in the Cube image to run `CREATE DATABASE` for each
missing name, through the `postgres` maintenance database. It never drops or changes anything that exists.
Hub and SpiceDB retry their migrations until their database exists.

The template sets `CUBEJS_DB_*` to the `hub` database on the template's Postgres, `BOOTSTRAP_DATABASES=hub spicedb`, `CUBEJS_API_SECRET` (also given to Formbricks),
`CUBEJS_JWT_ISSUER=formbricks-web`, `CUBEJS_JWT_AUDIENCE=formbricks-cube`, `CUBEJS_DEFAULT_API_SCOPES=meta,data`,
`CUBEJS_CACHE_AND_QUEUE_DRIVER=memory` and `CUBEJS_EXTERNAL_DEFAULT=false`, as upstream's compose does.
Railway checks `/readyz`.

To move to a newer Formbricks release, copy `docker/cube/` from that release tag and set the base image to the
Cube tag its compose file names.

The files in `cube/` come from [Formbricks](https://github.com/formbricks/formbricks) and are licensed under the
GNU AGPL v3, as is this repository (see `LICENSE`).
