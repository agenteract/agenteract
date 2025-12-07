package io.agenteract

import kotlinx.serialization.Serializable

@Serializable
data class AgenteractConfig(
    val host: String,
    val port: Int,
    val token: String? = null,
    val deviceId: String? = null
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

    private fun sanitizeConfigForLog(config: AgenteractConfig): String {
        var result = "host: ${config.host}, port: ${config.port}"
        if (config.token != null) {
            result += ", token: ****"
        }
        if (config.deviceId != null) {
            result += ", deviceId: ${config.deviceId}"
        }
        return result
    }

    fun saveConfig(config: AgenteractConfig) {
        storage.save(config)
        println("[Agenteract] Config saved: ${sanitizeConfigForLog(config)}")
    }

    fun loadConfig(): AgenteractConfig? {
        val config = storage.load()
        if (config != null) {
            println("[Agenteract] Loaded config: ${sanitizeConfigForLog(config)}")
        }
        return config
    }

    fun clearConfig() {
        storage.clear()
        println("[Agenteract] Config cleared")
    }
}

/**
 * Get device information for the current platform
 */
expect suspend fun getDeviceInfo(projectName: String, deviceId: String?): DeviceInfo
