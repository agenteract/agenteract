package io.agenteract

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import io.ktor.client.HttpClient
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.http.HttpMethod
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import io.ktor.websocket.send
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Composable
fun AgentDebugBridge(
    projectName: String,
    host: String = "localhost",
    port: Int = 8765,
    token: String? = null,
    onConfigUpdate: ((AgenteractConfig) -> Unit)? = null,
    onAgentLink: (suspend (String) -> Boolean)? = null
) {
    val scope = rememberCoroutineScope()

    LaunchedEffect(projectName) {
        // Load saved config with error handling
        val savedConfig = try {
            AgentConfigManager.loadConfig()
        } catch (e: Exception) {
            println("[Agenteract] Failed to load config: $e")
            null
        }

        val effectiveHost = savedConfig?.host ?: host
        val effectivePort = savedConfig?.port ?: port
        val effectiveToken = savedConfig?.token ?: token
        val effectiveDeviceId = savedConfig?.deviceId

        val client = HttpClient {
            install(WebSockets)
        }

        val json = Json {
            ignoreUnknownKeys = true
            encodeDefaults = true
        }

        while (isActive) {
            try {
                // Build WebSocket path with token and deviceId if available
                val params = mutableListOf<String>()
                if (effectiveToken != null) params.add("token=$effectiveToken")
                if (effectiveDeviceId != null) params.add("deviceId=$effectiveDeviceId")

                val pathWithParams = if (params.isNotEmpty()) {
                    "/$projectName?${params.joinToString("&")}"
                } else {
                    "/$projectName"
                }

                val maskedPath = pathWithParams
                    .replace(Regex("token=[^&]+"), "token=***")
                AgentLogger.log("AgentDebugBridge: Connecting to ws://$effectiveHost:$effectivePort$maskedPath")

                client.webSocket(
                    method = HttpMethod.Get,
                    host = effectiveHost,
                    port = effectivePort,
                    path = pathWithParams
                ) {
                    AgentLogger.log("AgentDebugBridge: Connected!")

                    // Send device info immediately after connecting
                    sendDeviceInfo(projectName, effectiveDeviceId, json) { deviceInfoMsg ->
                        send(deviceInfoMsg)
                    }

                    // Main loop
                    for (frame in incoming) {
                        if (frame is Frame.Text) {
                            val text = frame.readText()
                            try {
                                // Try to parse as a response first (for device ID message)
                                val responseResult = try {
                                    json.decodeFromString<AgentResponse>(text)
                                } catch (e: Exception) {
                                    null
                                }

                                // Check if this is a device ID message from server
                                if (responseResult != null && responseResult.status == "connected" && responseResult.deviceId != null) {
                                    val newDeviceId = responseResult.deviceId
                                    AgentLogger.log("AgentDebugBridge: Received device ID from server: $newDeviceId")

                                    // Load existing config and update with device ID
                                    val existingConfig = try {
                                        AgentConfigManager.loadConfig()
                                    } catch (e: Exception) {
                                        null
                                    }

                                    if (existingConfig != null) {
                                        val updatedConfig = existingConfig.copy(deviceId = newDeviceId)
                                        AgentConfigManager.saveConfig(updatedConfig)
                                        AgentLogger.log("AgentDebugBridge: Stored device ID for future connections")
                                    }
                                    continue
                                }

                                // Otherwise handle as command
                                val command = json.decodeFromString<AgentCommand>(text)
                                handleCommand(command, json, onAgentLink) { cmdResponse ->
                                    val responseText = json.encodeToString(cmdResponse)
                                    send(responseText)
                                }
                            } catch (e: Exception) {
                                AgentLogger.log("AgentDebugBridge: Error handling message: $e")
                                send(json.encodeToString(AgentResponse(status = "error", error = e.toString())))
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                AgentLogger.log("AgentDebugBridge: Connection failed: $e")
            }

            AgentLogger.log("AgentDebugBridge: Reconnecting in 3s...")
            delay(3000)
        }
    }
}

/**
 * Updates the stored configuration and reconnects
 */
fun updateAgentConfig(config: AgenteractConfig) {
    AgentConfigManager.saveConfig(config)
}

private suspend fun sendDeviceInfo(
    projectName: String,
    deviceId: String?,
    json: Json,
    send: suspend (String) -> Unit
) {
    try {
        val deviceInfo = getDeviceInfo(projectName, deviceId)
        val response = DeviceInfoResponse(deviceInfo = deviceInfo)
        val message = json.encodeToString(response)
        send(message)
        AgentLogger.log("AgentDebugBridge: Sent device info to server")
    } catch (e: Exception) {
        AgentLogger.log("AgentDebugBridge: Failed to send device info: $e")
    }
}

private suspend fun handleCommand(
    command: AgentCommand,
    json: Json,
    onAgentLink: (suspend (String) -> Boolean)? = null,
    sendResponse: suspend (AgentResponse) -> Unit
) {
    AgentLogger.log("Received command: ${command.action} id=${command.id}")
    
    when (command.action) {
        "getViewHierarchy" -> {
            val hierarchy = AgentRegistry.getHierarchy()
            sendResponse(AgentResponse(
                id = command.id,
                status = "success",
                hierarchy = hierarchy
            ))
        }
        "getConsoleLogs" -> {
            val logs = AgentLogger.getLogs()
            sendResponse(AgentResponse(
                id = command.id,
                status = "success",
                logs = logs
            ))
        }
        "tap" -> {
            val testID = command.testID
            if (testID == null) {
                sendResponse(AgentResponse(id = command.id, status = "error", error = "Missing testID"))
                return
            }
            
            val node = AgentRegistry.getNode(testID)
            if (node?.onTap != null) {
                try {
                    node.onTap.invoke()
                    sendResponse(AgentResponse(id = command.id, status = "ok"))
                } catch (e: Exception) {
                     sendResponse(AgentResponse(id = command.id, status = "error", error = "Tap failed: $e"))
                }
            } else {
                sendResponse(AgentResponse(id = command.id, status = "error", error = "No tap handler or node found for $testID"))
            }
        }
        "input" -> {
            val testID = command.testID
            val value = command.value
            if (testID == null || value == null) {
                 sendResponse(AgentResponse(id = command.id, status = "error", error = "Missing testID or value"))
                 return
            }
            
            val node = AgentRegistry.getNode(testID)
            if (node?.onChangeText != null) {
                try {
                    node.onChangeText.invoke(value)
                    sendResponse(AgentResponse(id = command.id, status = "ok"))
                } catch (e: Exception) {
                     sendResponse(AgentResponse(id = command.id, status = "error", error = "Input failed: $e"))
                }
            } else {
                sendResponse(AgentResponse(id = command.id, status = "error", error = "No input handler found for $testID"))
            }
        }
        "scroll" -> {
             val testID = command.testID
             val direction = command.direction
             val amount = command.amount ?: 100.0
             
             if (testID == null || direction == null) {
                 sendResponse(AgentResponse(id = command.id, status = "error", error = "Missing testID or direction"))
                 return
             }
             
             val node = AgentRegistry.getNode(testID)
             if (node?.onScroll != null) {
                 try {
                     node.onScroll.invoke(direction, amount)
                     sendResponse(AgentResponse(id = command.id, status = "ok"))
                 } catch (e: Exception) {
                      sendResponse(AgentResponse(id = command.id, status = "error", error = "Scroll failed: $e"))
                 }
             } else {
                 sendResponse(AgentResponse(id = command.id, status = "error", error = "No scroll handler found for $testID"))
             }
        }
        "swipe" -> {
            val testID = command.testID
             val direction = command.direction
             val velocity = command.velocity ?: "medium"
             
             if (testID == null || direction == null) {
                 sendResponse(AgentResponse(id = command.id, status = "error", error = "Missing testID or direction"))
                 return
             }
             
             val node = AgentRegistry.getNode(testID)
             if (node?.onSwipe != null) {
                 try {
                     node.onSwipe.invoke(direction, velocity)
                     sendResponse(AgentResponse(id = command.id, status = "ok"))
                 } catch (e: Exception) {
                      sendResponse(AgentResponse(id = command.id, status = "error", error = "Swipe failed: $e"))
                 }
             } else {
                 sendResponse(AgentResponse(id = command.id, status = "error", error = "No swipe handler found for $testID"))
             }
        }
        "longPress" -> {
            val testID = command.testID
            if (testID == null) {
                sendResponse(AgentResponse(id = command.id, status = "error", error = "Missing testID"))
                return
            }
            
            val node = AgentRegistry.getNode(testID)
            if (node?.onLongPress != null) {
                try {
                    node.onLongPress.invoke()
                    sendResponse(AgentResponse(id = command.id, status = "ok"))
                } catch (e: Exception) {
                     sendResponse(AgentResponse(id = command.id, status = "error", error = "Long press failed: $e"))
                }
            } else {
                sendResponse(AgentResponse(id = command.id, status = "error", error = "No long press handler found for $testID"))
            }
        }
        "agentLink" -> {
            val payload = command.payload
            if (payload == null) {
                sendResponse(AgentResponse(id = command.id, status = "error", error = "Missing payload"))
                return
            }
            
            if (onAgentLink != null) {
                try {
                    val handled = onAgentLink.invoke(payload)
                    if (handled) {
                        AgentLogger.log("AgentLink handled by app")
                        sendResponse(AgentResponse(id = command.id, status = "ok"))
                    } else {
                        AgentLogger.log("AgentLink not handled by app")
                        sendResponse(AgentResponse(id = command.id, status = "error", error = "agentLink not handled by app"))
                    }
                } catch (e: Exception) {
                    AgentLogger.log("Error in agentLink handler: $e")
                    sendResponse(AgentResponse(id = command.id, status = "error", error = "Error in agentLink handler: $e"))
                }
            } else {
                sendResponse(AgentResponse(id = command.id, status = "error", error = "No agentLink handler configured"))
            }
        }
        else -> {
            sendResponse(AgentResponse(id = command.id, status = "error", error = "Unknown action: ${command.action}"))
        }
    }
}
