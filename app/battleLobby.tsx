import React, { useState } from 'react';
import { View, Text, TextInput, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { useNavigate } from 'react-router-dom';
import { useTheme } from './theme';
import { useRooms } from './context/RoomsContext';
import PressableButton from './components/PressableButton';
import BackButton from './components/BackButton';
import { SoundManager } from './sound';

// ─────────────────────────────────────────────
// 対戦ロビー: ルーム作成 / ルーム参加
// ルート: /battle (ProtectedRoute 配下)
// ─────────────────────────────────────────────
export default function BattleLobbyScreen() {
  const navigate = useNavigate();
  const { colors, onPrimary } = useTheme();
  const { createRoom, joinRoom } = useRooms();

  const [roomIdInput, setRoomIdInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      SoundManager.play('decide');
      const roomId = await createRoom();
      navigate(`/battle/${roomId}`);
    } catch (e: any) {
      const msg = e?.message ?? 'ルームの作成に失敗しました';
      setError(msg);
      Alert.alert('エラー', msg);
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async () => {
    const roomId = roomIdInput.trim();
    if (!roomId) {
      setError('ルームIDを入力してください');
      return;
    }
    if (joining) return;
    setJoining(true);
    setError(null);
    try {
      SoundManager.play('decide');
      await joinRoom(roomId);
      navigate(`/battle/${roomId}`);
    } catch (e: any) {
      const msg = e?.message ?? '参加に失敗しました';
      setError(msg);
      Alert.alert('参加できませんでした', msg);
    } finally {
      setJoining(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <BackButton to="/multi" />
        <Text style={[styles.headerTitle, { color: colors.text }]}>対戦の部屋</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.content}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>ルームを作成</Text>
          <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
            新しい対戦ルームを作成し、相手に参加してもらいます
          </Text>
          <PressableButton
            onPress={handleCreate}
            disabled={creating}
            style={[styles.primaryBtn, { backgroundColor: creating ? colors.border : colors.primary }]}
          >
            {creating ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <Text style={[styles.primaryBtnText, { color: onPrimary }]}>ルームを作成</Text>
            )}
          </PressableButton>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>ルームに参加</Text>
          <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
            相手から共有されたルームIDを入力してください
          </Text>
          <TextInput
            value={roomIdInput}
            onChangeText={setRoomIdInput}
            placeholder="ルームID"
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, {
              borderColor: colors.border,
              color: colors.text,
              backgroundColor: colors.background,
            }]}
          />
          <PressableButton
            onPress={handleJoin}
            disabled={joining}
            style={[styles.primaryBtn, { backgroundColor: joining ? colors.border : colors.primary }]}
          >
            {joining ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <Text style={[styles.primaryBtnText, { color: onPrimary }]}>参加する</Text>
            )}
          </PressableButton>
        </View>

        {error ? (
          <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 12, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  content: { padding: 16, gap: 16, paddingBottom: 100 },
  card: { borderWidth: 1, borderRadius: 16, padding: 20, gap: 10 },
  cardTitle: { fontSize: 17, fontWeight: 'bold' },
  cardDesc: { fontSize: 13, lineHeight: 19 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  primaryBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  primaryBtnText: { fontSize: 16, fontWeight: 'bold' },
  error: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
