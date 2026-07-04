FROM ghcr.io/paradigmxyz/reth:latest

# Install curl for healthcheck
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Default command will be overridden by docker-compose
CMD ["node", "--help"]
