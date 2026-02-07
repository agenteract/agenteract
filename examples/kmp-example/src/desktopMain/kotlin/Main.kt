import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application
import io.agenteract.kmp_example.App

fun main() = application {
    Window(onCloseRequest = ::exitApplication, title = "Agenteract KMP Example") {
        App()
    }
}
