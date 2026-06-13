# Registry Frontend

This directory contains code for the Utopia Registry Web front-end. It is a Kotlin/JS React
application that uses Kotlin to JavaScript compilation.

Normally it runs as a part of the overall Utopia server bundle as built using `deployment` project.

### Development server with hot reload

```bash
./gradlew :organizations:registry:frontend:jsBrowserDevelopmentRun --continuous
```

Opens at http://localhost:3000. Changes to Kotlin files auto-reload.

Back-end services must be manually started and will be proxied to the port 3000.

NB: only `records` services are proxied at this point.

### Production build only

```bash
./gradlew :organizations:registry:frontend:jsBrowserDistribution
```

Output is in `organizations/registry/frontend/build/dist/js/productionExecutable`.
