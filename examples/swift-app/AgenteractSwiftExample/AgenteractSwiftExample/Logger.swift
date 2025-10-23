//
//  Logger.swift
//  AgenteractSwiftExample
//
//  Logging utility for Agenteract
//

import Foundation
import os.log

/// Custom logger for the app that sends logs to both Xcode console and agent server
class AppLogger {
    private static let subsystem = Bundle.main.bundleIdentifier ?? "AgenteractSwiftExample"
    private static let logger = Logger(subsystem: subsystem, category: "app")

    static func log(_ message: String, type: OSLogType = .default) {
        // Log to os_log (shows in Xcode console)
        logger.log(level: type, "\(message)")

        // Also send to LogBuffer for agent server
        let levelString: String
        switch type {
        case .debug:
            levelString = "debug"
        case .info:
            levelString = "info"
        case .error:
            levelString = "error"
        case .fault:
            levelString = "error"
        default:
            levelString = "log"
        }

        LogBuffer.shared.addLog(level: levelString, message: message)
    }

    static func info(_ message: String) {
        log(message, type: .info)
    }

    static func debug(_ message: String) {
        log(message, type: .debug)
    }

    static func error(_ message: String) {
        log(message, type: .error)
    }

    static func warning(_ message: String) {
        log(message, type: .default)
    }
}

// Convenience global function
func appLog(_ message: String, type: OSLogType = .default) {
    AppLogger.log(message, type: type)
}
