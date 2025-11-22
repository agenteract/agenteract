package io.agenteract

import kotlinx.serialization.Serializable

@Serializable
data class AgenteractConfig(
    val host: String,
    val port: Int,
    val token: String? = null
)

/**
 * Platform-specific configuration storage
 *
 * On Android: Uses SharedPreferences
 * On Desktop: Could use file storage or in-memory
 */
expect class ConfigStorage() {
    fun save(config: AgenteractConfig)
    fun load(): AgenteractConfig?
    fun clear()
}

/**
 * Singleton accessor for config storage
 */
object AgentConfigManager {
    private val storage = ConfigStorage()

    fun saveConfig(config: AgenteractConfig) {
        storage.save(config)
        println("[Agenteract] Config saved: ${config.host}:${config.port}")
    }

    fun loadConfig(): AgenteractConfig? {
        val config = storage.load()
        if (config != null) {
            println("[Agenteract] Loaded config: ${config.host}:${config.port}")
        }
        return config
    }

    fun clearConfig() {
        storage.clear()
        println("[Agenteract] Config cleared")
    }
}
