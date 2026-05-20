import { registerRootComponent } from 'expo';
import { View, Text } from 'react-native';

// 最もシンプルなコンポーネント
function App() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Hello World!</Text>
    </View>
  );
}

registerRootComponent(App);
