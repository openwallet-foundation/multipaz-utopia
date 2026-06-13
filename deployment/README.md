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

Then open http://localhost:8100 in your browser.

To stop: press `Ctrl+C`

### Shell in the container

```bash
# First, find the container ID
podman ps

# Then exec into it
podman exec -it <container_id> /bin/bash
```

### Accessing individual services

All services are available through the nginx proxy on port 8100:

| Service        | URL                                   |
|----------------|---------------------------------------|
| Web Frontend   | http://localhost:8100/                |
| Registry       | http://localhost:8100/registry/       |
| Utopia DMV     | http://localhost:8100/dmv/            |
| Bank of Utopia | http://localhost:8100/bank_of_utopia/ |
| UPay service   | http://localhost:8100/upay/           |
| Brewery        | http://localhost:8100/brewery/        |

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

Note: this will deploy the bundle as HTTP service on port 8000, you would still need to use your
environment to expose it as HTTP service. Also, if not running on the root of the domain (e.g.
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

| Variable | Default                 | Description                                                                     |
|----------|-------------------------|---------------------------------------------------------------------------------|
| `BASE_URL` | `http://localhost:8100` | Base URL for all services (used in protocol messages)                           |
| `MODE` | `proxy`                 | `proxy` for nginx routing, `direct` for port-only access to individual services |
| `ADMIN_PASS` | `multipaz`              | default is only used for localhost deployment, otherwise it must be specified

