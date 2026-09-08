// Web stub for react-native-svg (Vite build)
// Provides Svg and Circle components using react-native-web primitives
import React from 'react';
import { View } from 'react-native';

export const Svg = ({ children, width, height, style }: any) => (
  <View style={[{ width, height }, style]}>{children}</View>
);

export const Circle = (props: any) => <View {...props} />;
export const Rect = (props: any) => <View {...props} />;
export const Path = (props: any) => <View {...props} />;
export const G = (props: any) => <View {...props} />;
export const Text = (props: any) => <View {...props} />;
export const Line = (props: any) => <View {...props} />;
export const Ellipse = (props: any) => <View {...props} />;
export const Polygon = (props: any) => <View {...props} />;
export const Polyline = (props: any) => <View {...props} />;
export const Defs = (props: any) => <View {...props} />;
export const ClipPath = (props: any) => <View {...props} />;
export const LinearGradient = (props: any) => <View {...props} />;
export const RadialGradient = (props: any) => <View {...props} />;
export const Stop = (props: any) => <View {...props} />;
export const TSpan = (props: any) => <View {...props} />;
export const SvgXml = (props: any) => <View {...props} />;
export const SvgCss = (props: any) => <View {...props} />;
export const SvgUri = (props: any) => <View {...props} />;
export const SvgWithCss = (props: any) => <View {...props} />;
export const LocalSvg = (props: any) => <View {...props} />;
export { Svg as default };
