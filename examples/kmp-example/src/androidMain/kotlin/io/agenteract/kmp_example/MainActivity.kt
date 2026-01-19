package io.agenteract.kmp_example

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.lifecycleScope
import io.agenteract.AgentLogger
import io.agenteract.AgenteractContext
import io.agenteract.DeepLinkHandler
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Initialize Agenteract context
        AgenteractContext.appContext = applicationContext

        // Set up custom deep link handler
        DeepLinkHandler.customHandler = { uri ->
            handleCustomDeepLink(uri)
        }

        // Handle deep link if present
        DeepLinkHandler.handleIntent(intent)

        setContent {
            App()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // Handle deep links when app is already running
        DeepLinkHandler.handleIntent(intent)
    }
    
    private fun handleCustomDeepLink(uri: Uri): Boolean {
        println("[MainActivity] Handling custom deep link: $uri")
        
        // Handle reset_state deep link
        if (uri.host == "reset_state" || uri.path?.contains("reset_state") == true) {
            AppResetTrigger.reset()
            lifecycleScope.launch {
                AgentLogger.log("App state cleared")
            }
            return true
        }
        
        // Let DeepLinkHandler process config links
        return false
    }
}
