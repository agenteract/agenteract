package io.agenteract

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import platform.Foundation.NSUserDefaults

/**
 * iOS implementation using NSUserDefaults
 */
actual class ConfigStorage {
    private val userDefaults = NSUserDefaults.standardUserDefaults
    private val json = Json { ignoreUnknownKeys = true }

    actual fun save(config: AgenteractConfig) {
        try {
            val configJson = json.encodeToString(config)
            userDefaults.setObject(configJson, forKey = KEY_CONFIG)
            userDefaults.synchronize()
        } catch (e: Exception) {
            println("[Agenteract] Failed to save config: $e")
        }
    }

    actual fun load(): AgenteractConfig? {
        return try {
            val configJson = userDefaults.stringForKey(KEY_CONFIG) ?: return null
            json.decodeFromString<AgenteractConfig>(configJson)
        } catch (e: Exception) {
            println("[Agenteract] Failed to parse saved config: $e")
            null
        }
    }

    actual fun clear() {
        try {
            userDefaults.removeObjectForKey(KEY_CONFIG)
            userDefaults.synchronize()
        } catch (e: Exception) {
            println("[Agenteract] Failed to clear config: $e")
        }
    }

    companion object {
        private const val KEY_CONFIG = "com.agenteract.config"
    }
}
