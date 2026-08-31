package org.multipaz.upay.server

import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.http.encodeURLPathPart
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.multipaz.rpc.backend.BackendEnvironment
import org.multipaz.rpc.backend.Configuration
import org.multipaz.server.common.enrollmentServerUrl

/**
 * Reads from the registry (the System of Record).
 *
 * The only unit in UPay that knows the registry's wire format, so a change to it lands here alone.
 */
internal object RegistryClient {
    /**
     * Fetches the balance and transaction list for an account.
     *
     * @param accountNumber the account to read, which must have come from an issuer-signed claim
     *   — never from front-end input
     * @return the registry's statement: `{balance, holder_id, holder_name, transactions}`, with
     *   transactions already ordered newest-first by the registry
     * @throws IllegalStateException if the registry URL is not configured, the registry refuses
     *   the read (for instance because the account does not exist), or it answers with something
     *   other than a JSON object
     */
    suspend fun fetchStatement(accountNumber: String): JsonObject =
        get("payment/account/${accountNumber.encodeURLPathPart()}").jsonObject

    /**
     * Fetches every identity the registry holds, each with its core fields and its full record
     * set.
     *
     * @return the registry's dump: an array of `{core, records}` objects
     * @throws IllegalStateException if the registry URL is not configured, the registry refuses
     *   the read, or it answers with something other than a JSON array
     */
    suspend fun fetchIdentityDump(): JsonArray = get("identity/dump").jsonArray

    /**
     * Performs a GET against the registry and parses the response as JSON.
     *
     * @param path the registry path to read, without a leading slash
     * @return the parsed response body
     * @throws IllegalStateException if the registry URL is not configured, or the registry
     *   answers with anything other than 200
     */
    private suspend fun get(path: String): JsonElement {
        val configuration = BackendEnvironment.getInterface(Configuration::class)!!
        // Prefer `registry_url`: enrollment_server_url is the public base URL, so using it would
        // route this server-to-server read out through the reverse proxy and back.
        val registryUrl = configuration.getValue(REGISTRY_URL) ?: configuration.enrollmentServerUrl
            ?: throw IllegalStateException("neither '$REGISTRY_URL' nor 'enrollment_server_url' is configured")
        val httpClient = BackendEnvironment.getInterface(HttpClient::class)!!
        val response = httpClient.get("$registryUrl/$path")
        if (response.status != HttpStatusCode.OK) {
            throw IllegalStateException("Registry answered ${response.status} for '$path'")
        }
        return Json.parseToJsonElement(response.bodyAsText())
    }

    /** Registry address reachable without leaving the deployment. Set by `start-servers.sh`. */
    private const val REGISTRY_URL = "registry_url"
}
