//
//  ContentView.swift
//  AgenteractSwiftExample
//
//  Created by Michael Ribbons on 23/10/2025.
//

import SwiftUI

struct ContentView: View {
    @State private var tapCount = 0
    @State private var inputText = ""
    @State private var longPressCount = 0

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
                        AppLogger.info("Button tapped! Count: \(tapCount)")
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

                // Reset Button
                Button("Reset All") {
                    tapCount = 0
                    inputText = ""
                    longPressCount = 0
                    AppLogger.info("All values reset")
                }
                .agentBinding(testID: "reset-button", onTap: {
                    tapCount = 0
                    inputText = ""
                    longPressCount = 0
                })
                .padding()
                .background(Color.red)
                .foregroundColor(.white)
                .cornerRadius(8)
            }
            .padding()
        }
        // Add the AgentDebugBridge
        .background(
            AgentDebugBridge(projectName: "swift-app")
        )
    }
}

#Preview {
    ContentView()
}
