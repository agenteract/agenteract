package io.agenteract

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
data class AgentCommand(
    val id: String? = null,
    val action: String,
    val testID: String? = null,
    val value: String? = null,
    val direction: String? = null,
    val amount: Double? = null,
    val velocity: String? = null
)

@Serializable
data class AgentResponse(
    val id: String? = null,
    val status: String,
    val error: String? = null,
    val hierarchy: ViewNode? = null,
    val logs: List<LogEntry>? = null,
    val action: String? = null
)

@Serializable
data class LogEntry(
    val level: String,
    val message: String,
    val timestamp: Double
)

@Serializable
data class ViewNode(
    val name: String,
    val testID: String? = null,
    val text: String? = null,
    val children: List<ViewNode> = emptyList()
)
