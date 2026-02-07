package io.agenteract.kmp_example

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import io.agenteract.AgenteractContext
import io.agenteract.DeepLinkHandler

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Initialize Agenteract context
        AgenteractContext.appContext = applicationContext

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
}
