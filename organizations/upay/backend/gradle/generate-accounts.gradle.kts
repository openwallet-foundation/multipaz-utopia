import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import org.gradle.api.tasks.SourceSetContainer

// Generator for www/accounts.json — the list of eligible payee accounts shown in
// the UPay page's dropdown. It is DERIVED from the deployment records seed so the
// dropdown can never drift from the accounts the records server actually knows
// about. The output is a generated resource (not committed); it is regenerated on
// every build and bundled into the server jar via processResources.
//
// Applied from build.gradle.kts: `apply(from = "gradle/generate-accounts.gradle.kts")`.

val recordsSeed = rootProject.file("deployment/docker/init/records.json")
val generatedResourcesDir = layout.buildDirectory.dir("generated/upay-accounts")

val generateUpayAccounts = tasks.register("generateUpayAccounts") {
    description = "Derives www/accounts.json (UPay payee dropdown) from deployment/docker/init/records.json"
    group = "build"
    inputs.file(recordsSeed)
    outputs.dir(generatedResourcesDir)

    doLast {
        @Suppress("UNCHECKED_CAST")
        val people = JsonSlurper().parse(recordsSeed) as List<Map<String, Any?>>

        val accounts = people.flatMap { person ->
            val core = person["core"] as? Map<String, Any?> ?: emptyMap()
            val fullName = listOfNotNull(core["given_name"], core["family_name"])
                .joinToString(" ") { it.toString().trim() }
                .trim()

            val records = person["records"] as? Map<String, Any?> ?: emptyMap()
            val payment = records["payment"] as? Map<String, Any?> ?: emptyMap()

            payment.values.mapNotNull { raw ->
                val card = raw as? Map<String, Any?> ?: return@mapNotNull null
                val account = card["account_number"]?.toString()?.takeIf { it.isNotBlank() }
                    ?: return@mapNotNull null
                val holder = card["holder_name"]?.toString()?.takeIf { it.isNotBlank() } ?: fullName
                val title = card["instance_title"]?.toString()?.takeIf { it.isNotBlank() } ?: "Account"
                val label = listOf(holder, title).filter { it.isNotBlank() }.joinToString(" — ")
                linkedMapOf("account_number" to account, "label" to label)
            }
        }

        val outFile = generatedResourcesDir.get().file("resources/www/accounts.json").asFile
        outFile.parentFile.mkdirs()
        outFile.writeText(JsonOutput.prettyPrint(JsonOutput.toJson(accounts)) + "\n")
        logger.lifecycle("generateUpayAccounts: wrote ${accounts.size} accounts to $outFile")
    }
}

// Make the generated file part of the main resources so it lands in the jar...
configure<SourceSetContainer> {
    named("main") {
        resources.srcDir(generatedResourcesDir)
    }
}

// ...and ensure it is generated whenever resources are processed (which the jar
// task — and therefore the docker build — depend on).
tasks.named("processResources") {
    dependsOn(generateUpayAccounts)
}
