# Multipaz Utopia Server Bundle Deployment

This directory contains everything needed to build and run all Multipaz Utopia
demo servers and frontends as a single container image.

## Prerequisites

- Java 17+ (for building)
- Podman or Docker (for running containers)

## Installing Podman

Podman is recommended over Docker because it's free and does not require
a license for commercial use.

### macOS

```bash
# Install Podman
brew install podman

# Initialize the Podman virtual machine (one-time setup)
# Podman runs Linux containers in a VM on macOS
podman machine init

# Start the VM
podman machine start
```

After this setup, Podman is ready to use. The VM persists across reboots, but you need to
run `podman machine start` after restarting your Mac.

**Troubleshooting:**
- If you get errors about the machine not running: `podman machine start`
- If you get permission errors: `podman machine stop && podman machine start`
- To completely reset: `podman machine rm` then `podman machine init` again

### Linux

On Linux, Podman runs natively without a VM:

```bash
# Ubuntu/Debian
sudo apt-get update && sudo apt-get install -y podman

# Fedora
sudo dnf install -y podman
```

No additional setup is required.

## Building

### Build for your machine's architecture (fastest)

```bash
./gradlew :deployment:buildDockerImage
```

### Build for a specific architecture

```bash
# For x86_64 servers (e.g., most cloud VMs)
./gradlew :deployment:buildDockerImageAmd64

# For ARM64 servers (e.g., AWS Graviton, Apple Silicon)
./gradlew :deployment:buildDockerImageArm64
```

Note: Building for a non-native architecture uses emulation and is slower.

### What gets built

The build creates a container image stored locally. View your images with:

```bash
podman images
```

You'll see entries like:
```
REPOSITORY                               TAG                  IMAGE ID      CREATED         SIZE
localhost/multipaz-utopia/server-bundle  latest               d08ca1918001  54 minutes ago  581 MB
localhost/multipaz-utopia/server-bundle  2026-06-12-17_31_24  d08ca1918001  54 minutes ago  581 MB
```

## Running Locally

```bash
podman run --rm -p 8100:8100 multipaz-utopia/server-bundle:latest
```

Then open http://localhost:8100 in your browser. On the first run the Registry is seeded from
[`docker/init/records.json`](docker/init/records.json), and the admin password is `multipaz`.

To stop: press `Ctrl+C`

There is also a `./gradlew :deployment:runDockerImage` task, but it publishes ports 8000–8010 and
not 8100, so with the default `MODE=proxy` the nginx front door is unreachable — prefer the
`podman run` above.

### Shell in the container

```bash
# First, find the container ID
podman ps

# Then exec into it
podman exec -it <container_id> /bin/bash
```

### Accessing individual services

All services are available through the nginx proxy on port 8100:

| Service          | URL                                   | Service port |
|------------------|---------------------------------------|--------------|
| Web Frontend     | http://localhost:8100/                | —            |
| Registry         | http://localhost:8100/registry/       | 8004         |
| Utopia DMV       | http://localhost:8100/dmv/            | 8002         |
| Bank of Utopia   | http://localhost:8100/bank_of_utopia/ | 8017         |
| UPay service     | http://localhost:8100/upay/           | 8009         |
| Marketplace      | http://localhost:8100/marketplace/    | 8010         |
| Marketplace MCP  | http://localhost:8100/mcp             | 8011         |

The service ports are what nginx proxies to inside the container, and what `MODE=direct` exposes
instead of the proxy. They are the same ports each server uses when run on its own from Gradle.

## Deploying to a Server

### Step 1: Export the image to a file

```bash
# For amd64 (most Linux servers)
podman save -o multipaz-utopia-server-bundle-amd64.tar multipaz-utopia/server-bundle:latest-amd64

# Or for arm64
podman save -o multipaz-utopia-server-bundle-arm64.tar multipaz-utopia/server-bundle:latest-arm64
```

This creates a `.tar` file (typically ~600 MB) containing the complete image.

### Step 2: Copy to the server

```bash
scp multipaz-utopia-server-bundle-amd64.tar user@yourserver:/path/to/destination/
```

### Step 3: Load and run on the server

On the server:

```bash
# Load the image
podman load -i multipaz-utopia-server-bundle-amd64.tar

# Run it
podman run -d --rm \
    -p 127.0.0.1:8100:8100 \
    -e BASE_URL=https://your-domain.com \
    -e ADMIN_PASS=<password> \
    multipaz-utopia/server-bundle:latest-amd64
```

The `-d` flag runs it in the background. Remove `--rm` if you want the container to persist after
stopping.

Use option `-v </your/db/folder>:/app/data:z` to mount the folder where databases are stored 
to a folder on your host machine. This way data will not be erased between the container runs.
Similarly `-v </your/logs/folder>:/app/logs:z` will ensure that log files are preserved.

Note: this will deploy the bundle as an HTTP service on port 8100, you would still need to use your
environment to expose it as HTTPS service. Also, if not running on the root of the domain (e.g.
your BASE_URL is `https://foo.com/bar` rather than `https://foo.bar`), handlers for `/.well-known` 
urls have to be mapped correctly, e.g. using ngnix for `dmv` service:
```
location = /.well-known/oauth-authorization-server/bar/dmv {
    proxy_pass http://localhost:8100/.well-known/oauth-authorization-server/dmv;
}

location = /.well-known/openid-credential-issuer/bar/dmv {
    proxy_pass http://localhost:8100/.well-known/openid-credential-issuer/dmv;
}
```

Similar setup is needed for `bank_of_utopia`.

Make sure that your domain is resolved to a correct address and not loopback. Specifically,
from withing the container in the example above, `https://foo.com` must be reachable. Some
hosting services map `foo.com` to `127.0.0.1` on the host itself, such mapping will cause problems
and must be removed at very least in the container environment.

## Configuration

### Environment Variables

Read by [`docker/start-servers.sh`](docker/start-servers.sh) and passed on to the services.

| Variable | Default | Description |
|---|---|---|
| `BASE_URL` | `http://localhost:8100` | Base URL for all services (used in protocol messages) |
| `MODE` | `proxy` | `proxy` for nginx routing, `direct` for port-only access to individual services |
| `ADMIN_PASS` | `multipaz` | Admin password for the Registry, DMV, and Bank of Utopia. The default applies only to the localhost `BASE_URL`; any other deployment must set it |
| `PAYEE_ACCOUNT` | (unset) | Merchant account the Marketplace is paid into. Unset ⇒ the demo account `10000001` from the Marketplace server's own defaults, which only exists in a Registry seeded from `docker/init/records.json` — set this to a real account for any deployment against another System of Record |
| `EXTRA_PARAMS` | (empty) | Raw `-param key=value` pairs appended to every service's command line |

### Per-service configuration

Each service builds its configuration from three layers, later ones overriding earlier:

1. **`default_configuration.json`** inside the service's own jar — the values committed under
   `organizations/<org>/backend/src/main/resources/resources/`.
2. **`docker/services/<service>.conf`**, passed as `-config`. Use these for values that belong to
   the bundle rather than to the server itself; `registry.conf` names the fictional state, and the
   rest are `{}`.
3. **`-param key=value`** from `start-servers.sh`, which is where the bundle's ports, `base_url`,
   trust globs, SQLite paths, and the environment variables above are applied. Last one wins, so
   these override both layers below.

Because layer 1 ships in the jar, a server started outside this bundle still comes up with working
defaults — see the [root README](../README.md#configuration).

