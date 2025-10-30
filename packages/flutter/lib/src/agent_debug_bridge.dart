import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'agent_registry.dart';
import 'hierarchy_builder.dart';
import 'console_logger.dart';

/// AgentDebugBridge - Enables AI agents to interact with Flutter apps
///
/// Wrap your app with this widget in development mode:
/// ```dart
/// kDebugMode
///   ? AgentDebugBridge(
///       projectName: 'my-flutter-app',
///       child: MyApp(),
///     )
///   : MyApp()
/// ```
class AgentDebugBridge extends StatefulWidget {
  final String projectName;
  final Widget child;
  final String? serverUrl;

  const AgentDebugBridge({
    super.key,
    required this.projectName,
    required this.child,
    this.serverUrl,
  });

  @override
  State<AgentDebugBridge> createState() => _AgentDebugBridgeState();
}

class _AgentDebugBridgeState extends State<AgentDebugBridge> {
  WebSocketChannel? _channel;
  Timer? _reconnectTimer;
  bool _isConnecting = false;

  String get _serverUrl {
    if (widget.serverUrl != null) return widget.serverUrl!;

    // Default URLs based on platform
    if (kIsWeb) {
      return 'ws://127.0.0.1:8765';
    } else if (Platform.isAndroid) {
      return 'ws://10.0.2.2:8765';
    } else {
      return 'ws://127.0.0.1:8765';
    }
  }

  @override
  void initState() {
    super.initState();
    _connect();
  }

  @override
  void dispose() {
    _reconnectTimer?.cancel();
    _channel?.sink.close();
    super.dispose();
  }

  void _connect() {
    if (_isConnecting) return;
    _isConnecting = true;

    try {
      final uri = Uri.parse('$_serverUrl/${widget.projectName}');
      debugPrint('AgentDebugBridge: Connecting to $uri');

      _channel = WebSocketChannel.connect(uri);

      _channel!.stream.listen(
        _handleMessage,
        onError: (error) {
          debugPrint('AgentDebugBridge WebSocket error: $error');
          _scheduleReconnect();
        },
        onDone: () {
          debugPrint('AgentDebugBridge: Disconnected. Reconnecting...');
          _scheduleReconnect();
        },
      );

      debugPrint('AgentDebugBridge: Connected to agent server');
      _isConnecting = false;
    } catch (e) {
      debugPrint('AgentDebugBridge: Connection failed: $e');
      _isConnecting = false;
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    _channel = null;
    _isConnecting = false;
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(seconds: 3), _connect);
  }

  void _handleMessage(dynamic message) {
    try {
      final data = json.decode(message as String) as Map<String, dynamic>;
      final action = data['action'] as String?;
      final id = data['id'] as String?;

      if (action == null) {
        _sendError('Missing action field', id);
        return;
      }

      switch (action) {
        case 'getViewHierarchy':
          _handleGetViewHierarchy(id);
          break;
        case 'getConsoleLogs':
          _handleGetConsoleLogs(id);
          break;
        case 'tap':
          _handleTap(data['testID'] as String?, id);
          break;
        case 'input':
          _handleInput(
            data['testID'] as String?,
            data['value'] as String?,
            id,
          );
          break;
        case 'scroll':
          _handleScroll(
            data['testID'] as String?,
            data['direction'] as String?,
            data['amount'] as int?,
            id,
          );
          break;
        case 'longPress':
          _handleLongPress(data['testID'] as String?, id);
          break;
        case 'swipe':
          _handleSwipe(
            data['testID'] as String?,
            data['direction'] as String?,
            data['velocity'] as String?,
            id,
          );
          break;
        default:
          _sendError('Unknown action: $action', id);
      }
    } catch (e) {
      debugPrint('AgentDebugBridge: Error handling message: $e');
      _sendError(e.toString(), null);
    }
  }

  void _handleGetViewHierarchy(String? id) {
    try {
      final hierarchy = buildViewHierarchy(context);
      _sendResponse({'status': 'success', 'hierarchy': hierarchy, 'id': id});
    } catch (e) {
      _sendError('Failed to get view hierarchy: $e', id);
    }
  }

  void _handleGetConsoleLogs(String? id) {
    _sendResponse({
      'status': 'success',
      'logs': ConsoleLogger.instance.getLogs(),
      'id': id,
    });
  }

  void _handleTap(String? testID, String? id) {
    if (testID == null) {
      _sendError('Missing testID', id);
      return;
    }

    final node = getAgentNode(testID);
    if (node?.onTap != null) {
      node!.onTap!();
      _sendSuccess(id);
    } else {
      _sendError('No tap handler found for testID: $testID', id);
    }
  }

  void _handleInput(String? testID, String? value, String? id) {
    if (testID == null || value == null) {
      _sendError('Missing testID or value', id);
      return;
    }

    final node = getAgentNode(testID);
    if (node?.onChangeText != null) {
      node!.onChangeText!(value);
      _sendSuccess(id);
    } else {
      _sendError('No input handler found for testID: $testID', id);
    }
  }

  void _handleScroll(
    String? testID,
    String? direction,
    int? amount,
    String? id,
  ) {
    if (testID == null || direction == null) {
      _sendError('Missing testID or direction', id);
      return;
    }

    final node = getAgentNode(testID);
    if (node?.onScroll != null) {
      node!.onScroll!(direction, amount ?? 100);
      _sendSuccess(id);
    } else {
      _sendError('No scroll handler found for testID: $testID', id);
    }
  }

  void _handleLongPress(String? testID, String? id) {
    if (testID == null) {
      _sendError('Missing testID', id);
      return;
    }

    final node = getAgentNode(testID);
    if (node?.onLongPress != null) {
      node!.onLongPress!();
      _sendSuccess(id);
    } else {
      _sendError('No long press handler found for testID: $testID', id);
    }
  }

  void _handleSwipe(
    String? testID,
    String? direction,
    String? velocity,
    String? id,
  ) {
    if (testID == null || direction == null) {
      _sendError('Missing testID or direction', id);
      return;
    }

    final node = getAgentNode(testID);
    if (node?.onSwipe != null) {
      node!.onSwipe!(direction, velocity ?? 'medium');
      _sendSuccess(id);
    } else {
      _sendError('No swipe handler found for testID: $testID', id);
    }
  }

  void _sendSuccess(String? id) {
    _sendResponse({'status': 'ok', 'id': id});
  }

  void _sendError(String error, String? id) {
    _sendResponse({'status': 'error', 'error': error, 'id': id});
  }

  void _sendResponse(Map<String, dynamic> response) {
    try {
      _channel?.sink.add(json.encode(response));
    } catch (e) {
      debugPrint('AgentDebugBridge: Error sending response: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return widget.child;
  }
}
