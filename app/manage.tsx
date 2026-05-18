import { StyleSheet, ScrollView, Text, View, TextInput, TouchableOpacity, Alert, Button, Platform } from 'react-native';
import { useNavigate } from 'react-router-dom';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect } from 'react';
import { SoundManager } from './sound';
import { useTheme } from './theme';

// Shadow style removed to fix TypeScript warnings

interface CustomTimer {
  id: string;
  name: string;
  minutes: number;
}

export default function ManageScreen() {
  const { colors, onPrimary } = useTheme();
  const [selectedTime, setSelectedTime] = useState('10');
  const [customTimers, setCustomTimers] = useState<CustomTimer[]>([]);
  const [newTimerName, setNewTimerName] = useState('');
  const [newTimerMinutes, setNewTimerMinutes] = useState('');
  const [locale, setLocale] = useState<'ja' | 'en'>('ja');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadTimerSetting();
    loadCustomTimers();
    loadLanguageSetting();
  }, []);

  const loadLanguageSetting = async () => {
    try {
      const lang = await AsyncStorage.getItem('user_language');
      if (lang && (lang === 'ja' || lang === 'en')) {
        setLocale(lang as 'ja' | 'en');
      }
    } catch (e) {
      console.error('Failed to load language setting:', e);
    }
  };

  // 翻訳辞書
  const t = locale === 'ja' ? {
    title: 'タイマー設定',
    timer_settings: 'タイマー設定',
    minute: '分',
    custom: 'カスタム',
    custom_placeholder: 'タイマー名を入力',
    minutes_placeholder: '時間（分）を入力',
    save_timer: 'タイマーを保存',
    add_custom: 'カスタムタイマーを追加',
    custom_timers: '保存したタイマー',
    back: '戻る',
    success: '成功',
    timer_saved: 'タイマー設定を保存しました！',
    custom_timer_saved: 'カスタムタイマーを保存しました！',
    error: 'エラー',
    save_failed: '保存に失敗しました',
    delete_failed: '削除に失敗しました',
    delete_custom: '削除',
    delete_confirm_title: '削除の確認',
    delete_confirm_message: 'このカスタムタイマーを削除してもよろしいですか？',
    cancel: 'キャンセル',
    // プリセットテンプレート
    small_test: '小テスト用',
    exam: '試験用',
    certification: '資格用',
  } : {
    title: 'Timer Settings',
    timer_settings: 'Timer Settings',
    minute: 'min',
    custom: 'Custom',
    custom_placeholder: 'Enter timer name',
    minutes_placeholder: 'Enter minutes',
    save_timer: 'Save Timer',
    add_custom: 'Add Custom Timer',
    custom_timers: 'Saved Timers',
    back: 'Back',
    success: 'Success',
    timer_saved: 'Timer settings saved!',
    custom_timer_saved: 'Custom timer saved!',
    error: 'Error',
    save_failed: 'Save failed',
    delete_failed: 'Delete failed',
    delete_custom: 'Delete',
    delete_confirm_title: 'Delete Confirmation',
    delete_confirm_message: 'Are you sure you want to delete this custom timer?',
    cancel: 'Cancel',
    // プリセットテンプレート
    small_test: 'Small Test',
    exam: 'Exam',
    certification: 'Certification',
  };

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
      setSelectedTime(minutes);
      Alert.alert(t.success, t.timer_saved);
    } catch (error) {
      console.error('Error saving timer setting:', error);
      Alert.alert(t.error, t.save_failed);
    }
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
      Alert.alert(t.success, t.custom_timer_saved);
    } catch (error) {
      console.error('Error saving custom timer:', error);
      Alert.alert(t.error, t.save_failed);
    }
  };

  const deleteCustomTimer = async (id: string) => {
    if (Platform.OS === 'web') {
      setPendingDeleteId(id);
    } else {
      Alert.alert(
        t.delete_confirm_title || '削除の確認',
        t.delete_confirm_message || 'このカスタムタイマーを削除してもよろしいですか？',
        [
          { text: t.cancel || 'キャンセル', style: 'cancel' },
          { text: t.delete_custom || '削除', style: 'destructive', onPress: () => confirmDeleteTimer(id) },
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

  const presetTemplates = [
    { value: '10', label: `${t.small_test} (10${t.minute})` },
    { value: '60', label: `${t.exam} (60${t.minute})` },
    { value: '90', label: `${t.exam} (90${t.minute})` },
    { value: '120', label: `${t.certification} (120${t.minute})` },
  ];

  return (
    <View style={{ flex: 1 }}>
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.headerTitle, { color: colors.text }]}>{t.title}</Text>
      
      {/* プリセットテンプレート */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t.timer_settings}</Text>
        
        {presetTemplates.map((template) => (
          <TouchableOpacity
            key={template.value}
            style={[
              styles.timerOption,
              { backgroundColor: colors.card, borderColor: colors.border },
              selectedTime === template.value && { backgroundColor: colors.primary, borderColor: colors.primary }
            ]}
            onPress={() => saveTimerSetting(template.value)}
          >
            <Text style={[
              styles.timerOptionText,
              { color: selectedTime === template.value ? '#fff' : colors.text }
            ]}>
              {template.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* カスタムタイマー追加 */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t.add_custom}</Text>
        
        <TextInput
          style={[styles.customInput, { borderColor: colors.border, color: colors.text }]}
          value={newTimerName}
          onChangeText={setNewTimerName}
          placeholder={t.custom_placeholder}
        />
        
        <TextInput
          style={[styles.customInput, { borderColor: colors.border, color: colors.text }]}
          value={newTimerMinutes}
          onChangeText={setNewTimerMinutes}
          placeholder={t.minutes_placeholder}
          keyboardType="numeric"
        />
        
        <TouchableOpacity style={[styles.addButton, { backgroundColor: colors.primary }]} onPress={addCustomTimer}>
          <Text style={styles.addButtonText}>{t.add_custom}</Text>
        </TouchableOpacity>
      </View>

      {/* 保存したカスタムタイマー */}
      {customTimers.length > 0 && (
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t.custom_timers}</Text>
          
          {customTimers.map((timer) => (
            <View key={timer.id} style={[styles.customTimerItem, selectedTime === timer.minutes.toString() && styles.selectedTimer]}>
              {/* 左側：タイマー選択エリア */}
              <TouchableOpacity 
                style={styles.customTimerInfo} 
                onPress={() => saveTimerSetting(timer.minutes.toString())}
              >
                <Text style={[styles.customTimerName, selectedTime === timer.minutes.toString() && styles.selectedTimerText, { color: colors.text }]}>
                  {timer.name}{selectedTime === timer.minutes.toString() ? (locale === 'ja' ? ' (選択中)' : ' (Selected)') : ''}
                </Text>
                <Text style={[styles.customTimerMinutes, selectedTime === timer.minutes.toString() && styles.selectedTimerText, { color: colors.textSecondary }]}>
                  {timer.minutes}{t.minute}
                </Text>
              </TouchableOpacity>

              {/* 右側：削除ボタン（独立させる） */}
              <TouchableOpacity
                style={[styles.deleteButton, { backgroundColor: colors.error }]}
                onPress={(e) => {
                  e.stopPropagation();
                  deleteCustomTimer(timer.id);
                }}
              >
                <Text style={styles.deleteButtonText}>{t.delete_custom}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* ホームへ移動ボタン */}
      <TouchableOpacity 
        style={[styles.backButton, { backgroundColor: colors.primary }]}
        onPress={() => { SoundManager.play('decide'); navigate('/'); }}
      >
        <Text style={[styles.backButtonText, { color: onPrimary }]}>{t.back}</Text>
      </TouchableOpacity>
    </ScrollView>
    
    {/* Delete Confirmation UI (web) */}
    {pendingDeleteId !== null && (
      <View style={styles.confirmOverlay}>
        <Text style={styles.confirmText}>
          {locale === 'ja' ? 'このカスタムタイマーを削除しますか？' : 'Delete this custom timer?'}
        </Text>
        <View style={styles.confirmButtons}>
          <TouchableOpacity style={styles.confirmCancelButton} onPress={() => setPendingDeleteId(null)}>
            <Text style={styles.confirmCancelText}>{locale === 'ja' ? 'キャンセル' : 'Cancel'}</Text>
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
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  headerTitle: {
    textAlign: 'center',
    marginBottom: 20,
    fontSize: 24,
    fontWeight: 'bold',
  },
  section: {
    backgroundColor: '#f8f8f8',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#eee',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  timerOption: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  selectedTimer: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
    borderWidth: 3,
  },
  timerOptionText: {
    fontSize: 16,
    color: '#333',
  },
  selectedTimerText: {
    color: 'white',
    fontWeight: 'bold',
  },
  customInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    fontSize: 16,
    backgroundColor: 'white',
  },
  addButton: {
    backgroundColor: '#4CAF50',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  addButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  customTimerItem: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customTimerInfo: {
    flex: 1,
  },
  customTimerName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  customTimerMinutes: {
    fontSize: 14,
    color: '#666',
  },
  deleteButton: {
    backgroundColor: '#f44336',
    padding: 8,
    borderRadius: 5,
    alignItems: 'center',
    marginTop: 5,
  },
  deleteButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  backButton: {
    backgroundColor: '#888',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 40,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  confirmOverlay: { position: 'absolute', bottom: 80, left: 20, right: 20, backgroundColor: 'white', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#ddd', elevation: 8 },
  confirmText: { fontSize: 14, color: '#333', marginBottom: 12, textAlign: 'center' },
  confirmButtons: { flexDirection: 'row', gap: 10 },
  confirmCancelButton: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  confirmCancelText: { color: '#666', fontWeight: 'bold', fontSize: 14 },
  confirmDeleteButton: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: '#ff4444', alignItems: 'center' },
  confirmDeleteText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
});