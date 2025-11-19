package com.agenteract

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
                println("AgentDebugBridge: Connecting to ws://$host:$port/$projectName")
                
                client.webSocket(
                    method = HttpMethod.Get,
                    host = host,
                    port = port,
                    path = "/$projectName"
                ) {
                    println("AgentDebugBridge: Connected!")
                    
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
                                println("AgentDebugBridge: Error handling message: $e")
                                send(json.encodeToString(AgentResponse(status = "error", error = e.toString())))
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                println("AgentDebugBridge: Connection failed: $e")
            }
            
            println("AgentDebugBridge: Reconnecting in 3s...")
            delay(3000)
        }
    }
}

private suspend fun handleCommand(
    command: AgentCommand,
    json: Json,
    sendResponse: suspend (AgentResponse) -> Unit
) {
    println("Received command: ${command.action} id=${command.id}")
    
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
            // TODO: Implement log capturing
            sendResponse(AgentResponse(
                id = command.id,
                status = "success",
                logs = emptyList()
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
                // We need to dispatch this to the UI thread? 
                // Since we are in a LaunchedEffect, we are on the main dispatcher usually (in Compose)
                // But Ktor might be on IO.
                // However, `onTap` callbacks in Compose usually expect Main thread.
                // KMP `Dispatchers.Main` should be used.
                
                // Note: In simple KMP/Compose Desktop, we might be able to call it directly if we are careful.
                // But ideally we should switch to Main context.
                // For now, let's assume safe invocation or add Dispatchers.Main context switching if needed.
                
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
            // TODO: Implement scroll
             sendResponse(AgentResponse(id = command.id, status = "error", error = "Scroll not implemented"))
        }
        "swipe" -> {
            // TODO: Implement swipe
             sendResponse(AgentResponse(id = command.id, status = "error", error = "Swipe not implemented"))
        }
        else -> {
            sendResponse(AgentResponse(id = command.id, status = "error", error = "Unknown action: ${command.action}"))
        }
    }
}