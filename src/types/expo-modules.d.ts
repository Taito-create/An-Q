// Type declarations for Expo modules when used with Vite

declare module 'expo-av' {
  export const Audio: any;
  export const Video: any;
  export default { Audio, Video };
}

declare module 'expo-notifications' {
  export function scheduleNotificationAsync(options: any): Promise<string>;
  export function cancelScheduledNotificationAsync(identifier: string): Promise<void>;
  export function requestPermissionsAsync(): Promise<{ granted: boolean }>;
  export function getExpoPushTokenAsync(options?: any): Promise<{ data: string }>;
  export function setNotificationChannelAsync(name: string, options: any): Promise<void>;
  export function addNotificationReceivedListener(listener: (event: any) => void): { remove: () => void };
  export function addNotificationResponseReceivedListener(listener: (event: any) => void): { remove: () => void };
  export const IOSAuthorizationStatus: any;
  export const AndroidImportance: any;
}

declare module 'expo-status-bar' {
  export function StatusBar(props: any): JSX.Element;
  export function setStatusBarStyle(style: any): void;
}

declare module '@expo/vector-icons' {
  import React from 'react';
  interface IconProps {
    name: string;
    size?: number | string;
    color?: string;
    style?: any;
  }
  export class Ionicons extends React.Component<IconProps> {}
  export class MaterialIcons extends React.Component<IconProps> {}
  export class MaterialCommunityIcons extends React.Component<IconProps> {}
  export class FontAwesome extends React.Component<IconProps> {}
  export class Feather extends React.Component<IconProps> {}
  export class AntDesign extends React.Component<IconProps> {}
  export class Entypo extends React.Component<IconProps> {}
}

declare module 'react-native-calendars' {
  import React from 'react';
  import { ViewStyle } from 'react-native';

  interface DayComponentProps {
    date?: {
      dateString: string;
      day: number;
      month: number;
      year: number;
      timestamp: number;
    };
    state?: 'disabled' | 'today' | 'selected' | '';
    marking?: any;
    theme?: any;
  }

  interface CalendarProps {
    onDayPress?: (day: any) => void;
    markedDates?: any;
    markingType?: string;
    onMonthChange?: (date: any) => void;
    dayComponent?: React.ComponentType<DayComponentProps>;
    theme?: any;
    current?: string;
    minDate?: string;
    maxDate?: string;
    firstDay?: number;
    hideArrows?: boolean;
    hideExtraDays?: boolean;
    renderArrow?: (direction: 'left' | 'right') => JSX.Element;
    onArrowLeftPress?: () => void;
    onArrowRightPress?: () => void;
    style?: ViewStyle;
    key?: string;
  }

  export class Calendar extends React.Component<CalendarProps> {}

  export const LocaleConfig: {
    locales: Record<string, {
      monthNames: string[];
      monthNamesShort: string[];
      dayNames: string[];
      dayNamesShort: string[];
    }>;
    defaultLocale: string;
  };
}

declare module 'xdate' {
  class XDate {
    constructor(date?: string | number | Date);
    toString(format?: string): string;
    getFullYear(): number;
    getMonth(): number;
    getDate(): number;
    getDay(): number;
    getTime(): number;
    setHours(h: number, m: number, s: number, ms: number): void;
    setDate(d: number): void;
    setMonth(m: number): void;
    setFullYear(y: number): void;
    toDate(): Date;
  }
  export default XDate;
}

declare module 'lodash.memoize' {
  function memoize<T extends (...args: any[]) => any>(fn: T, resolver?: (...args: any[]) => any): T;
  export default memoize;
}