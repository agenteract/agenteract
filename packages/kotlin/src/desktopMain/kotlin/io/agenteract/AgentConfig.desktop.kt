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

/**
 * Desktop implementation of getDeviceInfo
 */
actual suspend fun getDeviceInfo(projectName: String, deviceId: String?): DeviceInfo {
    val osName = System.getProperty("os.name") ?: "Unknown"
    val osVersion = System.getProperty("os.version") ?: "Unknown"

    return DeviceInfo(
        isSimulator = false,
        deviceId = deviceId,
        bundleId = projectName,
        deviceName = osName,
        osVersion = osVersion,
        deviceModel = "Desktop"
    )
}
