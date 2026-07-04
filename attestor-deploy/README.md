# Deploy Attestor with igra-orchestra

Run the attestor alongside an igra-orchestra node. The attestor connects to the local `rpc-provider` service via the shared Docker network.

## Prerequisites

- Docker and Docker Compose installed
- igra-orchestra running with the backend and frontend-w1 profiles:
  ```bash
  # In your igra-orchestra directory
  docker compose --profile backend --profile frontend-w1 up -d
  ```

## Setup

```bash
cd deploy
./setup.sh testnet   # or: ./setup.sh mainnet
```

The script will:

1. Create `.env` from the network-specific template
2. Verify the igra-orchestra Docker network is running
3. Ask whether to run in **direct** or **delegated** attestation mode
4. Prompt for your private key (stored in `secrets/private_key.txt`)
5. Ensure `logs/` directory has correct ownership for the container
6. Pull the latest attestor image
7. Validate configuration and RPC connectivity
8. Start the attestor container

## Management

```bash
docker compose logs -f              # Follow logs
curl -s localhost:8180 | jq          # Health status
curl -s localhost:9190 | jq          # Metrics
curl -s localhost:9190/prometheus    # Prometheus metrics
docker compose down                 # Stop attestor
```

## Configuration

Edit `.env` after setup to change optional settings:

| Variable              | Default                 | Description                     |
| --------------------- | ----------------------- | ------------------------------- |
| `ATTESTOR_VERSION`    | `2.3.2`                 | Docker image tag                |
| `HEALTH_PORT`         | `8180`                  | Health endpoint port            |
| `METRICS_PORT`        | `9190`                  | Metrics endpoint port           |
| `RUST_LOG`            | `igra_attestation=info` | Log level                       |
| `REORG_SAFETY_BLOCKS` | `30`                    | Blocks to wait before attesting |

## Delegated Attestation

Delegation lets a cold wallet (controller) authorize a hot wallet (operator) to submit attestations on its behalf. The controller's private key never touches the server.

### Generating a Delegation Signature

On the controller's machine (where the cold wallet key is available):

1. Create a temporary env file (this keeps the private key out of shell history and `ps aux`):

```bash
cat > delegation.env << 'EOF'
CONTROLLER_PRIVATE_KEY=0xYOUR_COLD_WALLET_KEY
OPERATOR_ADDRESS=0xYOUR_HOT_WALLET_ADDRESS
DELEGATION_EXPIRY=999999999
CHAIN_ID=38836
CONTRACT_ADDRESS=0xc24Df70E408739aeF6bF594fd41db4632dF49188
EOF
chmod 600 delegation.env
```

2. Run the signing container:

```bash
docker run --rm -it --env-file delegation.env \
  igranetwork/attestor:2.3.1 --sign-delegation
```

3. Delete the temporary file immediately:

```bash
rm delegation.env
```

| Variable                 | Description                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `CONTROLLER_PRIVATE_KEY` | The cold wallet's private key                                                               |
| `OPERATOR_ADDRESS`       | The hot wallet's address (the key that will be on the server)                               |
| `DELEGATION_EXPIRY`      | Block number when the authorization expires (~31,536,000 blocks per year at 1 block/second) |
| `CHAIN_ID`               | `38833` (mainnet) or `38836` (testnet)                                                      |
| `CONTRACT_ADDRESS`       | `0xc24Df70E408739aeF6bF594fd41db4632dF49188`                                                |

The command outputs three values (`CONTROLLER_ADDRESS`, `DELEGATION_EXPIRY`, `DELEGATION_SIGNATURE`) to paste during `./setup.sh`.

### Setting Up with Delegation

```bash
./setup.sh testnet   # or mainnet
# Choose option 2 (Delegated) when prompted
# Paste the controller address, expiry, and signature
# Enter the OPERATOR private key (hot wallet)
```

### Renewing an Expired Delegation

The attestor logs warnings when the delegation is approaching expiry. To renew:

1. Generate a new signature on the controller's machine (with a new expiry)
2. Edit `deploy/.env` — update `DELEGATION_EXPIRY` and `DELEGATION_SIGNATURE`
3. Restart: `docker compose down && docker compose up -d`

## Switching Networks

Remove the existing `.env` and re-run setup:

```bash
rm .env
./setup.sh mainnet
```
