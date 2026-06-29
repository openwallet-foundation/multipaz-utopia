plugins {
    id("java-library")
    id("org.jetbrains.kotlin.jvm")
    alias(libs.plugins.kotlinSerialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.ktor)
}

application {
    mainClass.set("org.multipaz.upay.server.Main")
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
    implementation(libs.ktor.server.netty)
    implementation(libs.logback.classic)

    testImplementation(libs.junit)
}

ktor {
}

// Generates www/accounts.json (the payee dropdown) from the deployment records
// seed and wires it into processResources. See the script for details.
apply(from = "gradle/generate-accounts.gradle.kts")
