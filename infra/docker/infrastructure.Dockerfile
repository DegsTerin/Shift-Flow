# en-GB: Patches the existing infrastructure images while preserving their upstream startup and data contracts.
FROM golang:1.26.7-alpine3.24@sha256:28d89ee9cc0ff9fec75c82ca201e6bf7fdf9a679d4b7b24dfa04f2bb766bb468 AS gosu-build
ENV GOTOOLCHAIN=local CGO_ENABLED=0
WORKDIR /gosu
RUN wget -T 30 -O /tmp/gosu-1.19.tar.gz https://github.com/tianon/gosu/archive/refs/tags/1.19.tar.gz \
    && echo '00ef15d982eb58d62cf67c6517d9560bb92cff5d1347f16b03e03bb3a6da08f2b85e8c3e6c23ae644f174f8da8e9154dcfe4ee379f894882e92b3602d7d079ed  /tmp/gosu-1.19.tar.gz' | sha512sum -c - \
    && tar -xzf /tmp/gosu-1.19.tar.gz --strip-components=1 -C /gosu \
    && rm /tmp/gosu-1.19.tar.gz \
    && go mod edit -go=1.26.0 -require=golang.org/x/sys@v0.44.0 \
    && go mod tidy \
    && grep -Fx 'github.com/moby/sys/user v0.1.0 h1:WmZ93f5Ux6het5iituh9x2zAG7NFY9Aqi49jjE1PaQg=' go.sum \
    && grep -Fx 'golang.org/x/sys v0.44.0 h1:ildZl3J4uzeKP07r2F++Op7E9B29JRUy+a27EibtBTQ=' go.sum \
    && go mod verify \
    && go build -trimpath -buildvcs=false -ldflags='-d -w' -o /out/gosu . \
    && go version -m /out/gosu \
    && /out/gosu --version \
    && /out/gosu nobody true

FROM postgres:16-alpine@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685 AS postgres
RUN apk add --no-cache --upgrade libcrypto3=3.5.8-r0 libssl3=3.5.8-r0 libuuid=2.42.3-r1
COPY --from=gosu-build --chmod=0755 /out/gosu /usr/local/bin/gosu
RUN gosu --version \
    && gosu nobody true \
    && test "$(readlink /usr/local/bin/su-exec)" = gosu \
    && test "$(gosu postgres id -u)" = 70

FROM redis:8.2.9-alpine@sha256:30abb90e62f14b737010746def3ba99cc79fe19dcdb3d37b41f21fc62e7da19d AS redis
RUN apk add --no-cache --upgrade libcrypto3=3.5.8-r0 libssl3=3.5.8-r0 setpriv=2.41.6-r1 \
    && redis-server --version \
    && redis-cli --version \
    && test "$(setpriv --reuid=redis --regid=redis --init-groups id -u)" = 999
