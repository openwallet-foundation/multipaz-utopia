rootProject.name = "MultipazUtopia"
enableFeaturePreview("TYPESAFE_PROJECT_ACCESSORS")

pluginManagement {
    repositories {
        google {
            mavenContent {
                includeGroupAndSubgroups("androidx")
                includeGroupAndSubgroups("com.android")
                includeGroupAndSubgroups("com.google")
            }
        }
        mavenLocal()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven {
            url = uri("https://central.sonatype.com/repository/maven-snapshots/")
        }
        mavenLocal()
        maven("https://jitpack.io") {
            mavenContent {
                includeGroup("com.github.yuriy-budiyev")
            }
        }
        // Koog repository for Lokalize plugin worker dependencies
        maven("https://packages.jetbrains.team/maven/p/kt/koog")
    }
}
plugins {
    id("org.gradle.toolchains.foojay-resolver-convention") version("0.9.0")
}

include(":shared:issuer")
include(":organizations:bank_of_utopia:backend")
include(":organizations:dmv:backend")
include(":organizations:upay:backend")
include(":organizations:registry:frontend")
include(":organizations:registry:backend")
include(":organizations:brewery:backend")
include(":organizations:brewery:frontend")
include(":deployment")
