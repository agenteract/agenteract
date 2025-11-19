import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.Button
import androidx.compose.material.MaterialTheme
import androidx.compose.material.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.agenteract.AgentDebugBridge
import com.agenteract.agent

@Composable
fun App() {
    MaterialTheme {
        var text by remember { mutableStateOf("Hello, World!") }

        // Initialize the Agent Debug Bridge
        AgentDebugBridge(projectName = "kmp-app")

        Column(modifier = Modifier.fillMaxSize()) {
            val onButtonClick = {
                text = "Hello, Agenteract!"
                println("Button clicked via Agent or User!")
            }

            Button(
                onClick = onButtonClick,
                modifier = Modifier.agent(
                    testID = "test-button", 
                    type = "Button", 
                    onTap = onButtonClick
                )
            ) {
                Text(
                    text,
                    modifier = Modifier.agent(testID = "text-label", type = "Text", text = text)
                )
            }
        }
    }
}