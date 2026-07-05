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
COPY --from=connector /src/web/connector/inlay.js web/connector/inlay.js
ARG VERSION=dev
RUN CGO_ENABLED=0 go build -ldflags "-s -w -X main.version=${VERSION}" -o /inlay ./cmd/inlay

# --- Runtime ---
FROM alpine:3.20
RUN adduser -D -H inlay && apk add --no-cache ca-certificates
USER inlay
VOLUME /data
EXPOSE 8787
ENV INLAY_DATA=/data
ENTRYPOINT ["/usr/local/bin/inlay"]
CMD ["serve"]
COPY --from=server /inlay /usr/local/bin/inlay
