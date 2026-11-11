# Formbricks Cube (analytics semantic layer) for Railway.
# Upstream's compose mounts cube.js and the model as files; Railway can't mount files,
# so this image bakes in the same files from formbricks/formbricks 6.1.4 (docker/cube),
# plus a small start script (bootstrap/start.js) that creates the Hub and SpiceDB databases
# and adds a CORS rule to the uploads bucket before starting Cube.

# The upstream Cube image has no npm, so the start script's one dependency is installed here.
FROM node:24-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8 AS bootstrap-deps
WORKDIR /bootstrap
COPY bootstrap/package.json bootstrap/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM ghcr.io/formbricks/cube:1.7.50-1@sha256:30829527cb85b0a78855991c7d03963d25d1ad11e76abbacdac7c22f269eec77

COPY cube/cube.js /cube/conf/cube.js
COPY cube/schema/ /cube/conf/model/
COPY --from=bootstrap-deps /bootstrap/node_modules /cube/bootstrap/node_modules
COPY bootstrap/start.js /cube/bootstrap/start.js

# Defaults for the template, matching upstream's compose. Railway templates can't carry fixed
# variable values, so they live here; any of them can still be overridden with a service variable.
ENV PORT=4000 \
    CUBEJS_DB_TYPE=postgres \
    CUBEJS_DB_NAME=hub \
    CUBEJS_JWT_ISSUER=formbricks-web \
    CUBEJS_JWT_AUDIENCE=formbricks-cube \
    CUBEJS_DEFAULT_API_SCOPES=meta,data \
    CUBEJS_CACHE_AND_QUEUE_DRIVER=memory \
    CUBEJS_EXTERNAL_DEFAULT=false \
    BOOTSTRAP_DATABASES="hub spicedb" \
    BOOTSTRAP_BUCKET_CORS_ORIGINS="*"

CMD ["/cube/bootstrap/start.js"]

EXPOSE 4000
