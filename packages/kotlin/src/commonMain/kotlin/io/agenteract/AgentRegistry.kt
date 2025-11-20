package io.agenteract

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class AgentNode(
    val testID: String,
    val type: String = "View",
    val onTap: (() -> Unit)? = null,
    val onChangeText: ((String) -> Unit)? = null,
    val onScroll: ((direction: String, amount: Double) -> Unit)? = null,
    val onSwipe: ((direction: String, velocity: String) -> Unit)? = null,
    val onLongPress: (() -> Unit)? = null,
    val text: String? = null,
    val children: List<String> = emptyList() // potentially track children IDs if we can
)

object AgentRegistry {
    private val nodes = mutableMapOf<String, AgentNode>()
    private val mutex = Mutex()

    suspend fun register(node: AgentNode) {
        mutex.withLock {
            nodes[node.testID] = node
        }
    }

    suspend fun unregister(testID: String) {
        mutex.withLock {
            nodes.remove(testID)
        }
    }

    suspend fun getNode(testID: String): AgentNode? {
        mutex.withLock {
            return nodes[testID]
        }
    }

    suspend fun getAllTestIDs(): List<String> {
        mutex.withLock {
            return nodes.keys.toList()
        }
    }
    
    suspend fun getHierarchy(): ViewNode {
        mutex.withLock {
            // Since we don't have a real tree structure from the Modifier approach easily,
            // we return a flat list under a root or try to reconstruct if possible.
            // For now, flat list under "AgentRegistry" node is a good start, similar to Swift's fallback.
            
            val children = nodes.values.map { node ->
                ViewNode(
                    name = node.type,
                    testID = node.testID,
                    text = node.text,
                    children = emptyList()
                )
            }
            
            return ViewNode(
                name = "Root",
                testID = "root",
                children = listOf(
                    ViewNode(
                        name = "AgentRegistry",
                        children = children
                    )
                )
            )
        }
    }
}
