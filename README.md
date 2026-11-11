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

The template sets `CUBEJS_DB_*` to the shared Postgres, `CUBEJS_API_SECRET` (also given to Formbricks),
`CUBEJS_JWT_ISSUER=formbricks-web`, `CUBEJS_JWT_AUDIENCE=formbricks-cube`, `CUBEJS_DEFAULT_API_SCOPES=meta,data`,
`CUBEJS_CACHE_AND_QUEUE_DRIVER=memory` and `CUBEJS_EXTERNAL_DEFAULT=false`, as upstream's compose does.
Railway checks `/readyz`.

To move to a newer Formbricks release, copy `docker/cube/` from that release tag and set the base image to the
Cube tag its compose file names.

The files in `cube/` come from [Formbricks](https://github.com/formbricks/formbricks) and are licensed under the
GNU AGPL v3, as is this repository (see `LICENSE`).
