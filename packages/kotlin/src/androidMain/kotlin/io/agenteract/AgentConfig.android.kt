package io.agenteract

import android.content.Context
import android.content.SharedPreferences
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Android implementation using SharedPreferences
 */
actual class ConfigStorage {
    private val prefs: SharedPreferences?
        get() = try {
            val context = AgenteractContext.appContext ?: return null
            context.getSharedPreferences("agenteract_config", Context.MODE_PRIVATE)
        } catch (e: Exception) {
            println("[Agenteract] Failed to get SharedPreferences: $e")
            null
        }

    private val json = Json { ignoreUnknownKeys = true }

    actual fun save(config: AgenteractConfig) {
        try {
            val configJson = json.encodeToString(config)
            prefs?.edit()?.putString(KEY_CONFIG, configJson)?.apply()
        } catch (e: Exception) {
            println("[Agenteract] Failed to save config: $e")
        }
    }

    actual fun load(): AgenteractConfig? {
        return try {
            val configJson = prefs?.getString(KEY_CONFIG, null) ?: return null
            json.decodeFromString<AgenteractConfig>(configJson)
        } catch (e: Exception) {
            println("[Agenteract] Failed to parse saved config: $e")
            null
        }
    }

    actual fun clear() {
        try {
            prefs?.edit()?.remove(KEY_CONFIG)?.apply()
        } catch (e: Exception) {
            println("[Agenteract] Failed to clear config: $e")
        }
    }

    companion object {
        private const val KEY_CONFIG = "config"
    }
}

/**
 * Holds application context for Android-specific features
 */
object AgenteractContext {
    var appContext: Context? = null
}

/**
 * Android implementation of getDeviceInfo
 */
actual suspend fun getDeviceInfo(projectName: String, deviceId: String?): DeviceInfo {
    val isSimulator = android.os.Build.FINGERPRINT.contains("generic") ||
                     android.os.Build.FINGERPRINT.contains("emulator") ||
                     android.os.Build.MODEL.contains("sdk") ||
                     android.os.Build.MODEL.contains("Emulator")

    val deviceModel = android.os.Build.MODEL
    val deviceName = if (android.os.Build.MANUFACTURER.isNotBlank()) {
        "${android.os.Build.MANUFACTURER} $deviceModel"
    } else {
        deviceModel
    }
    val osVersion = android.os.Build.VERSION.RELEASE

    return DeviceInfo(
        isSimulator = isSimulator,
        deviceId = deviceId,
        bundleId = projectName,
        deviceName = deviceName,
        osVersion = osVersion,
        deviceModel = deviceModel
    )
}
