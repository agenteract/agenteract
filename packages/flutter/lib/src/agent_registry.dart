import 'package:flutter/widgets.dart';

/// Stores registered agent actions and UI element references
class AgentNode {
  final String testID;
  VoidCallback? onTap;
  ValueChanged<String>? onChangeText;
  Function(String direction, int amount)? onScroll;
  VoidCallback? onLongPress;
  Function(String direction, String velocity)? onSwipe;
  GlobalKey? key;
  Map<String, dynamic>? scrollPosition;

  AgentNode({
    required this.testID,
    this.onTap,
    this.onChangeText,
    this.onScroll,
    this.onLongPress,
    this.onSwipe,
    this.key,
    this.scrollPosition,
  });
}

/// Global registry for agent-interactive widgets
final Map<String, AgentNode> _agentRegistry = {};

/// Register an agent action with a test ID
void registerAgentAction(
  String testID, {
  VoidCallback? onTap,
  ValueChanged<String>? onChangeText,
  Function(String direction, int amount)? onScroll,
  VoidCallback? onLongPress,
  Function(String direction, String velocity)? onSwipe,
  GlobalKey? key,
}) {
  _agentRegistry[testID] = AgentNode(
    testID: testID,
    onTap: onTap,
    onChangeText: onChangeText,
    onScroll: onScroll,
    onLongPress: onLongPress,
    onSwipe: onSwipe,
    key: key,
    scrollPosition: {'x': 0.0, 'y': 0.0},
  );
}

/// Get a registered agent node by test ID
AgentNode? getAgentNode(String testID) {
  return _agentRegistry[testID];
}

/// Remove a node from the registry
void unregisterAgentAction(String testID) {
  _agentRegistry.remove(testID);
}

/// Get all registered test IDs
List<String> getAllTestIDs() {
  return _agentRegistry.keys.toList();
}

/// Clear all registered nodes (useful for testing)
void clearAgentRegistry() {
  _agentRegistry.clear();
}
