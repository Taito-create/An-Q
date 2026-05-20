import { registerRootComponent } from 'expo';
import { View, Text } from 'react-native';

function App() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontSize: 24 }}>Hello World!</Text>
    </View>
  );
}

registerRootComponent(App);
