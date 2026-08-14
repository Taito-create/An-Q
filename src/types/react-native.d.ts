import 'react-native';

/**
 * react-native-web 用の型増補。
 *
 * react-native-web 0.21 は deprecated な shadow* props の代わりに CSS の boxShadow を推奨しているが、
 * @types/react-native (0.72) の ViewStyle には boxShadow が含まれていない。
 * また、react-native-web は CSS Grid（gridTemplateColumns など）にも対応しているが、
 * @types/react-native の ViewStyle には含まれていない。
 * そのため、これらを ViewStyle に追加して型エラーを解消する。
 */
declare module 'react-native' {
  interface ViewStyle {
    /**
     * CSS box-shadow。例: '0px 2px 4px rgba(0,0,0,0.1)'
     */
    boxShadow?: string;
    /**
     * CSS Grid の列テンプレート。例: 'repeat(4, 1fr)'
     */
    gridTemplateColumns?: string;
    /**
     * CSS Grid のギャップ。例: '12px'
     */
    gridGap?: string | number;
  }
}
