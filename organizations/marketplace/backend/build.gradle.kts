plugins {
    id("java-library")
    id("org.jetbrains.kotlin.jvm")
    alias(libs.plugins.kotlinSerialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.ktor)
}

application {
    mainClass.set("org.multipaz.marketplace.server.Main")
}

// Runtime configuration for local/dev execution.
// Usage example:
//   ./gradlew organizations:marketplace:backend:run \
//     -PmarketplaceBaseUrl=http://192....:8010
val marketplaceBaseUrl = providers.gradleProperty("marketplaceBaseUrl").orNull

tasks.named<JavaExec>("run") {
    // Override base_url when wallet/device cannot reach localhost.
    if (!marketplaceBaseUrl.isNullOrBlank()) {
        args("-param", "base_url=$marketplaceBaseUrl")
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
    ksp(libs.multipaz.cbor.rpc)
    implementation(libs.multipaz)
    implementation(libs.multipaz.doctypes)
    implementation(libs.multipaz.utopia)
    implementation(libs.multipaz.longfellow)
    implementation(libs.multipaz.server)
    implementation(libs.multipaz.verifier)

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

// to inject the utopia stylesheets and chrome script (see shared/theme/README)
tasks.named<ProcessResources>("processResources") {
    from(project(":organizations:marketplace:frontend").file("src/main/resources"))
    from(rootProject.file("shared/theme/common"))
}

