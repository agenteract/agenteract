//
//  ContentView.swift
//  AgenteractSwiftExample
//
//  Created by Michael Ribbons on 23/10/2025.
//

import SwiftUI
import Agenteract

struct ContentView: View {
    @State private var tapCount = 0
    @State private var inputText = ""
    @State private var longPressCount = 0
    @State private var cardOffset: CGFloat = 0
    @State private var swipeCount = 0
    @State private var resetTrigger = 0 // Used to trigger reset from deep link

    // Reset all state
    func resetAllState() {
        tapCount = 0
        inputText = ""
        longPressCount = 0
        swipeCount = 0
        cardOffset = 0
        AppLogger.info("App state cleared")
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Header
                VStack {
                    Image(systemName: "globe")
                        .imageScale(.large)
                        .foregroundStyle(.tint)
                    Text("Agenteract Swift Example")
                        .font(.title)
                        .bold()
                }
                .padding()

                Divider()

                // Tap Example
                VStack(alignment: .leading, spacing: 10) {
                    Text("Tap Example")
                        .font(.headline)

                    AgentButton(testID: "tap-button") {
                        tapCount += 1
                        AppLogger.info("Counter incremented to \(tapCount)")
                    } label: {
                        HStack {
                            Image(systemName: "hand.tap.fill")
                            Text("Tap Me")
                        }
                        .padding()
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(8)
                    }

                    Text("Tap count: \(tapCount)")
                        .agentBinding(testID: "tap-count-text")
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.gray.opacity(0.1))
                .cornerRadius(12)

                // Input Example
                VStack(alignment: .leading, spacing: 10) {
                    Text("Input Example")
                        .font(.headline)

                    AgentTextField(
                        testID: "text-input",
                        placeholder: "Enter some text",
                        text: $inputText
                    )
                    .onChange(of: inputText) { newValue in
                        AppLogger.info("Input text changed to \(newValue)")
                    }
                    .textFieldStyle(RoundedBorderTextFieldStyle())

                    Text("Input value: \(inputText)")
                        .agentBinding(testID: "input-display-text")
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.gray.opacity(0.1))
                .cornerRadius(12)

                // Long Press Example
                VStack(alignment: .leading, spacing: 10) {
                    Text("Long Press Example")
                        .font(.headline)

                    Text("Press and hold")
                        .padding()
                        .background(Color.purple)
                        .foregroundColor(.white)
                        .cornerRadius(8)
                        .agentBinding(
                            testID: "long-press-view",
                            onTap: {
                                print("Tapped (not long pressed)")
                            },
                            onLongPress: {
                                longPressCount += 1
                                AppLogger.info("Long pressed! Count: \(longPressCount)")
                            }
                        )
                        .onLongPressGesture {
                            longPressCount += 1
                            AppLogger.info("Long pressed via gesture! Count: \(longPressCount)")
                        }

                    Text("Long press count: \(longPressCount)")
                        .agentBinding(testID: "long-press-count-text")
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.gray.opacity(0.1))
                .cornerRadius(12)

                // Swipeable Card Example
                VStack(alignment: .leading, spacing: 10) {
                    Text("Swipeable Card Example")
                        .font(.headline)

                    Text("Swipe left/right or up/down")
                        .font(.caption)
                        .foregroundColor(.gray)

                    ZStack {
                        RoundedRectangle(cornerRadius: 12)
                            .fill(
                                LinearGradient(
                                    gradient: Gradient(colors: [Color.green, Color.blue]),
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(height: 100)
                            .offset(x: cardOffset)
                            .animation(.spring(), value: cardOffset)

                        VStack {
                            Text("Swipe me!")
                                .font(.title2)
                                .bold()
                                .foregroundColor(.white)
                            Text("Swipe count: \(swipeCount)")
                                .font(.caption)
                                .foregroundColor(.white.opacity(0.8))
                        }
                    }
                    .agentBinding(
                        testID: "swipeable-card",
                        onSwipe: { direction, velocity in
                            swipeCount += 1
                            AppLogger.info("Card swiped \(direction) with velocity \(velocity). Count: \(swipeCount)")

                            // Animate the card based on direction
                            let distance: CGFloat
                            switch velocity {
                            case "fast": distance = 200
                            case "medium": distance = 100
                            default: distance = 50
                            }

                            switch direction {
                            case "left":
                                cardOffset = -distance
                            case "right":
                                cardOffset = distance
                            default:
                                cardOffset = 0
                            }

                            // Reset after animation
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                                cardOffset = 0
                            }
                        }
                    )
                    .gesture(
                        DragGesture()
                            .onChanged { value in
                                cardOffset = value.translation.width
                            }
                            .onEnded { value in
                                if abs(value.translation.width) > 100 {
                                    swipeCount += 1
                                    let direction = value.translation.width > 0 ? "right" : "left"
                                    AppLogger.info("Manual swipe \(direction)! Count: \(swipeCount)")
                                }
                                cardOffset = 0
                            }
                    )
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.gray.opacity(0.1))
                .cornerRadius(12)

                // Horizontal Scroll Example
                VStack(alignment: .leading, spacing: 10) {
                    Text("Horizontal Scroll Example")
                        .font(.headline)

                    ScrollView(.horizontal, showsIndicators: true) {
                        HStack(spacing: 15) {
                            ForEach(0..<20) { index in
                                RoundedRectangle(cornerRadius: 8)
                                    .fill(Color.orange)
                                    .frame(width: 120, height: 80)
                                    .overlay(
                                        Text("Item \(index + 1)")
                                            .foregroundColor(.white)
                                            .bold()
                                    )
                            }
                        }
                        .padding(.horizontal, 5)
                    }
                    .frame(height: 90)
                    .agentBinding(
                        testID: "horizontal-scroll",
                        scrollViewProxy: true
                    )
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.gray.opacity(0.1))
                .cornerRadius(12)

                // Vertical Scroll Example
                VStack(alignment: .leading, spacing: 10) {
                    Text("Vertical Scroll List")
                        .font(.headline)

                    Text("Scrollable list of 50 items")
                        .font(.caption)
                        .foregroundColor(.gray)

                    ScrollView(.vertical, showsIndicators: true) {
                        VStack(spacing: 5) {
                            ForEach(0..<50) { index in
                                HStack {
                                    Text("List item \(index + 1)")
                                        .foregroundColor(.black)
                                        .padding(.vertical, 8)
                                        .padding(.horizontal, 12)
                                    Spacer()
                                }
                                .background(index % 2 == 0 ? Color.white : Color.gray.opacity(0.1))
                                .cornerRadius(4)
                            }
                        }
                        .padding(5)
                    }
                    .frame(height: 200)
                    .background(Color.white)
                    .cornerRadius(8)
                    .agentBinding(
                        testID: "main-list",
                        scrollViewProxy: true
                    )
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.gray.opacity(0.1))
                .cornerRadius(12)

                // Reset Button
                Button("Reset All") {
                    tapCount = 0
                    inputText = ""
                    longPressCount = 0
                    swipeCount = 0
                    cardOffset = 0
                    AppLogger.info("All values reset")
                }
                .agentBinding(testID: "reset-button", onTap: {
                    tapCount = 0
                    inputText = ""
                    longPressCount = 0
                    swipeCount = 0
                    cardOffset = 0
                    AppLogger.info("All values reset")
                })
                .padding()
                .background(Color.red)
                .foregroundColor(.white)
                .cornerRadius(8)
            }
            .padding()
        }
        // Add the AgentDebugBridge with deep link handler
        .background(
            AgentDebugBridge(projectName: "swift-app") { url in
                // Handle reset_state deep link
                if url.host == "reset_state" || url.path.contains("reset_state") {
                    resetAllState()
                    return true
                }
                // Let AgentDebugBridge handle config links
                return false
            }
        )
        .onChange(of: resetTrigger) { _ in
            // This allows external triggers to reset state if needed
            resetAllState()
        }
    }
}

#Preview {
    ContentView()
}
