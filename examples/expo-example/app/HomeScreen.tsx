import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { createAgentBinding } from '@agenteract/react';
import { Pressable, ScrollView, StyleSheet, TextInput, View, PanResponder } from 'react-native';
import { useState, useRef, useEffect } from 'react';

interface AppState {
  username: string;
  count: number;
}

interface HomeScreenProps {
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
}

export default function HomeScreen({ appState, setAppState }: HomeScreenProps) {
  const [cardPosition, setCardPosition] = useState(0);

  // Sync local username state with app state
  useEffect(() => {
    console.log('[HomeScreen] App state updated:', appState);
  }, [appState]);

  // Create a PanResponder for the swipeable card
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        setCardPosition(gestureState.dx);
        console.log('Card swiped:', gestureState.dx > 0 ? 'right' : 'left', 'distance:', Math.abs(gestureState.dx));
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (Math.abs(gestureState.dx) > 100) {
          console.log('Swipe completed:', gestureState.dx > 0 ? 'right' : 'left');
        }
        setCardPosition(0); // Reset position
      },
    })
  ).current;

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Home</ThemedText>
        <Pressable {...createAgentBinding({
            testID: 'test-button',
            onPress: () => {
              console.log('Simulate button pressed');
              setAppState(prev => ({ ...prev, count: prev.count + 1 }));
            },
          })}
        >
          <ThemedText>Simulate Target (Count: {appState.count})</ThemedText>
        </Pressable>

        <View style={styles.textInputContainer}>
          <TextInput
          // onChangeText={(text) => {console.log('Simulate text input:', text); setUsername(text);}}
          placeholder="Enter username"
          value={appState.username}
          style={styles.textInput}
          {...createAgentBinding({
            testID: 'username-input',
            onChangeText: (text) => setAppState(prev => ({ ...prev, username: text })),
          })}
           />
        </View>

        { /* Swipeable Card Example */ }
        <View style={styles.swipeContainer}>
          <ThemedText style={styles.sectionTitle}>Swipeable Card (swipe left/right)</ThemedText>
          <View
            style={[styles.swipeCard, { transform: [{ translateX: cardPosition }] }]}
            {...panResponder.panHandlers}
            {...createAgentBinding({
              testID: 'swipeable-card',
              onSwipe: (direction, velocity) => {
                console.log('Agent swipe detected:', direction, 'velocity:', velocity);
                // Simulate a swipe by moving the card
                const distance = velocity === 'fast' ? 200 : velocity === 'medium' ? 100 : 50;
                const offset = direction === 'left' ? -distance : direction === 'right' ? distance : 0;
                setCardPosition(offset);
                setTimeout(() => setCardPosition(0), 500);
              },
            })}
          >
            <ThemedText style={styles.cardText}>Swipe me!</ThemedText>
          </View>
        </View>

        { /* Horizontal ScrollView Example */ }
        <View style={styles.horizontalScrollContainer}>
          <ThemedText style={styles.sectionTitle}>Horizontal Scroll (swipe left/right)</ThemedText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={true}
            {...createAgentBinding({
              testID: 'horizontal-scroll',
            })}
            style={styles.horizontalScroll}
          >
            {Array.from({ length: 10 }).map((_, index) => (
              <View key={index} style={styles.horizontalItem}>
                <ThemedText>Item {index + 1}</ThemedText>
              </View>
            ))}
          </ScrollView>
        </View>

        { /* Vertical scroll view example */ }
        <View style={styles.scrollContainer}>
          <ThemedText style={styles.sectionTitle}>Vertical Scroll</ThemedText>
          <ScrollView {...createAgentBinding({
            testID: 'main-list',
          })}
          style={styles.verticalScroll}
          >
            {Array.from({ length: 100 }).map((_, index) => (
              <ThemedText key={index}>Scroll view example {index}</ThemedText>
            ))}
          </ScrollView>
        </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 50,
    alignItems: 'center',
  },
  textInputContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    margin: 12,
    width: '80%',
  },
  textInput: {
    color: 'black',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 10,
    width: '100%',
    height: 40,
    margin: 12,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  swipeContainer: {
    width: '80%',
    marginVertical: 20,
    alignItems: 'center',
  },
  swipeCard: {
    width: 200,
    height: 100,
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  cardText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  horizontalScrollContainer: {
    width: '90%',
    marginVertical: 10,
  },
  horizontalScroll: {
    height: 80,
  },
  horizontalItem: {
    width: 120,
    height: 60,
    backgroundColor: '#2196F3',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  scrollContainer: {
    width: '90%',
    height: 200,
    marginVertical: 10,
  },
  verticalScroll: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 8,
  },
});
