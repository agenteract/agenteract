package io.agenteract

import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.platform.debugInspectorInfo
import kotlinx.coroutines.launch

fun Modifier.agent(
    testID: String,
    type: String = "View",
    onTap: (() -> Unit)? = null,
    onChangeText: ((String) -> Unit)? = null,
    onScroll: ((direction: String, amount: Double) -> Unit)? = null,
    onSwipe: ((direction: String, velocity: String) -> Unit)? = null,
    onLongPress: (() -> Unit)? = null,
    text: String? = null
): Modifier = composed(
    inspectorInfo = debugInspectorInfo {
        name = "agent"
        properties["testID"] = testID
        properties["type"] = type
        properties["text"] = text
    }
) {
    val scope = rememberCoroutineScope()
    
    // Create the node definition
    val node = remember(testID, type, onTap, onChangeText, onScroll, onSwipe, onLongPress, text) {
        AgentNode(
            testID = testID,
            type = type,
            onTap = onTap,
            onChangeText = onChangeText,
            onScroll = onScroll,
            onSwipe = onSwipe,
            onLongPress = onLongPress,
            text = text
        )
    }

    DisposableEffect(node) {
        scope.launch {
            AgentRegistry.register(node)
        }
        onDispose {
            scope.launch {
                AgentRegistry.unregister(testID)
            }
        }
    }

    Modifier
}
