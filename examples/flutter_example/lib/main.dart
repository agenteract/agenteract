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
  final TextEditingController _textController = TextEditingController();
  int _longPressCount = 0;
  double _cardOffset = 0;
  int _swipeCount = 0;
  final ScrollController _horizontalScrollController = ScrollController();
  final ScrollController _verticalScrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    // Track scroll position for agent commands
    _horizontalScrollController.trackForAgent('horizontal-scroll');
    _verticalScrollController.trackForAgent('main-list');
  }

  @override
  void dispose() {
    _textController.dispose();
    _horizontalScrollController.dispose();
    _verticalScrollController.dispose();
    super.dispose();
  }

  void _incrementCounter() {
    setState(() {
      _counter++;
    });
    debugPrint('Counter incremented to $_counter');
  }

  void _resetAll() {
    setState(() {
      _counter = 0;
      _textController.clear();
      _longPressCount = 0;
      _swipeCount = 0;
      _cardOffset = 0;
    });
    debugPrint('All values reset');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
        title: Text(widget.title).withAgent('app-title'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            // Tap Example Section
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Tap Example',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ).withAgent('tap-example-title'),
                  const SizedBox(height: 10),
                  const Text('You have pushed the button this many times:')
                      .withAgent('counter-label'),
                  Text(
                    '$_counter',
                    style: Theme.of(context).textTheme.headlineMedium,
                  ).withAgent('counter-value'),
                  const SizedBox(height: 10),
                  Text('Tap count: $_counter').withAgent('tap-count-text'),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Input Example Section
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Input Example',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ).withAgent('input-example-title'),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _textController,
                    decoration: const InputDecoration(
                      border: OutlineInputBorder(),
                      labelText: 'Enter text',
                    ),
                    onChanged: (text) {
                      debugPrint('Input changed: $text');
                    },
                  ).withAgent(
                    'text-input',
                    onChangeText: (text) {
                      debugPrint('Agent input: $text');
                      _textController.text = text;
                      // Move cursor to end
                      _textController.selection = TextSelection.fromPosition(
                        TextPosition(offset: _textController.text.length),
                      );
                    },
                  ),
                  const SizedBox(height: 10),
                  Text('Input value: ${_textController.text}')
                      .withAgent('input-display-text'),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Long Press Example Section
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Long Press Example',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ).withAgent('long-press-example-title'),
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.purple,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Text(
                      'Press and hold',
                      style: TextStyle(color: Colors.white),
                    ),
                  ).withAgent(
                    'long-press-view',
                    onTap: () {
                      debugPrint('Tapped (not long pressed)');
                    },
                    onLongPress: () {
                      setState(() {
                        _longPressCount++;
                      });
                      debugPrint('Long pressed! Count: $_longPressCount');
                    },
                  ),
                  const SizedBox(height: 10),
                  Text('Long press count: $_longPressCount')
                      .withAgent('long-press-count-text'),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Swipeable Card Example Section
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Swipeable Card Example',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ).withAgent('swipe-example-title'),
                  const SizedBox(height: 10),
                  const Text(
                    'Swipe left/right or up/down',
                    style: TextStyle(fontSize: 12, color: Colors.grey),
                  ),
                  const SizedBox(height: 10),
                  Transform.translate(
                    offset: Offset(_cardOffset, 0),
                    child: Container(
                      height: 100,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [Colors.green, Colors.blue],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Text(
                              'Swipe me!',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 20,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            Text(
                              'Swipe count: $_swipeCount',
                              style: const TextStyle(
                                color: Color.fromRGBO(255, 255, 255, 0.8),
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ).withAgent(
                      'swipeable-card',
                      onSwipe: (direction, velocity) {
                        setState(() {
                          _swipeCount++;
                        });
                        debugPrint(
                            'Card swiped $direction with velocity $velocity. Count: $_swipeCount');

                        // Animate the card based on direction
                        double distance;
                        switch (velocity) {
                          case 'fast':
                            distance = 200;
                            break;
                          case 'medium':
                            distance = 100;
                            break;
                          default:
                            distance = 50;
                        }

                        setState(() {
                          if (direction == 'left') {
                            _cardOffset = -distance;
                          } else if (direction == 'right') {
                            _cardOffset = distance;
                          } else {
                            _cardOffset = 0;
                          }
                        });

                        // Reset after animation
                        Future.delayed(const Duration(milliseconds: 500), () {
                          if (mounted) {
                            setState(() {
                              _cardOffset = 0;
                            });
                          }
                        });
                      },
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Horizontal Scroll Example Section
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Horizontal Scroll Example',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ).withAgent('horizontal-scroll-title'),
                  const SizedBox(height: 10),
                  SizedBox(
                    height: 90,
                    child: ListView.builder(
                      controller: _horizontalScrollController,
                      scrollDirection: Axis.horizontal,
                      itemCount: 20,
                      itemBuilder: (context, index) {
                        return Container(
                          width: 120,
                          margin: const EdgeInsets.only(right: 15),
                          decoration: BoxDecoration(
                            color: Colors.orange,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Center(
                            child: Text(
                              'Item ${index + 1}',
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        );
                      },
                    ).withAgent(
                      'horizontal-scroll',
                      onScroll: (direction, amount) {
                        final currentPosition =
                            _horizontalScrollController.offset;
                        double newPosition;

                        switch (direction) {
                          case 'left':
                            newPosition = currentPosition - amount;
                            break;
                          case 'right':
                            newPosition = currentPosition + amount;
                            break;
                          default:
                            return;
                        }

                        _horizontalScrollController.animateTo(
                          newPosition.clamp(
                            0.0,
                            _horizontalScrollController
                                .position.maxScrollExtent,
                          ),
                          duration: const Duration(milliseconds: 300),
                          curve: Curves.easeInOut,
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Vertical Scroll Example Section
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Vertical Scroll List',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ).withAgent('vertical-scroll-title'),
                  const SizedBox(height: 10),
                  const Text(
                    'Scrollable list of 50 items',
                    style: TextStyle(fontSize: 12, color: Colors.grey),
                  ),
                  const SizedBox(height: 10),
                  Container(
                    height: 200,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: ListView.builder(
                      controller: _verticalScrollController,
                      itemCount: 50,
                      itemBuilder: (context, index) {
                        return Container(
                          padding: const EdgeInsets.symmetric(
                            vertical: 8,
                            horizontal: 12,
                          ),
                          decoration: BoxDecoration(
                            color: index % 2 == 0
                                ? Colors.white
                                : Colors.grey.shade100,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text('List item ${index + 1}'),
                        );
                      },
                    ).withAgent(
                      'main-list',
                      onScroll: (direction, amount) {
                        final currentPosition =
                            _verticalScrollController.offset;
                        double newPosition;

                        switch (direction) {
                          case 'up':
                            newPosition = currentPosition - amount;
                            break;
                          case 'down':
                            newPosition = currentPosition + amount;
                            break;
                          default:
                            return;
                        }

                        _verticalScrollController.animateTo(
                          newPosition.clamp(
                            0.0,
                            _verticalScrollController.position.maxScrollExtent,
                          ),
                          duration: const Duration(milliseconds: 300),
                          curve: Curves.easeInOut,
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Reset Button
            Center(
              child: ElevatedButton(
                onPressed: _resetAll,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 32,
                    vertical: 12,
                  ),
                ),
                child: const Text('Reset All'),
              ).withAgent('reset-button', onTap: _resetAll),
            ),
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
