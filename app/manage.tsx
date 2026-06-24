import { StyleSheet, ScrollView, Text, View, TextInput, TouchableOpacity, Alert, Platform } from 'react-native';
import { useNavigate } from 'react-router-dom';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect } from 'react';
import { SoundManager } from './sound';
import { useTheme } from './theme';
import { useLocale } from './hooks/useLocale';
import { translations } from './translations';

interface CustomTimer {
  id: string;
  name: string;
  minutes: number;
}

export default function ManageScreen() {
  const { colors, onPrimary, isCyberpunk } = useTheme();
  const locale = useLocale();
  const t = translations[locale];
  const navigate = useNavigate();

  const [selectedTime, setSelectedTime] = useState('10');
  const [customTimers, setCustomTimers] = useState<CustomTimer[]>([]);
  const [newTimerName, setNewTimerName] = useState('');
  const [newTimerMinutes, setNewTimerMinutes] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadTimerSetting();
    loadCustomTimers();
  }, []);

  const loadCustomTimers = async () => {
    try {
      const saved = await AsyncStorage.getItem('CUSTOM_TIMERS');
      if (saved) {
        setCustomTimers(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Error loading custom timers:', error);
    }
  };

  const loadTimerSetting = async () => {
    try {
      const timerSetting = await AsyncStorage.getItem('APP_TIMER_SETTING');
      if (timerSetting) {
        setSelectedTime(timerSetting);
      }
    } catch (error) {
      console.error('Error loading timer setting:', error);
    }
  };

  const saveTimerSetting = async (minutes: string) => {
    try {
      await AsyncStorage.setItem('APP_TIMER_SETTING', minutes);
      await AsyncStorage.setItem('active_timer_minutes', minutes);
      const timerLabel = customTimers.find(t => t.minutes === parseInt(minutes))?.name || `${minutes}${locale === 'ja' ? '分' : 'min'}`;
      await AsyncStorage.setItem('active_timer_label', timerLabel);
      setSelectedTime(minutes);
      Alert.alert(t.success, locale === 'ja' ? 'タイマー設定を保存しました！' : 'Timer settings saved!');
    } catch (error) {
      console.error('Error saving timer setting:', error);
      Alert.alert(t.error, t.failedToSave);
    }
  };

  const clearTimerSetting = async () => {
    await AsyncStorage.removeItem('APP_TIMER_SETTING');
    await AsyncStorage.removeItem('active_timer_minutes');
    await AsyncStorage.removeItem('active_timer_label');
    setSelectedTime('');
    SoundManager.play('complete');
  };

  const addCustomTimer = async () => {
    if (!newTimerName.trim() || !newTimerMinutes.trim()) {
      Alert.alert(t.error, 'Please enter both name and minutes');
      return;
    }

    const minutes = parseInt(newTimerMinutes);
    if (isNaN(minutes) || minutes <= 0) {
      Alert.alert(t.error, 'Please enter a valid number');
      return;
    }

    try {
      const newTimer: CustomTimer = {
        id: Date.now().toString(),
        name: newTimerName.trim(),
        minutes: minutes
      };

      const updatedTimers = [...customTimers, newTimer];
      setCustomTimers(updatedTimers);
      await AsyncStorage.setItem('CUSTOM_TIMERS', JSON.stringify(updatedTimers));
      
      setNewTimerName('');
      setNewTimerMinutes('');
      Alert.alert(t.success, locale === 'ja' ? 'カスタムタイマーを保存しました！' : 'Custom timer saved!');
    } catch (error) {
      console.error('Error saving custom timer:', error);
      Alert.alert(t.error, t.failedToSave);
    }
  };

  const deleteCustomTimer = async (id: string) => {
    if (Platform.OS === 'web') {
      setPendingDeleteId(id);
    } else {
      Alert.alert(
        locale === 'ja' ? '削除の確認' : 'Delete Confirmation',
        locale === 'ja' ? 'このカスタムタイマーを削除してもよろしいですか？' : 'Are you sure?',
        [
          { text: t.cancel, style: 'cancel' },
          { text: locale === 'ja' ? '削除' : 'Delete', style: 'destructive', onPress: () => confirmDeleteTimer(id) },
        ]
      );
    }
  };

  const confirmDeleteTimer = async (id: string) => {
    const updated = customTimers.filter(t => String(t.id) !== String(id));
    try {
      setCustomTimers(updated);
      setPendingDeleteId(null);
      await AsyncStorage.setItem('CUSTOM_TIMERS', JSON.stringify(updated));
      SoundManager.play('decide');
    } catch (e) {
      console.error('Delete failed:', e);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, minHeight: '100%' }}>
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={{ flexGrow: 1, paddingBottom: 20, backgroundColor: colors.background }}>
      {/* ヘッダー */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          ⏱ {locale === 'ja' ? 'タイマー設定' : 'Timer Settings'}
        </Text>
        <TouchableOpacity
          style={{ paddingVertical: 10, paddingHorizontal: 14, backgroundColor: colors.primary, borderRadius: isCyberpunk ? 0 : 10, alignItems: 'center', justifyContent: 'center', minWidth: 70 }}
          onPress={() => { SoundManager.play('decide'); navigate('/'); }}
        >
          <Text style={{ color: onPrimary, fontWeight: '700', fontSize: 14 }}>
            {locale === 'ja' ? '戻る' : 'Back'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* カスタムタイマー追加 */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {locale === 'ja' ? 'カスタムタイマーを追加' : 'Add Custom Timer'}
        </Text>
        
        <TextInput
          style={[styles.customInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
          value={newTimerName}
          onChangeText={setNewTimerName}
          placeholder={locale === 'ja' ? 'タイマー名（例：朝勉）' : 'Timer name (e.g., Morning)'}
          placeholderTextColor={colors.textSecondary}
        />
        
        <TextInput
          style={[styles.customInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
          value={newTimerMinutes}
          onChangeText={setNewTimerMinutes}
          placeholder={locale === 'ja' ? '時間（分）' : 'Minutes'}
          placeholderTextColor={colors.textSecondary}
          keyboardType="numeric"
        />
        
        <TouchableOpacity style={[styles.addButton, { backgroundColor: colors.primary }]} onPress={addCustomTimer}>
          <Text style={styles.addButtonText}>
            ＋ {locale === 'ja' ? 'タイマーを追加' : 'Add Timer'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 保存したカスタムタイマー */}
      {customTimers.length > 0 && (
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {locale === 'ja' ? '保存したタイマー' : 'Saved Timers'}
          </Text>
          
          {customTimers.map((timer) => (
            <View key={timer.id} style={[styles.customTimerItem, { borderColor: colors.border }, selectedTime === timer.minutes.toString() && { backgroundColor: colors.primary + '20' }]}>
              <TouchableOpacity 
                style={styles.customTimerInfo} 
                onPress={() => saveTimerSetting(timer.minutes.toString())}
              >
                <Text style={[styles.customTimerName, { color: colors.text }]}>
                  {timer.name}
                  {selectedTime === timer.minutes.toString() ? ` ${locale === 'ja' ? '✓ 選択中' : '✓ Active'}` : ''}
                </Text>
                <Text style={[styles.customTimerMinutes, { color: colors.textSecondary }]}>
                  {timer.minutes}{locale === 'ja' ? '分' : ' min'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.deleteButton, { backgroundColor: colors.error }]}
                onPress={() => deleteCustomTimer(timer.id)}
              >
                <Text style={styles.deleteButtonText}>🗑️</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* なし（タイマー解除） */}
      <TouchableOpacity
        style={[styles.clearButton, { borderColor: colors.error }]}
        onPress={clearTimerSetting}
      >
        <Text style={[{ color: colors.error, fontWeight: '700', textAlign: 'center' }]}>
          {locale === 'ja' ? '🔄 タイマーを解除（なし）' : '🔄 Clear Timer (No Limit)'}
        </Text>
      </TouchableOpacity>

    </ScrollView>
    
    {pendingDeleteId !== null && (
      <View style={styles.confirmOverlay}>
        <Text style={styles.confirmText}>
          {locale === 'ja' ? 'このカスタムタイマーを削除しますか？' : 'Delete this custom timer?'}
        </Text>
        <View style={styles.confirmButtons}>
          <TouchableOpacity style={styles.confirmCancelButton} onPress={() => setPendingDeleteId(null)}>
            <Text style={styles.confirmCancelText}>{t.cancel}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.confirmDeleteButton} onPress={() => confirmDeleteTimer(pendingDeleteId)}>
            <Text style={styles.confirmDeleteText}>{locale === 'ja' ? '削除' : 'Delete'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, marginBottom: 16 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  section: { margin: 16, marginBottom: 16, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e0e0e0' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  customInput: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 10, fontSize: 16 },
  addButton: { padding: 12, borderRadius: 8, alignItems: 'center' },
  addButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  customTimerItem: { padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  customTimerInfo: { flex: 1 },
  customTimerName: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  customTimerMinutes: { fontSize: 14 },
  deleteButton: { padding: 8, borderRadius: 6, alignItems: 'center', marginLeft: 8 },
  deleteButtonText: { fontSize: 16 },
  clearButton: { margin: 16, padding: 12, borderRadius: 8, borderWidth: 2 },
  confirmOverlay: { position: 'absolute', bottom: 80, left: 20, right: 20, backgroundColor: 'white', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#ddd', elevation: 8 },
  confirmText: { fontSize: 14, color: '#333', marginBottom: 12, textAlign: 'center' },
  confirmButtons: { flexDirection: 'row', gap: 10 },
  confirmCancelButton: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  confirmCancelText: { color: '#666', fontWeight: 'bold', fontSize: 14 },
  confirmDeleteButton: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: '#ff4444', alignItems: 'center' },
  confirmDeleteText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
});