package io.agenteract

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Desktop implementation using in-memory storage
 * (Could be upgraded to file-based storage if needed)
 */
actual class ConfigStorage {
    private val json = Json { ignoreUnknownKeys = true }
    private var config: AgenteractConfig? = null

    actual fun save(config: AgenteractConfig) {
        this.config = config
    }

    actual fun load(): AgenteractConfig? {
        return config
    }

    actual fun clear() {
        config = null
    }
}
