import React, { useEffect, useState } from 'react';
import { View, Text, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { IMAGES } from '../constants/images';
import { getBattleStats, getTitleDisplay, isRemoteProfileImageUrl } from '../../src/utils/userProgress';
import { useOpponentProfile } from '../utils/battleProfile';

// ─────────────────────────────────────────────
// 対戦相手のプロフィールカード
// compact=true: アバター + 名前 + レベルの1行表示
//
// アバターは「画像は常にマウントし、完了までプレースホルダーを重ねる」方式。
//   - プレースホルダーだけを描画すると <Image> の onLoad が発火せず、
//     完了状態を判定できずにハングするため。（ Image は必ずマウントする ）
//   - 完了判定は onLoad / onLoadEnd / onError の3イベントと
//     タイムアウト（IMAGE_LOAD_TIMEOUT_MS）の4重の保険で行う。
//   - 読み込み中に既定画像（IMAGES.romea）を出さないことで、
//     プロフィール取得前にロメアが一瞬見えるフリッカーも防ぐ。
// ─────────────────────────────────────────────

interface OpponentCardProps {
  uid: string | null;
  label: '相手' | 'ホスト' | 'ゲスト';
  compact?: boolean;
}

/**
 * 画像ダウンロード完了とみなすまでの猶予(ms)。
 * onLoad / onLoadEnd / onError が発火しない場合でも、
 * 最悪でもこの時間でプレースホルダーが外れて画像（または既定画像）が見える。
 */
const IMAGE_LOAD_TIMEOUT_MS = 1_500;

export default function OpponentCard({ uid, label, compact = false }: OpponentCardProps) {
  const { colors } = useTheme();
  const { profile, loading } = useOpponentProfile(uid);

  // Firestore の profileImage は Cloudinary の http(s) URL を想定している。
  // 旧ドキュメントに Base64 が残っている場合は 1MB 制限の原因となるため、
  // ここでは既定画像へフォールバックする。
  const remoteImage = isRemoteProfileImageUrl(profile?.profileImage) ? profile.profileImage : null;

  // Cloudinary 画像のダウンロード完了を検知する。
  // ※ Image は常にマウントする（下でプレースホルダーを重ねる方式）。
  //   プレースホルダーだけを描画すると Image の onLoad が発火せず、
  //   完了状態を把握できずハングする。
  const [imageLoaded, setImageLoaded] = useState(false);
  useEffect(() => {
    // 相手や URL が変わったらダウンロード状態をリセットする
    setImageLoaded(false);
    if (!remoteImage) return;

    // onLoad / onLoadEnd / onError が発火しないケース（RNW のキャッシュ済み画像など）
    // の保険として、一定時間経過で必ず完了扱いにする
    const timer = setTimeout(() => setImageLoaded(true), IMAGE_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [uid, remoteImage]);

  // 画像の上に重ねるプレースホルダー。
  // プロフィール読み込み中、または 画像URL 判明済みだが未ダウンロード の間だけ表示する。
  const showPlaceholder = loading || (!!remoteImage && !imageLoaded);

  /**
   * アバターを描画する。
   * 画像は常にマウントし、完了まではグレーの円 + ActivityIndicator を重ねる。
   */
  const renderAvatar = (size: number) => {
    const avatarStyle = { width: size, height: size, borderRadius: size / 2 };

    return (
      <View style={avatarStyle}>
        {/* Cloudinary 画像、または既定画像（常にマウントして onLoad を発火させる） */}
        <Image
          key={remoteImage ?? 'default'}
          source={remoteImage ? { uri: remoteImage } : IMAGES.romea}
          style={[StyleSheet.absoluteFill, avatarStyle]}
          onLoad={() => setImageLoaded(true)}
          onLoadEnd={() => setImageLoaded(true)}
          onError={() => setImageLoaded(true)}
        />
        {/* 未完了の間だけ上に重ねる */}
        {showPlaceholder && (
          <View style={[StyleSheet.absoluteFill, styles.avatarPlaceholder, { backgroundColor: colors.border }]}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        )}
      </View>
    );
  };

  if (!uid) {
    return (
      <View style={[styles.placeholder, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
            {label}を待っています...
          </Text>
        )}
      </View>
    );
  }

  // 開発用 Bot は Firestore 上に存在しない仮想ユーザーのため、専用表示にする
  if (uid === 'dev-bot') {
    if (compact) {
      return (
        <View style={[styles.compact, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.avatarPlaceholder, { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.warning + '30' }]}>
            <Text style={{ color: colors.warning, fontWeight: 'bold', fontSize: 12 }}>BOT</Text>
          </View>
          <View style={styles.compactBody}>
            <Text style={[styles.name, { color: colors.warning }]}>
              {label}: DEV BOT
            </Text>
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              自動応答モード
            </Text>
          </View>
        </View>
      );
    }
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.warning }]}>
        <View style={[styles.avatarPlaceholder, { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.warning + '30' }]}>
          <Text style={{ color: colors.warning, fontWeight: 'bold', fontSize: 20 }}>BOT</Text>
        </View>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={[styles.name, { color: colors.warning }]}>DEV BOT</Text>
        <Text style={[styles.meta, { color: colors.textSecondary }]}>自動応答モード</Text>
      </View>
    );
  }

  const equipped = (profile as { equippedTitle?: string } | null)?.equippedTitle;
  const titleLabel = getTitleDisplay(equipped ?? profile?.currentTitle ?? 'apprentice', 'ja');
  // battleStats 未定義 (旧ドキュメント) は getBattleStats が 0 埋めで返す
  const stats = getBattleStats(profile);
  const statsText = stats.totalBattles === 0
    ? '戦績: なし'
    : `戦績: ${stats.totalBattles}戦 ${stats.wins}勝 ${stats.losses}敗 ${stats.draws}分`;

  if (compact) {
    return (
      <View style={[styles.compact, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {renderAvatar(36)}
        <View style={styles.compactBody}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {label}: {loading ? '読込中...' : profile?.username ?? '???'}
          </Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            Lv.{profile?.level ?? '-'} / {statsText}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {renderAvatar(72)}
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.name, { color: colors.text }]}>
        {loading ? '読込中...' : profile?.username ?? '???'}
      </Text>
      <Text style={[styles.meta, { color: colors.primary }]}>Lv.{profile?.level ?? '-'}</Text>
      <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
        {titleLabel}
      </Text>
      <Text style={[styles.meta, { color: colors.textSecondary }]}>
        {loading ? '戦績: 読込中...' : statsText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    borderWidth: 1, borderRadius: 12, padding: 14, alignItems: 'center', justifyContent: 'center',
  },
  placeholderText: { fontSize: 13 },
  compact: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
  },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  compactBody: { flex: 1 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, alignItems: 'center', gap: 4 },
  label: { fontSize: 12, fontWeight: '600' },
  name: { fontSize: 16, fontWeight: 'bold' },
  meta: { fontSize: 13 },
});
