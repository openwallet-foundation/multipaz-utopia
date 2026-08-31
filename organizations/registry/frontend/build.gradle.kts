import org.jetbrains.kotlin.gradle.targets.js.webpack.KotlinWebpackConfig

plugins {
    alias(libs.plugins.kotlinMultiplatform)
}

val disableWebTargets = project.properties["disable.web.targets"]?.toString()?.toBoolean() ?: false

// Utopia theming. Every other service picks the shared design tokens up off the
// JVM classpath via processResources, but this front-end is served by nginx from
// /app/web (Dockerfile copies build/dist/js/productionExecutable there), so the
// token file has to be staged into the browser distribution instead. Registering
// the staging directory as a jsMain resources srcDir puts utopia-theme.css next
// to registry.css in the output, which is what the `@import` at the top of
// registry.css resolves against. See shared/theme/README.md.
val stageUtopiaTheme = tasks.register<Copy>("stageUtopiaTheme") {
    description = "Stages the shared Utopia design tokens into the browser distribution"
    group = "build"
    from(rootProject.file("shared/theme/common/resources/www"))
    into(layout.buildDirectory.dir("generated/utopia-theme"))
}

kotlin {
    if (!disableWebTargets) {
        js(IR) {
            // This is for running in the browser, not server/node.js
            browser {
                commonWebpackConfig {
                    cssSupport { enabled.set(true) }
                    outputFileName = "registry-web.js"
                }
                runTask {
                    // This defines how to run the front-end in development environment
                    devServerProperty.set(
                        KotlinWebpackConfig.DevServer(
                            port = 3000,
                            open = false,
                            static = mutableListOf(
                                file("src/jsMain/resources").path,
                                // Keeps the dev server in step with production: without
                                // this, registry.css's `@import "utopia-theme.css"` 404s
                                // under jsBrowserDevelopmentRun and the page renders
                                // unthemed.
                                layout.buildDirectory.dir("generated/utopia-theme").get().asFile.path
                            ),
                            proxy = mutableListOf(
                                // Hook locally-running records server
                                KotlinWebpackConfig.DevServer.Proxy(
                                    context = mutableListOf("/records/"),
                                    target = "http://localhost:8004/",
                                    pathRewrite = mutableMapOf(
                                        "^/records/" to ""
                                    )
                                ),

                                )
                        )
                    )
                }
            }
            binaries.executable()
        }

        sourceSets {
            val jsMain by getting {
                // Passing the TaskProvider (rather than a bare path) is what wires
                // stageUtopiaTheme into jsProcessResources as a dependency.
                resources.srcDir(stageUtopiaTheme)

                dependencies {
                    // Multipaz library (provides Crypto, toBase64Url, etc.)
                    implementation(libs.multipaz)

                    // Kotlin React wrappers
                    implementation(libs.kotlin.wrappers.react)
                    implementation(libs.kotlin.wrappers.react.dom)
                    implementation(libs.kotlin.wrappers.emotion.react.js)
                }
            }
        }
    }
}

// The dev server serves the staged directory straight off disk (see the `static`
// list above) rather than through jsProcessResources, so it has to exist before
// the run task starts. `matching` is lazy, so this is a no-op when web targets
// are disabled.
tasks.matching { it.name.startsWith("jsBrowser") }.configureEach {
    dependsOn(stageUtopiaTheme)
}
