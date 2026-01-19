import 'package:flutter/widgets.dart';
import 'agent_registry.dart';

/// Builds a JSON representation of the widget hierarchy for agents
Map<String, dynamic> buildViewHierarchy(BuildContext context) {
  return _buildElementHierarchy(context as Element);
}

Map<String, dynamic> _buildElementHierarchy(Element element) {
  final widget = element.widget;
  final node = <String, dynamic>{
    'type': widget.runtimeType.toString(),
  };

  // Check if this element has a registered test ID
  String? testID;
  if (widget.key != null) {
    // Check if this key is in our registry
    for (final id in getAllTestIDs()) {
      final agentNode = getAgentNode(id);
      if (agentNode?.key != null) {
        // Match by checking if the keys are equal
        if (element.widget.key == agentNode!.key) {
          testID = id;
          break;
        }
      }
    }
  }

  if (testID != null) {
    node['testID'] = testID;
  }

  // Extract text content if available
  if (widget is Text) {
    final textWidget = widget;
    node['text'] = textWidget.data ?? textWidget.textSpan?.toPlainText();
  } else if (widget is EditableText) {
    node['text'] = widget.controller.text;
  }

  // Add children
  final children = <Map<String, dynamic>>[];
  element.visitChildren((child) {
    children.add(_buildElementHierarchy(child));
  });

  if (children.isNotEmpty) {
    node['children'] = children;
  }

  return node;
}

/// Filter hierarchy to find nodes matching a specific key-value pair
Map<String, dynamic>? filterHierarchy(
  Map<String, dynamic> hierarchy,
  String filterKey,
  String filterValue,
) {
  // Check if current node matches
  if (hierarchy[filterKey] == filterValue) {
    return hierarchy;
  }

  // Search in children
  final children = hierarchy['children'] as List<dynamic>?;
  if (children != null) {
    for (final child in children) {
      final result = filterHierarchy(
        child as Map<String, dynamic>,
        filterKey,
        filterValue,
      );
      if (result != null) {
        return result;
      }
    }
  }

  return null;
}
