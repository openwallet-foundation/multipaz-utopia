plugins {
    // this is necessary to avoid the plugins to be loaded multiple times
    // in each subproject's classloader
    alias(libs.plugins.kotlinMultiplatform) apply false
    alias(libs.plugins.jetbrains.kotlin.jvm) apply false
    alias(libs.plugins.navigation.safe.args) apply false
    alias(libs.plugins.buildconfig) apply false
    alias(libs.plugins.skie) apply false
}


