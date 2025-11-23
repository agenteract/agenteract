//
//  AgenteractSwiftExampleApp.swift
//  AgenteractSwiftExample
//
//  Created by Michael Ribbons on 23/10/2025.
//

import SwiftUI
import Agenteract

@main
struct AgenteractSwiftExampleApp: App {
    @StateObject private var webSocketManager = AgentWebSocketManager(projectName: "swift-app")
    @StateObject private var logSocketManager = AgentLogSocketManager(projectName: "swift-app")

    var body: some Scene {
        WindowGroup {
            ContentView()
                .onOpenURL { url in
                    handleDeepLink(url)
                }
        }
    }

    private func handleDeepLink(_ url: URL) {
        print("[Agenteract] ====== DEEP LINK RECEIVED ======")
        print("[Agenteract] URL: \(url)")
        print("[Agenteract] Scheme: \(url.scheme ?? "nil")")
        print("[Agenteract] Host: \(url.host ?? "nil")")
        print("[Agenteract] Path: \(url.path)")
        print("[Agenteract] PathComponents: \(url.pathComponents)")
        print("[Agenteract] Query: \(url.query ?? "nil")")

        // Check if this is an agenteract config link
        // Supports: myapp://agenteract/config?host=...&port=...&token=...
        // The host is "agenteract" and path is "/config"
        guard url.host == "agenteract" && url.pathComponents.contains("config") else {
            print("[Agenteract] Not an agenteract config link - ignoring")
            return
        }

        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let queryItems = components.queryItems else {
            print("[Agenteract] Failed to parse deep link URL")
            return
        }

        print("[Agenteract] Query items: \(queryItems)")

        var host: String?
        var port: Int?
        var token: String?

        for item in queryItems {
            switch item.name {
            case "host": host = item.value
            case "port": port = Int(item.value ?? "")
            case "token": token = item.value
            default: break
            }
        }

        print("[Agenteract] Parsed - host: \(host ?? "nil"), port: \(port?.description ?? "nil"), token: \(token != nil ? "***" : "nil")")

        guard let host = host, let port = port else {
            print("[Agenteract] Missing required parameters in deep link")
            return
        }

        print("[Agenteract] Creating config and calling updateConfig...")
        let config = AgenteractConfig(host: host, port: port, token: token)
        webSocketManager.updateConfig(config)
        logSocketManager.updateConfig(config)

        print("[Agenteract] Config updated from deep link")
    }
}
