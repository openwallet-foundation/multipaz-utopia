# multipaz-utopia

Utopia is the fictional world used
across [Multipaz](https://github.com/openwallet-foundation/multipaz)
demos. This repository holds the Utopia organizations — a System of Record, two credential
issuers, and two verifiers — plus the deployment that bundles them into a single container so the
whole world can be run at once.

| Organization        | Role                                                                        | Gradle module                           | Local port | Path in the bundle        |
|---------------------|-----------------------------------------------------------------------------|-----------------------------------------|------------|---------------------------|
| **Registry**        | System of Record (identities, accounts, enrollment/IACA, payment processor) | `:organizations:registry:backend`       | 8004       | `/registry/`              |
| **Utopia DMV**      | mDL issuer (OpenID4VCI)                                                     | `:organizations:dmv:backend`            | 8002       | `/dmv/`                   |
| **Bank of Utopia**  | Payment card issuer (OpenID4VCI)                                            | `:organizations:bank_of_utopia:backend` | 8017       | `/bank_of_utopia/` (8001) |
| **UPay**            | Payment card verifier — transfers money between accounts                    | `:organizations:upay:backend`           | 8009       | `/upay/`                  |
| **Marketplace**     | Grocery storefront — payment + age-restricted checkout                      | `:organizations:marketplace:backend`    | 8010       | `/marketplace/`           |
| **Marketplace MCP** | Agentic storefront (Node/TS) over the marketplace                           | `:organizations:marketplace:mcp`        | 3005       | `/mcp` (8011)             |

Bank of Utopia is the one port that differs between the two ways of running: its own default
configuration says 8017, and the container bundle starts it on 8001.

## Prerequisites

- **JDK 17+**. Gradle provisions matching toolchains automatically.
- Nothing else. The `org.multipaz` artifacts are snapshots, resolved from the Sonatype snapshot
  repository declared in [`settings.gradle.kts`](settings.gradle.kts). `mavenLocal()` is listed
  first there, so if you are working on Multipaz itself and publish it to your local Maven
  repository (`./gradlew publishToMavenLocal` in the Multipaz checkout), your build picks up that
  copy instead of the published snapshot.

For running the full stack in a container, see [deployment/README.md](deployment/README.md) —
that path additionally needs Podman or Docker.

## Running locally

Every server runs with no arguments — port, and the Registry each one talks to, come from its own
committed defaults. Start the **Registry first**: it is the System of Record the issuers read
identity data from, the CA whose IACA root everything else enrolls with and trusts, and the host
of the payment processor both verifiers call.

```bash
./gradlew :organizations:registry:backend:run        # :8004  — start this first
./gradlew :organizations:dmv:backend:run             # :8002
./gradlew :organizations:bank_of_utopia:backend:run  # :8017
./gradlew :organizations:upay:backend:run            # :8009
./gradlew :organizations:marketplace:backend:run     # :8010
```

Run each in its own terminal; every one of them blocks. The Registry's Kotlin/JS front-end is a
separate module —
see [organizations/registry/frontend/README.md](organizations/registry/frontend/README.md).

The four non-Registry servers default to `http://localhost:8004` for both Registry URLs, which is
what makes an end-to-end local flow work out of the box:

- **`system_of_record_url`** (issuers) — where the issuer reads the person's records to build the
  credential.
- **`enrollment_server_url`** (issuers and verifiers) — the issuer enrolls its signing identity
  with the Registry's CA, and the verifier fetches the Registry's IACA root and calls its payment
  processor. Without it an issuer self-enrolls under its own root, and since UPay and the
  Marketplace trust *only* the Registry's IACA root, credentials issued that way are refused at
  presentment.

A verifier started before the Registry logs `Error loading IACA certificate from
http://localhost:8004` and carries on serving pages — the trust root is fetched once at startup, so
restart it after the Registry is up or presentment will fail.

Point a server at a Registry somewhere else with
`--args="-param enrollment_server_url=<url> -param system_of_record_url=<url>"`. Running an issuer
with no System of Record at all means editing the value out of its `default_configuration.json` —
a parameter can override a key but cannot unset it.

### Ways to run a server

Each backend is a Ktor application, so several Gradle entry points work. `:run` is the one to
reach for; the rest are useful when you want the deployable artifact rather than a Gradle-driven
process.

| Task           | What it does                                           | Parameters                                                                          |
|----------------|--------------------------------------------------------|-------------------------------------------------------------------------------------|
| `:run`         | Runs from the compiled classes. Fastest loop           | `--args="-param key=value"`                                                         |
| `:runFatJar`   | Builds the self-contained jar and runs it              | none — the Ktor task takes no `--args`, so it runs purely on the committed defaults |
| `:runShadow`   | Same, via the Shadow plugin's jar                      | `--args="-param key=value"`                                                         |
| `:buildFatJar` | Builds `build/libs/backend-all.jar` without running it | —                                                                                   |

The fat jar is self-contained, so it is also the way to run a server outside Gradle entirely, and
the only fat-jar path that takes parameters:

```bash
./gradlew :organizations:marketplace:backend:buildFatJar
java -jar organizations/marketplace/backend/build/libs/backend-all.jar \
  -param server_port=8099 -param payee_account=10000002
```

The Ktor plugin also contributes per-module `buildImage`, `runDocker`, and
`publishImageToLocalRegistry` tasks. This project does not use them — it ships every server in one
combined image instead, built from [`deployment/`](deployment/README.md).

### Registry and Trust

**The Registry is the certificate authority for the entire demo world.** No two Utopia servers
share a pre-configured public key. They bootstrap by *enrolling* with the Registry, and nearly
every trust question reduces to "does this certificate chain up to a root the Registry holds?"

```
Registry (System of Record)  =  CA + System of Record
  ├─ one self-signed root key per identity type      ← RootSigningKeyData table in its database
  ├─ serves them at  GET /ca/{identity}  and  GET /crl/{identity}
  └─ signs leaf certificates for other servers over the `enrollment` RPC

DMV, Bank             ── leaf(CREDENTIAL_SIGNING) ──►  sign mDLs and payment cards
UPay, Marketplace     ── leaf(VERIFIER)           ──►  sign presentation requests
UPay, Marketplace     ── leaf(PAYMENT_PROCESSOR)  ──►  authenticate payment RPCs
DMV, Bank             ── leaf(RECORDS_CLIENT)     ──►  authenticate to the System of Record
```

The one exception is `root_identities.payment_processor` in the Registry's
`default_configuration.json`: a static CA root (`pp-root`) shared with the
Wholesale POS sample's terminal backend, which holds a pre-issued leaf (`pp-leaf`) rather than
enrolling.

### Seeding the Registry

A fresh Registry has no identities, so issuance and payments have nothing to work with. Load the
same seed data the container image uses:

```bash
(
  echo '{'
  echo '"password": "<admin password>",'
  echo '"identities":'
  cat deployment/docker/init/records.json
  echo '}'
) | curl -H "Content-Type: application/json" -d @- http://localhost:8004/identity/load
```

Under `:run` the admin password is **`multipaz`**: the Registry, DMV, and Bank modules pin
`-param admin_password=<value>` on their `run` task, defaulting to that. Change it with a Gradle
property:

```bash
./gradlew :organizations:registry:backend:run -PadminPassword=pass
```

Any other launch path leaves the key unset, and a server with no `admin_password` **generates one
per run** and logs it at startup — copy it out of the log:

```
No 'admin_password' in config, generated: 'kFvS...'
```

That is the case for `:runFatJar` (which accepts no arguments) and for `java -jar` unless you pass
`-param admin_password=<value>` yourself. The container bundle sets it from the `ADMIN_PASS`
environment variable instead — see
[deployment/README.md](deployment/README.md#per-service-configuration).

See [deployment/docker/init/UPDATING.md](deployment/docker/init/UPDATING.md) for dumping and
merging Registry data.

### Reaching a server from a phone or emulator

`localhost` means the phone itself, so a wallet on a device or emulator cannot reach a server
advertising `http://localhost:<port>`. Override `base_url` with an address the wallet can reach:

```bash
./gradlew :organizations:marketplace:backend:run \
  -PmarketplaceBaseUrl=http://192.168.1.7:8010   # LAN IP, or http://10.0.2.2:8010 for the emulator
```

Other servers take the same override as a raw parameter:
`--args="-param base_url=http://192.168.1.7:8009"`.

## Configuration

Every server reads a flat string map assembled from three layers, each overriding the previous:

1. **`default_configuration.json`**, from `<org>/backend/src/main/resources/resources/` — the
   committed defaults, baked into the jar. This is what makes `:run` work with no arguments.
   Note that it also shadows any `default_configuration.json` shipped by the Multipaz server jar
   the module builds on.
2. **`-config <file>`** — a JSON file of the same shape. The bundle passes
   `deployment/docker/services/<service>.conf` this way.
3. **`-param <key>=<value>`** — single values, applied in command-line order, so the last one
   wins. With Gradle: `--args="-param key=value"`.

Keys used by the Utopia servers:

| Key                     | Servers                      | Meaning                                                                                                                                                                                            |
|-------------------------|------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `server_port`           | all                          | Port to listen on. Required — a server with no value anywhere fails to start                                                                                                                       |
| `base_url`              | all                          | URL the server advertises to wallets and other services. Defaults to `http://localhost:<server_port>`                                                                                              |
| `enrollment_server_url` | DMV, Bank, UPay, Marketplace | Registry URL, defaulting to `http://localhost:8004`. Issuers enroll their signing identity with its CA; verifiers fetch its IACA root and call its payment processor. Absent ⇒ issuers self-enroll |
| `system_of_record_url`  | DMV, Bank                    | Registry URL the issuer reads identity records from, defaulting to `http://localhost:8004`                                                                                                         |
| `ca_trust_servers`      | all                          | Glob patterns of servers whose credentials are trusted                                                                                                                                             |
| `admin_password`        | Registry, DMV, Bank          | Admin endpoints. `:run` pins it to `multipaz`; random per run and logged at startup on any other launch path                                                                                                                                     |
| `payee_account`         | Marketplace                  | Merchant account purchases are paid into                                                                                                                                                           |
| `database_connection`   | all                          | JDBC URL. Defaults to an HSQLDB file under `environment/db/` (see below)                                                                                                                           |

Defaults are committed per organization, and the container bundle overrides the URLs and ports with
`-param` so the same jars serve a deployment at any `BASE_URL` — see
[deployment/README.md](deployment/README.md#per-service-configuration).

### Local state

With no `database_connection`, each server keeps its data in an HSQLDB file under **its own working
directory**, created on first start: `environment/db/db.hsqldb*`. Nothing in `environment/` is
committed — it is runtime state, ignored via `db.hsqldb.*` in `.gitignore`.

Which directory that is depends on how you launch the server:

| How you run it                               | Where the data lands                                                                          | Survives a restart?              |
|----------------------------------------------|-----------------------------------------------------------------------------------------------|----------------------------------|
| `:run`, `:runFatJar`, `:runShadow`           | `organizations/<org>/backend/environment/db/` (Gradle uses the module dir as the working dir) | Yes                              |
| `java -jar …/backend-all.jar`                | `environment/db/` under whatever directory you launched from                                  | Yes                              |
| Container bundle                             | `/app/data/<service>.db` (SQLite, via `-param database_connection`)                           | Only if you mount it — see below |
| any, plus `-param database_engine=ephemeral` | nowhere; in-memory                                                                            | No                               |

So a locally seeded Registry keeps its identities, accounts and payment history across restarts. To
start from scratch, stop the server, delete its `environment` directory and  
[seed the registry](#seeding-the-registry) at the next run.

**A local run and a container run therefore behave differently on trust.** `/app/data` is an
ordinary directory in the image, so `podman run --rm` without `-v` discards it on exit: the next
container generates a **new IACA root**, re-seeds the Registry from
[`docker/init/records.json`](deployment/docker/init/records.json), and refuses credentials issued
during any earlier run, because they chain to a root that no longer exists. Mount the directory
(`-v /your/db/folder:/app/data:z`) to keep state — and the seeding step is skipped whenever
`/app/data/registry.db` already exists.

Deleting `environment/` locally has exactly the same effect, so the Registry's data directory is
the trust anchor for the whole demo: throw it away and every already-issued credential — including
ones already in a wallet — stops verifying, and the issuers need their own `environment`
directories deleted so they re-enroll against the new root.

## Repository layout

```
organizations/<org>/backend    # Ktor/Netty server
organizations/<org>/frontend   # Storefront or console assets, served off the backend classpath
organizations/marketplace/mcp  # Node/TypeScript MCP storefront, npm build driven from Gradle
shared/issuer                  # Issuer logic shared by DMV and Bank of Utopia
deployment/                    # Container image: nginx, per-service config, startup script
```

## Documentation

| Document                                                                               | Contents                                                                                |
|----------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------|
| [organizations/marketplace/README.md](organizations/marketplace/README.md)             | Marketplace checkout, age verification, payment transaction                             |
| [organizations/marketplace/mcp/README.md](organizations/marketplace/mcp/README.md)     | Agentic MCP storefront                                                                  |
| [organizations/registry/frontend/README.md](organizations/registry/frontend/README.md) | Registry front-end development                                                          |
| [deployment/README.md](deployment/README.md)                                           | Building, running, and deploying the container bundle                                   |
| [deployment/docker/init/UPDATING.md](deployment/docker/init/UPDATING.md)               | Updating Registry seed data                                                             |
| [CODING-STYLE.md](CODING-STYLE.md)                                                     | Coding style                                                                            |
