package io.agenteract

import android.content.Intent
import android.net.Uri

/**
 * Helper to parse Agenteract deep links from Android Intents
 *
 * Expected format: scheme://agenteract/config?host=...&port=...&token=...
 */
object DeepLinkHandler {
    /**
     * Custom deep link handler callback
     * Return true if the deep link was handled, false to let DeepLinkHandler process it
     */
    var customHandler: ((Uri) -> Boolean)? = null

    /**
     * Parse an Intent for Agenteract configuration deep link
     *
     * @param intent The Intent to parse (usually from Activity.onNewIntent or onCreate)
     * @return AgenteractConfig if the intent contains a valid config deep link, null otherwise
     */
    fun parseIntent(intent: Intent?): AgenteractConfig? {
        if (intent?.action != Intent.ACTION_VIEW) {
            return null
        }

        val uri = intent.data ?: return null
        
        // Call custom handler first if provided
        if (customHandler != null) {
            val handled = customHandler?.invoke(uri) ?: false
            if (handled) {
                println("[Agenteract] Deep link handled by app: $uri")
                return null
            }
        }
        
        return parseUri(uri)
    }

    /**
     * Parse a Uri for Agenteract configuration
     *
     * @param uri The Uri to parse
     * @return AgenteractConfig if valid, null otherwise
     */
    fun parseUri(uri: Uri): AgenteractConfig? {
        println("[Agenteract] Received deep link: $uri")
        println("[Agenteract]   scheme: ${uri.scheme}")
        println("[Agenteract]   host: ${uri.host}")
        println("[Agenteract]   path: ${uri.path}")
        println("[Agenteract]   query: ${uri.query}")
        println("[Agenteract]   fragment: ${uri.fragment}")

        // Check if this is an agenteract config link
        // Host should be "agenteract" and path should contain "config"
        val uriHost = uri.host ?: ""
        val path = uri.path ?: ""
        if (uriHost != "agenteract" || !path.contains("config")) {
            println("[Agenteract] Not an agenteract config link (host: $uriHost, path: $path)")
            return null
        }

        val host = uri.getQueryParameter("host")
        val portStr = uri.getQueryParameter("port")
        val token = uri.getQueryParameter("token")

        println("[Agenteract] Query parameters: host=$host, port=$portStr, token=${token?.take(8)}...")

        if (host == null || portStr == null) {
            println("[Agenteract] Missing required parameters (host or port)")
            return null
        }

        val port = portStr.toIntOrNull()
        if (port == null) {
            println("[Agenteract] Invalid port: $portStr")
            return null
        }

        val config = AgenteractConfig(
            host = host,
            port = port,
            token = token
        )

        println("[Agenteract] Parsed config: $host:$port")
        return config
    }

    /**
     * Handle deep link and save configuration
     *
     * Call this from your Activity's onCreate or onNewIntent:
     *
     * ```kotlin
     * override fun onNewIntent(intent: Intent?) {
     *     super.onNewIntent(intent)
     *     DeepLinkHandler.handleIntent(intent)
     * }
     * ```
     */
    fun handleIntent(intent: Intent?): Boolean {
        val config = parseIntent(intent) ?: return false
        println("[Agenteract] Saving config from deep link: ${config.host}:${config.port}")
        AgentConfigManager.saveConfig(config)
        return true
    }
}
