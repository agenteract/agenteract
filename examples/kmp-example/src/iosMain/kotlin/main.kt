import androidx.compose.ui.window.ComposeUIViewController
import platform.UIKit.UIViewController
import io.agenteract.kmp_example.App

fun MainViewController(): UIViewController = ComposeUIViewController { App() }