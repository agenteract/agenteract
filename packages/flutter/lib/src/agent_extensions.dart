import 'package:flutter/widgets.dart';
import 'agent_registry.dart';

/// Extension on Widget to make it agent-interactive
extension AgentExtensions on Widget {
  /// Make this widget discoverable and interactive by agents
  ///
  /// Example:
  /// ```dart
  /// Text('Hello').withAgent('greeting-text')
  ///
  /// ElevatedButton(
  ///   onPressed: () => print('clicked'),
  ///   child: Text('Click me'),
  /// ).withAgent('submit-button', onTap: () => print('clicked'))
  /// ```
  Widget withAgent(
    String testID, {
    VoidCallback? onTap,
    ValueChanged<String>? onChangeText,
    Function(String direction, int amount)? onScroll,
    VoidCallback? onLongPress,
    Function(String direction, String velocity)? onSwipe,
  }) {
    final key = GlobalKey();

    // Register the actions with the agent registry
    registerAgentAction(
      testID,
      onTap: onTap,
      onChangeText: onChangeText,
      onScroll: onScroll,
      onLongPress: onLongPress,
      onSwipe: onSwipe,
      key: key,
    );

    // Wrap the widget with a KeyedSubtree for identification
    Widget wrappedWidget = KeyedSubtree(
      key: key,
      child: this,
    );

    // Add gesture detector if any gesture handlers are provided
    if (onTap != null || onLongPress != null || onSwipe != null) {
      wrappedWidget = GestureDetector(
        onTap: onTap,
        onLongPress: onLongPress,
        // Add swipe detection if onSwipe is provided
        onPanEnd: onSwipe != null
            ? (details) {
                final velocity = details.velocity.pixelsPerSecond;
                final dx = velocity.dx;
                final dy = velocity.dy;

                // Determine direction based on dominant axis
                if (dx.abs() > dy.abs()) {
                  // Horizontal swipe
                  if (dx > 0) {
                    onSwipe('right', _velocityToString(dx.abs()));
                  } else {
                    onSwipe('left', _velocityToString(dx.abs()));
                  }
                } else {
                  // Vertical swipe
                  if (dy > 0) {
                    onSwipe('down', _velocityToString(dy.abs()));
                  } else {
                    onSwipe('up', _velocityToString(dy.abs()));
                  }
                }
              }
            : null,
        child: wrappedWidget,
      );
    }

    return wrappedWidget;
  }

  /// Convert velocity to string category
  static String _velocityToString(double velocity) {
    if (velocity < 300) return 'slow';
    if (velocity < 800) return 'medium';
    return 'fast';
  }
}

/// Extension on ScrollController to track scroll position for agents
extension AgentScrollControllerExtension on ScrollController {
  /// Create a listener that tracks scroll position for agent commands
  void trackForAgent(String testID) {
    addListener(() {
      final node = getAgentNode(testID);
      if (node != null && hasClients) {
        node.scrollPosition = {
          'x': 0.0, // ScrollController only tracks vertical in Flutter
          'y': offset,
        };
      }
    });
  }
}
