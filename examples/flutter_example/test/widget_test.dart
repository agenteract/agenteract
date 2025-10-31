// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:flutter_example/main.dart';

void main() {
  testWidgets('Counter increments smoke test', (WidgetTester tester) async {
    // Build our app without AgentDebugBridge (kDebugMode is false in tests)
    // This prevents WebSocket connection attempts during testing
    await tester.pumpWidget(
      const MaterialApp(
        title: 'Agenteract Flutter Demo',
        home: MyHomePage(title: 'Agenteract Flutter Demo'),
      ),
    );

    // Verify that our counter starts at 0.
    expect(find.text('0'), findsOneWidget);
    expect(find.text('1'), findsNothing);

    // Tap the '+' icon and trigger a frame.
    await tester.tap(find.byIcon(Icons.add));
    await tester.pump();

    // Verify that our counter has incremented.
    expect(find.text('0'), findsNothing);
    expect(find.text('1'), findsOneWidget);
  });

  testWidgets('Text input updates correctly', (WidgetTester tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: MyHomePage(title: 'Test'),
      ),
    );

    // Find the text field and scroll to it
    final textField = find.byType(TextField);
    await tester.ensureVisible(textField);
    await tester.pumpAndSettle();

    // Enter text
    await tester.enterText(textField, 'Hello Flutter');
    await tester.pump();

    // Verify the text controller has the value
    final textFieldWidget = tester.widget<TextField>(textField);
    expect(textFieldWidget.controller?.text, 'Hello Flutter');
  });

  testWidgets('Reset button clears all state', (WidgetTester tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: MyHomePage(title: 'Test'),
      ),
    );

    // Increment counter
    await tester.tap(find.byIcon(Icons.add));
    await tester.pump();

    // Counter value is in a section - find it by ancestor
    expect(find.text('1'), findsOneWidget);

    // Scroll to and tap reset button
    final resetButton = find.text('Reset All');
    await tester.ensureVisible(resetButton);
    await tester.pumpAndSettle();

    await tester.tap(resetButton);
    await tester.pump();

    // Verify counter is reset
    expect(find.text('0'), findsOneWidget);
  });
}
