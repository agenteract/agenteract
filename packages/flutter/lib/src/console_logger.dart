import 'package:flutter/foundation.dart';

/// Log entry for console capture
class LogEntry {
  final String level;
  final String message;
  final int timestamp;

  LogEntry({
    required this.level,
    required this.message,
    required this.timestamp,
  });

  Map<String, dynamic> toJson() {
    return {
      'level': level,
      'message': message,
      'timestamp': timestamp,
    };
  }
}

/// Singleton console logger that captures debug prints
class ConsoleLogger {
  static final ConsoleLogger instance = ConsoleLogger._internal();

  factory ConsoleLogger() {
    return instance;
  }

  ConsoleLogger._internal() {
    _initialize();
  }

  final List<LogEntry> _logs = [];
  static const int _maxLogLines = 2000;
  DebugPrintCallback? _originalDebugPrint;

  void _initialize() {
    // Store original debugPrint
    _originalDebugPrint = debugPrint;

    // Override debugPrint to capture logs
    debugPrint = (String? message, {int? wrapWidth}) {
      if (message != null) {
        _addLog('log', message);
      }
      // Call original debugPrint
      _originalDebugPrint?.call(message, wrapWidth: wrapWidth);
    };
  }

  void _addLog(String level, String message) {
    _logs.add(LogEntry(
      level: level,
      message: message,
      timestamp: DateTime.now().millisecondsSinceEpoch,
    ));

    // Keep only the last N lines
    if (_logs.length > _maxLogLines) {
      _logs.removeAt(0);
    }
  }

  /// Get all captured logs
  List<Map<String, dynamic>> getLogs() {
    return _logs.map((log) => log.toJson()).toList();
  }

  /// Clear all logs
  void clearLogs() {
    _logs.clear();
  }

  /// Restore original debugPrint
  void dispose() {
    if (_originalDebugPrint != null) {
      debugPrint = _originalDebugPrint!;
    }
  }
}
