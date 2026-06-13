plugins {
    id("java-library")
    id("org.jetbrains.kotlin.jvm")
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
    implementation(libs.multipaz)
    implementation(libs.multipaz.openid4vci)

    implementation(libs.kotlinx.coroutines.core)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
}
