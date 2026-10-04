// Utopia Marketplace MCP storefront — a Node/TypeScript module, not a JVM one.
//
// It owns its own npm build here (rather than having :deployment reach in and run npm), so the
// module that knows HOW it is built is the module itself. `:deployment` only consumes the
// `bundle` output, the same way the Docker image consumes the registry frontend's build output.
//
// The npm work runs on the BUILD HOST and the image copies the finished `bundle` — the same shape
// the registry frontend uses. Every CredentAgent dependency now resolves from the npm registry, so
// this build is reproducible anywhere; nothing here depends on a path that only exists on one
// machine.

description = "Utopia Marketplace MCP storefront (Node/TypeScript)"

val bundleDir: Provider<Directory> = layout.buildDirectory.dir("bundle")

tasks.register<Exec>("npmInstall") {
    description = "Install npm dependencies (devDependencies included — needed to compile)"
    group = "build"

    workingDir = projectDir
    commandLine("npm", "install", "--no-audit", "--no-fund")

    inputs.file("package.json")
    inputs.file("package-lock.json")
    outputs.dir("node_modules")
}

// Plain JS, so the image runs `node dist/main.js` and never needs tsx at runtime — tsx pulls in
// esbuild, whose native binary is built for this host and won't run in the container.
tasks.register<Exec>("compileTypeScript") {
    description = "Compile the TypeScript sources to plain JS in dist/"
    group = "build"
    dependsOn("npmInstall")

    workingDir = projectDir
    commandLine("npx", "tsc", "-p", "tsconfig.build.json")

    inputs.dir("src")
    inputs.file("tsconfig.build.json")
    outputs.dir("dist")
}

tasks.register<Copy>("stageBundle") {
    description = "Lay out the compiled JS + package manifest for the production install"
    group = "build"
    dependsOn("compileTypeScript")

    from("package.json")
    from("package-lock.json")
    from(layout.projectDirectory.dir("dist")) { into("dist") }
    into(bundleDir)
}

tasks.register<Exec>("bundle") {
    description = "Self-contained production bundle (compiled JS + prod-only node_modules)"
    group = "build"
    dependsOn("stageBundle")

    workingDir = bundleDir.get().asFile
    // Production-only: leaves tsx/esbuild out of the image (their native binaries are built for
    // this host, not the container). The staged lockfile makes the image reproducible.
    commandLine("npm", "ci", "--omit=dev", "--no-audit", "--no-fund")

    inputs.file("package.json")
    inputs.file("package-lock.json")
    outputs.dir(bundleDir)
}

tasks.register<Exec>("typecheck") {
    description = "Type-check the module (including tests) without emitting"
    group = "verification"
    dependsOn("npmInstall")

    workingDir = projectDir
    commandLine("npx", "tsc", "--noEmit", "-p", "tsconfig.json")
}
