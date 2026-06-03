plugins {
    id("java-library")
    id("org.jetbrains.kotlin.jvm")
    alias(libs.plugins.kotlinSerialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.ktor)
}

application {
    mainClass.set("org.multipaz.brewery.server.Main")
}

// Runtime configuration for local/dev execution.
// Usage example:
//   ./gradlew multipaz-utopia:organizations:brewery:backend:run \
//     -PbreweryBaseUrl=http://192....:8010
val breweryBaseUrl = providers.gradleProperty("breweryBaseUrl").orNull

tasks.named<JavaExec>("run") {
    // Keep the Brewery backend on its documented port.
    args("-param", "server_port=8010")

    // Override base_url when wallet/device cannot reach localhost.
    if (!breweryBaseUrl.isNullOrBlank()) {
        args("-param", "base_url=$breweryBaseUrl")
    }
}

kotlin {
    jvmToolchain(17)

    compilerOptions {
        allWarningsAsErrors = true
        optIn.add("kotlin.time.ExperimentalTime")
    }
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

dependencies {
    ksp(project(":multipaz-cbor-rpc"))
    implementation(project(":multipaz"))
    implementation(project(":multipaz-doctypes"))
    implementation(project(":multipaz-utopia"))
    implementation(project(":multipaz-longfellow"))
    implementation(project(":multipaz-server"))
    implementation(project(":multipaz-verifier"))
    implementation(project(":multipaz-verifier-server"))

    implementation(libs.kotlinx.datetime)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.kotlinx.io.bytestring)
    implementation(libs.zxing.core)
    implementation(libs.hsqldb)
    implementation(libs.mysql)
    implementation(libs.postgresql)
    implementation(libs.ktor.client.core)
    implementation(libs.ktor.client.java)
    implementation(libs.ktor.server.netty)
    implementation(libs.ktor.server.logging)
    implementation(libs.ktor.server.double.receive)
    implementation(libs.logback.classic)
    implementation(libs.nimbus.oauth2.oidc.sdk)

    testImplementation(libs.junit)
}

// Copy brewery frontend resources directly into the backend's own resource output so
// they appear on the classpath before any dependency JARs (including multipaz-verifier-server
// which ships its own www/index.html at the same path).
tasks.named<ProcessResources>("processResources") {
    from(project(":multipaz-utopia:organizations:brewery:frontend").file("src/main/resources"))
}

