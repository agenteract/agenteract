//
//  AgentBinding.swift
//  AgenteractSwiftExample
//
//  Created by Agenteract
//

import SwiftUI

// MARK: - Agent Binding Properties

struct AgentBindingProps {
    let testID: String
    var onTap: (() -> Void)?
    var onLongPress: (() -> Void)?
    var onChangeText: ((String) -> Void)?
}

// MARK: - Agent Binding View Modifier

struct AgentBindingModifier: ViewModifier {
    let props: AgentBindingProps
    @State private var isRegistered = false

    func body(content: Content) -> some View {
        content
            .accessibilityIdentifier(props.testID)
            .onAppear {
                registerNode()
            }
            .onDisappear {
                unregisterNode()
            }
    }

    private func registerNode() {
        let node = AgentNode(
            view: nil,
            onTap: props.onTap,
            onLongPress: props.onLongPress,
            onChangeText: props.onChangeText
        )
        AgentRegistry.shared.register(testID: props.testID, node: node)
        isRegistered = true
    }

    private func unregisterNode() {
        if isRegistered {
            AgentRegistry.shared.unregister(testID: props.testID)
            isRegistered = false
        }
    }
}

// MARK: - View Extension

extension View {
    /// Adds agent binding capabilities to a view, enabling it to be controlled by the agent system
    ///
    /// - Parameters:
    ///   - testID: Unique identifier for this view
    ///   - onTap: Optional closure to handle tap actions
    ///   - onLongPress: Optional closure to handle long press actions
    ///   - onChangeText: Optional closure to handle text input changes
    /// - Returns: Modified view with agent binding capabilities
    func agentBinding(
        testID: String,
        onTap: (() -> Void)? = nil,
        onLongPress: (() -> Void)? = nil,
        onChangeText: ((String) -> Void)? = nil
    ) -> some View {
        let props = AgentBindingProps(
            testID: testID,
            onTap: onTap,
            onLongPress: onLongPress,
            onChangeText: onChangeText
        )
        return self.modifier(AgentBindingModifier(props: props))
    }
}

// MARK: - Convenience Button Wrapper

struct AgentButton<Label: View>: View {
    let testID: String
    let action: () -> Void
    let label: () -> Label

    init(testID: String, action: @escaping () -> Void, @ViewBuilder label: @escaping () -> Label) {
        self.testID = testID
        self.action = action
        self.label = label
    }

    var body: some View {
        Button(action: action) {
            label()
        }
        .agentBinding(testID: testID, onTap: action)
    }
}

// MARK: - Convenience TextField Wrapper

struct AgentTextField: View {
    let testID: String
    let placeholder: String
    @Binding var text: String

    init(testID: String, placeholder: String, text: Binding<String>) {
        self.testID = testID
        self.placeholder = placeholder
        self._text = text
    }

    var body: some View {
        TextField(placeholder, text: $text)
            .agentBinding(testID: testID, onChangeText: { newValue in
                text = newValue
            })
    }
}

// MARK: - Example Usage

/*

 Usage examples:

 1. Using the modifier directly on any view:

 Button("Click Me") {
     print("Button clicked")
 }
 .agentBinding(testID: "my-button", onTap: {
     print("Button clicked via agent")
 })

 2. Using the AgentButton wrapper:

 AgentButton(testID: "my-button") {
     print("Button clicked")
 } label: {
     Text("Click Me")
 }

 3. Using the AgentTextField wrapper:

 @State private var inputText = ""

 AgentTextField(testID: "my-input", placeholder: "Enter text", text: $inputText)

 4. Using with other gestures:

 Text("Long press me")
     .agentBinding(
         testID: "long-press-text",
         onTap: { print("Tapped") },
         onLongPress: { print("Long pressed") }
     )
     .onTapGesture {
         print("Actual tap")
     }
     .onLongPressGesture {
         print("Actual long press")
     }

 */
