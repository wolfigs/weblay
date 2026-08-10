VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)

.PHONY: all connector server test lint docker clean

all: connector server

connector:
	cd connector && npm install --no-fund --no-audit && npm run build

server:
	CGO_ENABLED=0 go build -ldflags "-s -w -X main.version=$(VERSION)" -o bin/weblay ./cmd/weblay

test:
	go test ./...
	cd connector && npm run typecheck

lint:
	go vet ./...

docker:
	docker build --build-arg VERSION=$(VERSION) -t wolfigs/weblay:$(VERSION) -t wolfigs/weblay:latest .

clean:
	rm -rf bin connector/dist
