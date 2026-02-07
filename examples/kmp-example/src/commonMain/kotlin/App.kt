package io.agenteract.kmp_example

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.Button
import androidx.compose.material.ButtonDefaults
import androidx.compose.material.FloatingActionButton
import androidx.compose.material.Icon
import androidx.compose.material.MaterialTheme
import androidx.compose.material.OutlinedTextField
import androidx.compose.material.Scaffold
import androidx.compose.material.Text
import androidx.compose.material.TopAppBar
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.agenteract.AgentDebugBridge
import io.agenteract.agent
import io.agenteract.AgentLogger
import kotlinx.coroutines.launch

@Composable
fun App() {
    MaterialTheme {
        val coroutineScope = rememberCoroutineScope()
        
        // State management
        var counter by remember { mutableStateOf(0) }
        var inputText by remember { mutableStateOf("") }
        var longPressCount by remember { mutableStateOf(0) }
        var swipeCount by remember { mutableStateOf(0) }
        var lastSwipeDirection by remember { mutableStateOf("") }
        
        val verticalScrollState = rememberScrollState()
        val horizontalListState = rememberLazyListState()
        val verticalListState = rememberLazyListState()
        
        fun log(message: String) {
            coroutineScope.launch {
                AgentLogger.log(message)
            }
        }
        
        fun resetAll() {
            counter = 0
            inputText = ""
            longPressCount = 0
            swipeCount = 0
            lastSwipeDirection = ""
            coroutineScope.launch {
                horizontalListState.scrollToItem(0)
            }
            log("All values reset")
        }

        // Initialize the Agent Debug Bridge
        AgentDebugBridge(
            projectName = "kmp-app",
            onAgentLink = { url ->
                // Parse agentLink URL by hostname
                // For example: agenteract://reset_state
                val hostname = url.substringAfter("://").substringBefore("?").substringBefore("/")
                when (hostname) {
                    "reset_state" -> {
                        resetAll()
                        coroutineScope.launch {
                            AgentLogger.log("App state cleared")
                        }
                        true
                    }
                    else -> false
                }
            }
        )

        Scaffold(
            topBar = {
                TopAppBar(
                    title = { 
                        Text(
                            "Agenteract KMP Demo", 
                            modifier = Modifier.agent(testID = "app-title", type = "Text", text = "Agenteract KMP Demo")
                        ) 
                    }
                )
            },
            floatingActionButton = {
                FloatingActionButton(
                    onClick = { 
                        counter++ 
                        log("Counter incremented to $counter")
                    },
                    modifier = Modifier.agent(
                        testID = "increment-button",
                        type = "Button",
                        onTap = { 
                            counter++ 
                            log("Counter incremented to $counter")
                        }
                    )
                ) {
                    Icon(Icons.Filled.Add, contentDescription = "Increment")
                }
            }
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(verticalScrollState)
                    .padding(16.dp)
            ) {
                // Tap Example
                SectionContainer {
                    Text(
                        "Tap Example", 
                        fontSize = 18.sp, 
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.agent("tap-example-title", text = "Tap Example")
                    )
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "You have pushed the button this many times:",
                        modifier = Modifier.agent("counter-label", text = "You have pushed the button this many times:")
                    )
                    Text(
                        "$counter",
                        style = MaterialTheme.typography.h4,
                        modifier = Modifier.agent("counter-value", text = "$counter")
                    )
                }

                Spacer(Modifier.height(16.dp))

                // Input Example
                SectionContainer {
                    Text(
                        "Input Example", 
                        fontSize = 18.sp, 
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.agent("input-example-title", text = "Input Example")
                    )
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = inputText,
                        onValueChange = { inputText = it },
                        label = { Text("Enter text") },
                        modifier = Modifier
                            .fillMaxWidth()
                            .agent(
                                testID = "text-input",
                                type = "TextField",
                                onChangeText = { 
                                    inputText = it
                                    log("Input changed: $it")
                                }
                            )
                    )
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "Input value: $inputText",
                        modifier = Modifier.agent("input-display-text", text = "Input value: $inputText")
                    )
                }

                Spacer(Modifier.height(16.dp))

                // Long Press Example
                SectionContainer {
                    Text(
                        "Long Press Example", 
                        fontSize = 18.sp, 
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.agent("long-press-example-title", text = "Long Press Example")
                    )
                    Spacer(Modifier.height(10.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(60.dp)
                            .background(Color(0xFF9C27B0), MaterialTheme.shapes.medium)
                            .pointerInput(Unit) {
                                detectTapGestures(
                                    onLongPress = { 
                                        longPressCount++
                                        log("Long pressed! Count: $longPressCount")
                                    },
                                    onTap = { log("Tapped (not long pressed)") }
                                )
                            }
                            .agent(
                                testID = "long-press-view",
                                type = "View",
                                onTap = { log("Tapped (not long pressed)") },
                                onLongPress = { 
                                    longPressCount++
                                    log("Long pressed! Count: $longPressCount")
                                }
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("Press and hold", color = Color.White)
                    }
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "Long press count: $longPressCount",
                        modifier = Modifier.agent("long-press-count-text", text = "Long press count: $longPressCount")
                    )
                }

                Spacer(Modifier.height(16.dp))

                // Swipe Example
                SectionContainer {
                    Text(
                        "Swipe Example", 
                        fontSize = 18.sp, 
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.agent("swipe-example-title", text = "Swipe Example")
                    )
                    Spacer(Modifier.height(10.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(100.dp)
                            .background(
                                Brush.linearGradient(listOf(Color.Green, Color.Blue)), 
                                MaterialTheme.shapes.medium
                            )
                            .agent(
                                testID = "swipeable-card",
                                type = "View",
                                onSwipe = { direction, velocity ->
                                    swipeCount++
                                    lastSwipeDirection = direction
                                    log("Card swiped $direction with velocity $velocity. Count: $swipeCount")
                                }
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("Swipe me!", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                            Text(
                                "Swipe count: $swipeCount ($lastSwipeDirection)", 
                                color = Color.White.copy(alpha = 0.8f), 
                                fontSize = 12.sp
                            )
                        }
                    }
                }

                Spacer(Modifier.height(16.dp))

                // Horizontal Scroll Example
                SectionContainer {
                    Text(
                        "Horizontal Scroll Example", 
                        fontSize = 18.sp, 
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.agent("horizontal-scroll-title", text = "Horizontal Scroll Example")
                    )
                    Spacer(Modifier.height(10.dp))
                    LazyRow(
                        state = horizontalListState,
                        modifier = Modifier
                            .height(90.dp)
                            .fillMaxWidth()
                            .agent(
                                testID = "horizontal-scroll",
                                type = "ScrollView",
                                onScroll = { direction, amount ->
                                    coroutineScope.launch {
                                        if (direction == "right") {
                                            horizontalListState.scrollBy(amount.toFloat())
                                            log("Scrolled right by $amount")
                                        } else if (direction == "left") {
                                            horizontalListState.scrollBy(-amount.toFloat())
                                            log("Scrolled left by $amount")
                                        }
                                    }
                                }
                            )
                    ) {
                        items(20) { index ->
                            Box(
                                modifier = Modifier
                                    .width(120.dp)
                                    .height(80.dp)
                                    .padding(end = 15.dp)
                                    .background(Color(0xFFFF9800), MaterialTheme.shapes.medium),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    "Item ${index + 1}",
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                }

                Spacer(Modifier.height(16.dp))

                // Reset Button
                Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Button(
                        onClick = { resetAll() },
                        colors = ButtonDefaults.buttonColors(backgroundColor = Color.Red, contentColor = Color.White),
                        modifier = Modifier.agent(
                            testID = "reset-button",
                            type = "Button",
                            onTap = { resetAll() }
                        )
                    ) {
                        Text("Reset All")
                    }
                }
            }
        }
    }
}

@Composable
fun SectionContainer(content: @Composable () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.LightGray.copy(alpha = 0.2f), MaterialTheme.shapes.medium)
            .padding(16.dp)
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            content()
        }
    }
}
