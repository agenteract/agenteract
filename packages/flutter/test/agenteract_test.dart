import 'package:flutter_test/flutter_test.dart';
import 'package:agenteract/agenteract.dart';

void main() {
  test('agent registry operations', () {
    // Clear registry before test
    clearAgentRegistry();

    // Test registration
    registerAgentAction('test-button', onTap: () {});
    expect(getAllTestIDs().contains('test-button'), true);

    // Test retrieval
    final node = getAgentNode('test-button');
    expect(node, isNotNull);
    expect(node!.testID, 'test-button');

    // Test unregistration
    unregisterAgentAction('test-button');
    expect(getAllTestIDs().contains('test-button'), false);
  });
}
