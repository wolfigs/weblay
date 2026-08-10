# --- Connector build ---
FROM node:22-alpine AS connector
WORKDIR /src/connector
COPY connector/package.json connector/package-lock.json* ./
RUN npm install --no-fund --no-audit
COPY connector/ ./
COPY web/ /src/web/
RUN npm run build

# --- Server build ---
FROM golang:1.23-alpine AS server
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=connector /src/web/connector/weblay.js web/connector/weblay.js
ARG VERSION=dev
RUN CGO_ENABLED=0 go build -ldflags "-s -w -X main.version=${VERSION}" -o /weblay ./cmd/weblay

# --- Runtime ---
FROM alpine:3.20
RUN adduser -D -H weblay && apk add --no-cache ca-certificates
USER weblay
VOLUME /data
EXPOSE 8787
ENV WEBLAY_DATA=/data
ENTRYPOINT ["/usr/local/bin/weblay"]
CMD ["serve"]
COPY --from=server /weblay /usr/local/bin/weblay
