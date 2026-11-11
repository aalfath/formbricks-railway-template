# Formbricks Cube (analytics semantic layer) for Railway.
# Upstream's compose mounts cube.js and the model as files; Railway can't mount files,
# so this image bakes in the same files from formbricks/formbricks 6.1.4 (docker/cube).
FROM ghcr.io/formbricks/cube:1.7.50-1@sha256:30829527cb85b0a78855991c7d03963d25d1ad11e76abbacdac7c22f269eec77

COPY cube/cube.js /cube/conf/cube.js
COPY cube/schema/ /cube/conf/model/

EXPOSE 4000
