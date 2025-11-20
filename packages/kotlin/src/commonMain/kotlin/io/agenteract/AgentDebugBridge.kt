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
fun AgentDebugBridge(projectName: String, host: String = "localhost", port: Int = 8765) {
    val scope = rememberCoroutineScope()

    LaunchedEffect(projectName) {
        val client = HttpClient {
            install(WebSockets)
        }

        val json = Json { 
            ignoreUnknownKeys = true 
            encodeDefaults = true
        }

        while (isActive) {
            try {
                AgentLogger.log("AgentDebugBridge: Connecting to ws://$host:$port/$projectName")
                
                client.webSocket(
                    method = HttpMethod.Get,
                    host = host,
                    port = port,
                    path = "/$projectName"
                ) {
                    AgentLogger.log("AgentDebugBridge: Connected!")
                    
                    // Main loop
                    for (frame in incoming) {
                        if (frame is Frame.Text) {
                            val text = frame.readText()
                            try {
                                val command = json.decodeFromString<AgentCommand>(text)
                                handleCommand(command, json) { response ->
                                    val responseText = json.encodeToString(response)
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

private suspend fun handleCommand(
    command: AgentCommand,
    json: Json,
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
        else -> {
            sendResponse(AgentResponse(id = command.id, status = "error", error = "Unknown action: ${command.action}"))
        }
    }
}
