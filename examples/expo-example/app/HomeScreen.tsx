import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { createAgentBinding } from '@agenteract/react';
import { Pressable, StyleSheet } from 'react-native';

export default function HomeScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Home</ThemedText>
        <Pressable {...createAgentBinding({
            testID: 'button',
            onPress: () => console.log('Simulate button pressed'),
          })}
        >
          <ThemedText>Simulate Target</ThemedText>
        </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
