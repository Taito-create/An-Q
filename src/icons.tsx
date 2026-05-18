import React from 'react';
import { Text } from 'react-native';

// Unicode icon map for commonly used Ionicons names
const ICON_MAP: Record<string, string> = {
  'bulb': '\uD83D\uDCA1',
  'calendar-outline': '\uD83D\uDCC5',
  'clipboard-outline': '\uD83D\uDCCB',
  'ribbon-outline': '\uD83C\uDF80',
  'storefront-outline': '\uD83C\uDFEA',
  'timer-outline': '\u23F1\uFE0F',
  'color-palette-outline': '\uD83C\uDFA8',
  'close-outline': '\u2716\uFE0F',
  'apps-outline': '\uD83D\uDD39',
  'menu-outline': '\u2630\uFE0F',
  'swap-horizontal-outline': '\u2194\uFE0F',
  'language-outline': '\uD83C\uDF10',
  'settings-outline': '\u2699\uFE0F',
  'chevron-forward': '\u276F\uFE0F',
  'play': '\u25B6\uFE0F',
  'add': '\u2795',
  'stats-chart': '\uD83D\uDCCA',
  'musical-notes': '\uD83C\uDFB5',
  'close': '\u2716\uFE0F',
  'checkmark': '\u2714\uFE0F',
  'arrow-back': '\u2190\uFE0F',
  'arrow-forward': '\u2192\uFE0F',
  'remove': '\u2796',
  'search': '\uD83D\uDD0D',
  'trash': '\uD83D\uDDD1\uFE0F',
  'pencil': '\u270F\uFE0F',
  'information-circle': '\u2139\uFE0F',
  'alert-circle': '\u26A0\uFE0F',
  'checkmark-circle': '\u2705',
  'home': '\uD83C\uDFE0',
  'person': '\uD83D\uDC64',
  'people': '\uD83D\uDC65',
  'star': '\u2B50',
  'star-outline': '\u2606',
  'heart': '\u2764\uFE0F',
  'heart-outline': '\u2661',
  'moon': '\uD83C\uDF19',
  'sunny': '\u2600\uFE0F',
  'flash': '\u26A1',
  'notifications': '\uD83D\uDD14',
  'mail': '\u2709\uFE0F',
  'share': '\uD83D\uDD17',
  'download': '\u2B07\uFE0F',
  'upload': '\u2B06\uFE0F',
  'refresh': '\uD83D\uDD04',
  'lock': '\uD83D\uDD12',
  'unlock': '\uD83D\uDD13',
  'eye': '\uD83D\uDC41\uFE0F',
  'eye-off': '\uD83D\uDC41\uFE0F',
  'flag': '\uD83D\uDEA9',
  'bookmark': '\uD83D\uDD16',
  'time': '\u23F0',
  'repeat': '\uD83D\uDD01',
  'shuffle': '\uD83D\uDD00',
  'pause': '\u23F8\uFE0F',
  'play-skip-back': '\u23EE\uFE0F',
  'play-skip-forward': '\u23ED\uFE0F',
  'volume-high': '\uD83D\uDD0A',
  'volume-mute': '\uD83D\uDD07',
  'headset': '\uD83C\uDFA7',
  'gift': '\uD83C\uDF81',
  'trophy': '\uD83C\uDFC6',
  'medal': '\uD83C\uDFC5',
  'school': '\uD83C\uDFEB',
  'book': '\uD83D\uDCD6',
  'library': '\uD83D\uDCDA',
  'server': '\uD83D\uDDA5\uFE0F',
  'code-slash': '\uD83D\uDCBB',
  'terminal': '\uD83D\uDDA5\uFE0F',
  'bug': '\uD83D\uDC1B',
  'rocket': '\uD83D\uDE80',
  'cog': '\u2699\uFE0F',
  'options': '\u2699\uFE0F',
  'help-circle': '\u2753',
  'chatbubble': '\uD83D\uDCAC',
  'chatbubbles': '\uD83D\uDD7A',
  'send': '\uD83D\uDCE9',
  'thumbs-up': '\uD83D\uDC4D',
  'thumbs-down': '\uD83D\uDC4E',
  'trending-up': '\uD83D\uDCC8',
  'trending-down': '\uD83D\uDCC9',
  'bar-chart': '\uD83D\uDCCA',
  'pie-chart': '\uD83E\uDE99',
  'globe': '\uD83C\uDF10',
  'map': '\uD83D\uDDFA\uFE0F',
  'location': '\uD83D\uDCCD',
  'navigate': '\uD83E\uDE94',
  'compass': '\uD83E\uDDED',
  'walk': '\uD83D\uDEB6',
  'bicycle': '\uD83D\uDEB2',
  'car': '\uD83D\uDE97',
  'airplane': '\u2708\uFE0F',
  'train': '\uD83D\uDE82',
  'bus': '\uD83D\uDE8C',
  'film': '\uD83C\uDFAC',
  'camera': '\uD83D\uDCF7',
  'videocam': '\uD83D\uDCF9',
  'image': '\uD83D\uDDBC\uFE0F',
  'images': '\uD83D\uDDBC\uFE0F',
  'music': '\uD83C\uDFB5',
  'mic': '\uD83C\uDFA4',
  'radio': '\uD83D\uDCFB',
};

export class Ionicons extends React.Component<{name: string; size?: number | string; color?: string; style?: any}> {
  render() {
    const { name, size = 24, color = '#000', style } = this.props;
    const icon = ICON_MAP[name] || '\u2753';
    const fontSize = typeof size === 'string' ? parseInt(size) || 24 : size;
    return (
      <Text style={[{ fontSize, color, lineHeight: fontSize * 1.2 }, style]}>
        {icon}
      </Text>
    );
  }
}

export class MaterialIcons extends React.Component<{name: string; size?: number | string; color?: string; style?: any}> {
  render() {
    return <Ionicons name={this.props.name} size={this.props.size} color={this.props.color} style={this.props.style} />;
  }
}

export class MaterialCommunityIcons extends React.Component<{name: string; size?: number | string; color?: string; style?: any}> {
  render() {
    return <Ionicons name={this.props.name} size={this.props.size} color={this.props.color} style={this.props.style} />;
  }
}

export class FontAwesome extends React.Component<{name: string; size?: number | string; color?: string; style?: any}> {
  render() {
    return <Ionicons name={this.props.name} size={this.props.size} color={this.props.color} style={this.props.style} />;
  }
}

export class Feather extends React.Component<{name: string; size?: number | string; color?: string; style?: any}> {
  render() {
    return <Ionicons name={this.props.name} size={this.props.size} color={this.props.color} style={this.props.style} />;
  }
}

export class AntDesign extends React.Component<{name: string; size?: number | string; color?: string; style?: any}> {
  render() {
    return <Ionicons name={this.props.name} size={this.props.size} color={this.props.color} style={this.props.style} />;
  }
}

export class Entypo extends React.Component<{name: string; size?: number | string; color?: string; style?: any}> {
  render() {
    return <Ionicons name={this.props.name} size={this.props.size} color={this.props.color} style={this.props.style} />;
  }
}

export default Ionicons;