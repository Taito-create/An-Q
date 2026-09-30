import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { useLocation, useNavigate } from 'react-router-dom';
import { SoundManager } from './sound';
import { useTheme } from './theme';
import { Home, PenSquare, Share2, Package } from 'lucide-react';

// タブ数と各タブ幅（ナビバー全体を等分した1マスの幅）
const TAB_COUNT = 4;

// 選択インジケーターのサイズ（Lottie: Selected_Mask）※大きくしました
const INDICATOR_WIDTH = 80;   // 64 → 80
const INDICATOR_HEIGHT = 64;  // 52 → 64
const INDICATOR_RADIUS = 18;  // 14 → 18

// グローエフェクトのサイズ（Lottie: Highlight）※大きくしました
const GLOW_SIZE = 60;         // 48 → 60
const GLOW_RADIUS = 16;       // 12 → 16

// Web（react-native-web）では JS ドライバ、ネイティブではネイティブドライバを使用
// （Web で useNativeDriver:true にすると警告が出るため）
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

// 各タブに属する詳細画面（タブ直下パスだけでなく、これらの画面でも対応タブをアクティブにする）
const TABS_SCREENS: Record<string, string[]> = {
  // /timer はクイズ設定画面（/quiz）から開かれるため、ホームタブ扱いにする
  '/': ['/timer'],
  '/create': ['/browse'],
  '/multi': ['/inbox', '/battle'],
  '/sub': ['/settings', '/music', '/appSettings', '/profile', '/missions', '/statistics', '/credits', '/shop', '/gacha', '/achievements', '/calendar'],
};

const BottomNavBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { colors: themeColors } = useTheme();
  // useTheme が不正・欠損値を返した場合のフォールバック（透明バー防止のガード）
  const colors = {
    card: themeColors?.card || '#161B22',
    border: themeColors?.border || '#30363D',
    primary: themeColors?.primary || '#00FFC8',
    textSecondary: themeColors?.textSecondary || '#8B949E',
    text: themeColors?.text || '#E6EDF3',
  };

  // ウィンドウ幅（Web でのリサイズに対応するため state で保持）
  const [screenWidth, setScreenWidth] = useState(Dimensions.get('window').width);

  // アニメーション値
  const indicatorPosition = useRef(new Animated.Value(0)).current;
  const indicatorScale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const glowScale = useRef(new Animated.Value(0.8)).current;
  // 不透明度は初期値 1（フェードインに依存しない即時表示）
  // ※ 旧実装は初期値 0 でフェードインしており、アニメーションが完了しないと
  //    opacity: 0 のまま＝「ナビバーが透明で見えない」不具合の原因だった
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // リサイズ検知（Web でウィンドウ幅が変わったら再計算）
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      if (window && window.width) setScreenWidth(window.width);
    });
    return () => sub?.remove();
  }, []);

  // タブ定義
  const navItems = [
    { id: 'home', icon: Home, label: 'ホーム', path: '/' },
    { id: 'create', icon: PenSquare, label: '作成', path: '/create' },
    { id: 'multi', icon: Share2, label: 'マルチ', path: '/multi' },
    { id: 'sub', icon: Package, label: 'サブ', path: '/sub' },
  ];

  // アクティブ判定
  const isActive = (path: string) => {
    if (path === '/') {
      if (location.pathname === '/') return true;
      // ホーム直下の詳細画面（例: /timer）もホームタブをアクティブにする
      const homeSiblings = TABS_SCREENS['/'] || [];
      return homeSiblings.some((p) => location.pathname === p || location.pathname.startsWith(p + '/'));
    }
    // タブ直下パス（/create /create/manual /multi /sub など）は前方一致で判定
    if (location.pathname.startsWith(path)) return true;
    // 詳細画面（例: /browse, /inbox, /settings など）は所属タブをアクティブにする
    const siblings = TABS_SCREENS[path] || [];
    return siblings.some((p) => location.pathname === p || location.pathname.startsWith(p + '/'));
  };

  // アクティブインデックス
  const getActiveIndex = () => {
    const index = navItems.findIndex((item) => isActive(item.path));
    return index !== -1 ? index : 0;
  };

  // 各タブの幅（ナビバー全体を等分）
  const getTabWidth = () => screenWidth / TAB_COUNT;

  // インジケーターの X 位置（中央揃え）
  const getIndicatorX = (index: number) => {
    const tabCenter = index * getTabWidth() + getTabWidth() / 2;
    return tabCenter - INDICATOR_WIDTH / 2;
  };

  // アニメーション実行（Lottie の「スライド → バウンス → グロー」の再現）
  const animateToTab = (index: number) => {
    const targetX = getIndicatorX(index);

    // 1. 位置移動（Lottie: Select_mover）＝スプリングでスライド
    Animated.spring(indicatorPosition, {
      toValue: targetX,
      friction: 10,
      tension: 50,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();

    // 2. スケールバウンス（Lottie: Selected_Mask の 1.0 → 1.15 → 1.0）
    Animated.sequence([
      Animated.spring(indicatorScale, {
        toValue: 1.15,
        friction: 4,
        tension: 60,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.spring(indicatorScale, {
        toValue: 1.0,
        friction: 4,
        tension: 60,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start();

    // 3. グローエフェクト（Lottie: Highlight）＝短く光って消える
    Animated.parallel([
      Animated.sequence([
        Animated.timing(glowOpacity, {
          toValue: 0.5,
          duration: 150,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(glowOpacity, {
          toValue: 0,
          duration: 350,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]),
      Animated.sequence([
        Animated.spring(glowScale, {
          toValue: 1.2,
          friction: 4,
          tension: 50,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.spring(glowScale, {
          toValue: 0.8,
          friction: 4,
          tension: 50,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]),
    ]).start();
  };

  // タブ変更時のアニメーション（初回ロード時も一度実行）
  useEffect(() => {
    animateToTab(getActiveIndex());
  }, [location.pathname, screenWidth]);

  // 初期位置（アニメーションなしで即座にセット）
  useEffect(() => {
    indicatorPosition.setValue(getIndicatorX(getActiveIndex()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ハンドラ
  const handlePress = (path: string) => {
    SoundManager.play('decide');
    if (path !== '#') {
      navigate(path);
    }
  };

  // ※ フェードイン用の useEffect は削除（初期値 1 の即時表示に変更したため不要）

  return (
    <Animated.View style={[styles.bottomNav, { backgroundColor: colors.card, borderTopColor: colors.border, opacity: fadeAnim }]}>
      {/* 影のレイヤー（Lottie: Container_Shadow に相当） */}
      <Animated.View
        style={[
          styles.shadowLayer,
          {
            transform: [{ translateX: indicatorPosition }],
            boxShadow: `0px 4px 12px ${colors.primary}40`,
          },
        ]}
      />

      {/* 選択インジケーター（Lottie: Selected_Mask に相当） */}
      <Animated.View
        style={[
          styles.indicator,
          {
            transform: [{ translateX: indicatorPosition }, { scale: indicatorScale }],
            backgroundColor: colors.primary + '18',
            borderColor: colors.primary + '30',
          },
        ]}
      />

      {/* グラデーション背景（Lottie: Container_Highlight に相当） */}
      <Animated.View
        style={[
          styles.gradientOverlay,
          { transform: [{ translateX: indicatorPosition }] },
        ]}
      >
        <View style={[styles.gradientFill, { backgroundColor: colors.primary + '08' }]} />
      </Animated.View>

      {/* グローエフェクト（Lottie: Highlight に相当） */}
      <Animated.View
        style={[
          styles.glowEffect,
          {
            transform: [{ translateX: indicatorPosition }, { scale: glowScale }],
            opacity: glowOpacity,
            backgroundColor: colors.primary,
          },
        ]}
      />

      {/* タブアイコンとラベル */}
      {navItems.map((item) => {
        const active = isActive(item.path);
        return (
          <TouchableOpacity
            key={item.id}
            style={[
              styles.navItem,
              Platform.OS === 'web'
                ? ({ outlineStyle: 'none' } as any)
                : null,
            ]}
            onPress={() => handlePress(item.path)}
            activeOpacity={0.7}
          >
            <View style={styles.iconWrapper}>
              <item.icon
                size={24}
                color={active ? colors.primary : colors.textSecondary}
                strokeWidth={active ? 2.2 : 1.5}
              />
            </View>
            <Text
              style={[
                styles.navLabel,
                {
                  color: active ? colors.primary : colors.textSecondary,
                  fontWeight: active ? 'bold' : '500',
                },
              ]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    // 背景色は固定のダークカード色を指定（テーマ取得失敗時の透明化を回避するフォールバック層。
    // 実際の表示色はインラインの colors.card が上書きし、テーマ追従も維持される）
    backgroundColor: '#161B22',
    borderTopColor: '#30363D',
    paddingVertical: 6,
    paddingBottom: 12,
    borderTopWidth: 1,
    zIndex: 100,
    height: 72,
    // ★ ビューポート基準で画面下部に固定 ★
    // （親コンテナの高さが未確定だと absolute + bottom:0 は親の上端基準になり
    //   上部に一瞬表示されるため、fixed を利用する）
    position: 'fixed' as any,
    bottom: 0,
    left: 0,
    right: 0,
    // 影を追加（浮き上がった印象）
    boxShadow: '0px -4px 12px rgba(0,0,0,0.4)',
    elevation: 8,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    zIndex: 2,
    paddingHorizontal: 4,
    paddingVertical: 4,
    flex: 1,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 30,
  },

  // ========== アニメーション要素 ==========

  // 1. 選択インジケーター（Lottie: Selected_Mask）
  indicator: {
    position: 'absolute',
    left: 0,
    top: 2,
    width: INDICATOR_WIDTH,
    height: INDICATOR_HEIGHT,
    borderRadius: INDICATOR_RADIUS,
    backgroundColor: 'rgba(0,122,255,0.08)',
    zIndex: 0,
  },

  // 2. グラデーションオーバーレイ（Lottie: Container_Highlight）
  gradientOverlay: {
    position: 'absolute',
    left: 0,
    top: 2,
    width: INDICATOR_WIDTH,
    height: INDICATOR_HEIGHT,
    borderRadius: INDICATOR_RADIUS,
    overflow: 'hidden',
    zIndex: 0,
  },
  gradientFill: {
    width: '100%',
    height: '100%',
    opacity: 0.5,
  },

  // 3. グローエフェクト（Lottie: Highlight）
  glowEffect: {
    position: 'absolute',
    left: 0,
    top: 4,
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    borderRadius: GLOW_RADIUS,
    zIndex: 0,
    opacity: 0,
  },

  // 4. 影レイヤー（Lottie: Container_Shadow）
  shadowLayer: {
    position: 'absolute',
    left: 0,
    top: 4,
    width: INDICATOR_WIDTH - 8,
    height: INDICATOR_HEIGHT - 4,
    borderRadius: INDICATOR_RADIUS - 2,
    zIndex: -1,
    elevation: 6,
   },
});

export default BottomNavBar;