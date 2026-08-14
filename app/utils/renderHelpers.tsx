import React from 'react';
import { Text } from 'react-native';

/**
 * View の子要素として安全にレンダリングするヘルパー。
 *
 * react-native-web では、<View> の直接の子に生テキスト（文字列・数値・空文字 '' など
 * 式が評価した text node）があると次のエラーが発生する：
 *   Unexpected text node: .... A text node cannot be a child of a <View>
 * そのため、文字列を自動的に <Text> でラップする。
 *
 * @example
 *   <View>{safeRender(myTextOrNode)}</View>
 *   <PatternBackground>{safeRender(children)}</PatternBackground>
 */
export const safeRender = (children: React.ReactNode): React.ReactNode => {
  if (children == null) return null;

  if (typeof children === 'string') {
    return <Text>{children}</Text>;
  }

  if (Array.isArray(children)) {
    return children.map((child, index) => {
      if (typeof child === 'string') {
        return <Text key={index}>{child}</Text>;
      }
      if (Array.isArray(child)) {
        return safeRender(child);
      }
      return child;
    });
  }

  return children;
};

export default safeRender;