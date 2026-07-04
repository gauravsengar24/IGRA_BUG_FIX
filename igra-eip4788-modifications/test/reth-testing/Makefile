.PHONY: help up down logs ps test compile clean build

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build Docker images
	./scripts/build-images.sh

up: ## Start the EL/CL testnet
	docker compose -f docker/docker-compose.yml up -d

down: ## Stop the EL/CL testnet
	docker compose -f docker/docker-compose.yml down

logs: ## Show logs from all containers
	docker compose -f docker/docker-compose.yml logs -f

ps: ## Show container status
	docker compose -f docker/docker-compose.yml ps

test: ## Run tests
	./scripts/run-tests.sh

compile: ## Compile contracts
	cd ../common && npm run compile

clean: ## Clean generated files
	rm -rf ../common/artifacts ../common/cache node_modules
	docker compose -f docker/docker-compose.yml down -v
