import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:agenteract/agenteract.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  // This widget is the root of your application.
  @override
  Widget build(BuildContext context) {
    final app = MaterialApp(
      title: 'Agenteract Flutter Demo',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
      ),
      home: const MyHomePage(title: 'Agenteract Flutter Demo'),
    );

    // Wrap with AgentDebugBridge in debug mode
    if (kDebugMode) {
      return AgentDebugBridge(
        projectName: 'flutter-app',
        child: app,
      );
    }
    return app;
  }
}

class MyHomePage extends StatefulWidget {
  const MyHomePage({super.key, required this.title});

  // This widget is the home page of your application. It is stateful, meaning
  // that it has a State object (defined below) that contains fields that affect
  // how it looks.

  // This class is the configuration for the state. It holds the values (in this
  // case the title) provided by the parent (in this case the App widget) and
  // used by the build method of the State. Fields in a Widget subclass are
  // always marked "final".

  final String title;

  @override
  State<MyHomePage> createState() => _MyHomePageState();
}

class _MyHomePageState extends State<MyHomePage> {
  int _counter = 0;
  String _inputText = '';

  void _incrementCounter() {
    setState(() {
      _counter++;
    });
    debugPrint('Counter incremented to $_counter');
  }

  void _resetCounter() {
    setState(() {
      _counter = 0;
    });
    debugPrint('Counter reset');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
        title: Text(widget.title).withAgent('app-title'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            const Text('You have pushed the button this many times:')
                .withAgent('counter-label'),
            Text(
              '$_counter',
              style: Theme.of(context).textTheme.headlineMedium,
            ).withAgent('counter-value'),
            const SizedBox(height: 32),
            TextField(
              decoration: const InputDecoration(
                border: OutlineInputBorder(),
                labelText: 'Enter text',
              ),
              onChanged: (text) {
                setState(() {
                  _inputText = text;
                });
                debugPrint('Input changed: $text');
              },
            ).withAgent(
              'text-input',
              onChangeText: (text) {
                debugPrint('Input changed: $text');
                setState(() {
                  _inputText = text;
                });
              },
            ),
            const SizedBox(height: 16),
            Text('You typed: $_inputText').withAgent('input-display'),
            const SizedBox(height: 32),
            ElevatedButton(
              onPressed: _resetCounter,
              child: const Text('Reset Counter'),
            ).withAgent('reset-button', onTap: _resetCounter),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _incrementCounter,
        tooltip: 'Increment',
        child: const Icon(Icons.add),
      ).withAgent('increment-button', onTap: _incrementCounter),
    );
  }
}
