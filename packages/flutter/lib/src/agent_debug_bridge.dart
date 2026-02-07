import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:app_links/app_links.dart';
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
  final bool autoConnect;
  final Future<bool> Function(String url)? onAgentLink;

  const AgentDebugBridge({
    super.key,
    required this.projectName,
    required this.child,
    this.serverUrl,
    this.autoConnect = true,
    this.onAgentLink,
  });

  @override
  State<AgentDebugBridge> createState() => _AgentDebugBridgeState();
}

class _AgentDebugBridgeState extends State<AgentDebugBridge> {
  WebSocketChannel? _channel;
  Timer? _reconnectTimer;
  bool _isConnecting = false;
  StreamSubscription? _linkSub;
  late AppLinks _appLinks;
  bool _deviceInfoSent = false;

  // Config storage
  String? _storedHost;
  int? _storedPort;
  String? _storedToken;
  String? _storedDeviceId;
  bool _shouldConnect = false;
  bool _configLoaded = false;

  String? get _serverUrl {
    if (widget.serverUrl != null) return widget.serverUrl;

    // Prioritize stored config
    if (_storedHost != null && _storedPort != null) {
      return 'ws://$_storedHost:$_storedPort';
    }

    // Return default URLs based on platform
    // Note: We provide defaults but only auto-connect if no config is needed
    if (kIsWeb) {
      return 'ws://127.0.0.1:8765';
    }

    if (Platform.isAndroid) {
      // Android emulator IP
      return 'ws://10.0.2.2:8765';
    }

    if (Platform.isIOS) {
      // iOS simulator/localhost
      return 'ws://127.0.0.1:8765';
    }

    return null;
  }

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    if (_configLoaded) return; // Prevent re-initialization on hot reload

    // 1. Load stored config
    try {
      final prefs = await SharedPreferences.getInstance();
      final host = prefs.getString('agenteract_host');
      final port = prefs.getInt('agenteract_port');
      final token = prefs.getString('agenteract_token');
      final deviceId = prefs.getString('agenteract_device_id');

      setState(() {
        _storedHost = host;
        _storedPort = port;
        _storedToken = token;
        _storedDeviceId = deviceId;
        _configLoaded = true;

        // Determine if we should connect
        if (host != null && port != null) {
          // Have saved config - connect
          _shouldConnect = true;
          debugPrint(
              '[Agenteract] Using saved config: ${_sanitizeConfigForLog(host, port, token, deviceId)}');
        } else {
          // No saved config - only connect if autoConnect is enabled and we have a default URL
          final hasDefaultUrl = _serverUrl != null;
          _shouldConnect = widget.autoConnect && hasDefaultUrl;

          if (hasDefaultUrl && _shouldConnect) {
            debugPrint(
                '[Agenteract] Will try connecting to default URL: $_serverUrl');
            debugPrint(
                '[Agenteract] On physical devices, this may fail. Use "agenteract connect" to pair.');
          } else if (!hasDefaultUrl) {
            debugPrint(
                '[Agenteract] No default URL. Use "agenteract connect" to pair.');
          }
        }
      });
    } catch (e) {
      debugPrint('[Agenteract] Failed to load preferences: $e');
      setState(() {
        _configLoaded = true;
        _shouldConnect = false;
      });
    }

    // 2. Connect if appropriate
    if (_shouldConnect) {
      _connect();
    }

    // 3. Listen for Deep Links
    _initDeepLinks();
  }

  Future<void> _initDeepLinks() async {
    _appLinks = AppLinks();

    try {
      final initialLink = await _appLinks.getInitialLink();
      // Only process initial link if we don't already have a config
      // This prevents re-processing old links on every app launch
      if (initialLink != null && _storedHost == null) {
        debugPrint('[Agenteract] Processing initial deep link');
        _handleLink(initialLink.toString());
      }
    } catch (e) {
      debugPrint('AgentDebugBridge: Error getting initial link: $e');
    }

    _linkSub = _appLinks.uriLinkStream.listen((Uri? uri) {
      if (uri != null) _handleLink(uri.toString());
    }, onError: (err) {
      debugPrint('AgentDebugBridge: Error in link stream: $err');
    });
  }

  void _handleLink(String link) async {
    try {
      final uri = Uri.parse(link);
      // Expecting: scheme://agenteract/config?host=...&port=...&token=...
      // The host might be 'agenteract' or the scheme itself depending on config.
      // We check path segments.

      final isAgenteractConfig = uri.path.contains('config') ||
          uri.host == 'config' ||
          uri.pathSegments.contains('config');

      // If not a config link, let the custom handler try it
      if (!isAgenteractConfig) {
        if (widget.onAgentLink != null) {
          final handled = await widget.onAgentLink!(link);
          if (handled) {
            debugPrint('[Agenteract] agentLink handled by app');
          } else {
            debugPrint('[Agenteract] agentLink not handled by app');
          }
        }
        return;
      }

      // Handle config deep link
      final host = uri.queryParameters['host'];
      final portStr = uri.queryParameters['port'];
      final token = uri.queryParameters['token'];

      if (host != null && portStr != null && token != null) {
        final port = int.parse(portStr);
        debugPrint(
            '[Agenteract] Received config via Deep Link: ${_sanitizeConfigForLog(host, port, token, null)}');

        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('agenteract_host', host);
        await prefs.setInt('agenteract_port', int.parse(portStr));
        await prefs.setString('agenteract_token', token);

        setState(() {
          _storedHost = host;
          _storedPort = int.parse(portStr);
          _storedToken = token;
          _shouldConnect = true;
          _configLoaded = true;
        });

        // Force Reconnect with new config
        _disconnect();
        _connect();
      }
    } catch (e) {
      debugPrint('AgentDebugBridge: Error parsing deep link: $e');
    }
  }

  @override
  void dispose() {
    _reconnectTimer?.cancel();
    _linkSub?.cancel();
    _disconnect();
    super.dispose();
  }

  void _disconnect() {
    _channel?.sink.close();
    _channel = null;
    _isConnecting = false;
    _deviceInfoSent = false;
  }

  void _connect() {
    if (_isConnecting) return;
    if (!_shouldConnect) {
      debugPrint(
          '[Agenteract] Auto-connect disabled. Use deep link to configure.');
      return;
    }

    final serverUrl = _serverUrl;
    if (serverUrl == null) {
      debugPrint(
          '[Agenteract] No server URL configured. Waiting for deep link...');
      return;
    }

    _isConnecting = true;

    try {
      // Build URL with token and deviceId if available
      String url = '$serverUrl/${widget.projectName}';
      final params = <String>[];
      if (_storedToken != null) {
        params.add('token=$_storedToken');
      }
      if (_storedDeviceId != null) {
        params.add('deviceId=$_storedDeviceId');
      }
      if (params.isNotEmpty) {
        url += '?${params.join('&')}';
      }

      final uri = Uri.parse(url);
      debugPrint(
          '[Agenteract] Connecting to ${uri.toString().replaceAll(RegExp(r'token=([^&]+)'), 'token=***')}');

      _channel = WebSocketChannel.connect(uri);

      _channel!.stream.listen(
        _handleMessage,
        onError: (error) {
          debugPrint('[Agenteract] Connection error: $error');
          debugPrint('[Agenteract] Error type: ${error.runtimeType}');
          _scheduleReconnect();
        },
        onDone: () {
          debugPrint('[Agenteract] Disconnected. Reconnecting...');
          _scheduleReconnect();
        },
        cancelOnError: false,
      );

      debugPrint('[Agenteract] WebSocket channel created');
      _isConnecting = false;

      // Send device info after a short delay to ensure WebSocket handshake is complete
      Future.delayed(const Duration(milliseconds: 100), () {
        if (_channel != null && !_deviceInfoSent) {
          _deviceInfoSent = true;
          debugPrint('[Agenteract] Sending device info');
          _sendDeviceInfo();
        }
      });
    } catch (e) {
      debugPrint('[Agenteract] Connection failed: $e');
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
      // Send device info on first message (connection is confirmed)
      if (!_deviceInfoSent) {
        _deviceInfoSent = true;
        debugPrint('[Agenteract] Connection confirmed, sending device info');
        _sendDeviceInfo();
      }

      final data = json.decode(message as String) as Map<String, dynamic>;
      final status = data['status'] as String?;
      final action = data['action'] as String?;
      final id = data['id'] as String?;

      // Handle server-assigned device ID
      if (status == 'connected' && data['deviceId'] != null) {
        final deviceId = data['deviceId'] as String;
        debugPrint('[Agenteract] Received device ID from server: $deviceId');

        // Store device ID for future connections
        SharedPreferences.getInstance().then((prefs) {
          prefs.setString('agenteract_device_id', deviceId);
          setState(() {
            _storedDeviceId = deviceId;
          });
          debugPrint('[Agenteract] Stored device ID for future connections');
        });
        return;
      }

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
        case 'agentLink':
          _handleAgentLink(data['payload'] as String?, id);
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

  void _handleAgentLink(String? payload, String? id) async {
    if (payload == null) {
      _sendError('Missing payload', id);
      return;
    }

    if (widget.onAgentLink != null) {
      try {
        final handled = await widget.onAgentLink!(payload);
        if (handled) {
          debugPrint('[Agenteract] agentLink handled by app');
          _sendSuccess(id);
        } else {
          debugPrint('[Agenteract] agentLink not handled by app');
          _sendError('agentLink not handled by app', id);
        }
      } catch (e) {
        debugPrint('[Agenteract] Error in agentLink handler: $e');
        _sendError('Error in agentLink handler: $e', id);
      }
    } else {
      _sendError('No agentLink handler configured', id);
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

  void _sendDeviceInfo() {
    try {
      // Determine if running on simulator/emulator
      bool isSimulator = false;
      String deviceName = 'Unknown';
      String deviceModel = 'Unknown';
      String osVersion = 'Unknown';

      if (kIsWeb) {
        isSimulator = true;
        deviceName = 'Web Browser';
        deviceModel = 'web';
        osVersion = 'Web';
      } else if (Platform.isAndroid) {
        // Android emulator detection - check if running on x86/x64 (emulators) or look for emulator indicators
        final version = Platform.version;
        isSimulator = version.contains('(') &&
            (version.toLowerCase().contains('emulator') ||
                version.toLowerCase().contains('generic') ||
                Platform.environment['ANDROID_PRODUCT_MODEL']
                        ?.toLowerCase()
                        .contains('sdk') ==
                    true);

        deviceModel =
            Platform.environment['ANDROID_PRODUCT_MODEL'] ?? 'Android Device';
        deviceName = Platform.environment['ANDROID_PRODUCT_MANUFACTURER'] !=
                null
            ? '${Platform.environment['ANDROID_PRODUCT_MANUFACTURER']} $deviceModel'
            : deviceModel;

        // Extract OS version from Platform.version (format: "version (build info)")
        // Example: "3.5.4 (stable) (Tue Oct 15 08:33:00 2024 +0000) on "android_x64""
        final match = RegExp(r'on "android[_\w]*"').firstMatch(version);
        if (match != null) {
          final platformStr =
              match.group(0)?.replaceAll('on "', '').replaceAll('"', '') ?? '';
          osVersion =
              'Android ${platformStr.contains('_') ? platformStr.split('_').last : ''}';
        } else {
          osVersion = 'Android';
        }
      } else if (Platform.isIOS) {
        // iOS simulator detection
        final version = Platform.version;

        // Check for simulator indicators in Platform.version
        // Note: On Apple Silicon Macs, simulators show "ios_arm64" which is the same as physical devices
        // The only reliable way without platform channels is to assume debug mode = simulator for iOS
        // since physical iOS devices typically can't run debug builds without developer provisioning
        isSimulator = kDebugMode;

        // Set device info
        if (isSimulator) {
          deviceModel = 'iPhone Simulator';
          deviceName = 'iPhone Simulator';
        } else {
          deviceModel = 'iPhone';
          deviceName = 'iPhone';
        }

        // For iOS, we can't easily get the OS version from Platform.version
        // It shows the Dart version, not iOS version
        osVersion = 'iOS';
      }

      final deviceInfo = {
        'status': 'deviceInfo',
        'deviceInfo': {
          'isSimulator': isSimulator,
          'deviceId': _storedDeviceId,
          'bundleId': widget.projectName,
          'deviceName': deviceName,
          'osVersion': osVersion,
          'deviceModel': deviceModel,
        }
      };

      _channel?.sink.add(json.encode(deviceInfo));
      debugPrint('[Agenteract] Sent device info to server');
    } catch (e) {
      debugPrint('[Agenteract] Failed to send device info: $e');
    }
  }

  String _sanitizeConfigForLog(
      String host, int port, String? token, String? deviceId) {
    var result = 'host: $host, port: $port';
    if (token != null) {
      result += ', token: ****';
    }
    if (deviceId != null) {
      result += ', deviceId: $deviceId';
    }
    return result;
  }

  @override
  Widget build(BuildContext context) {
    return widget.child;
  }
}
