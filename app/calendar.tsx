import { StyleSheet, Text, View, TouchableOpacity, ScrollView, TextInput, Alert, Dimensions } from 'react-native';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from './theme';
import { SoundManager } from './sound';
import { useLocale } from './hooks/useLocale';
import { translations } from './translations';

const { width } = Dimensions.get('window');

// レスポンシブ判定用フック
const useResponsive = () => {
  const [screenType, setScreenType] = useState<'mobile' | 'tablet' | 'desktop'>('mobile');

  useEffect(() => {
    const checkScreen = () => {
      const w = window.innerWidth;
      if (w < 640) setScreenType('mobile');
      else if (w < 1024) setScreenType('tablet');
      else setScreenType('desktop');
    };
    
    checkScreen();
    window.addEventListener('resize', checkScreen);
    return () => window.removeEventListener('resize', checkScreen);
  }, []);

  return screenType;
};

interface SubjectExam {
  subject: string;
  date: string;
}

interface ScheduledEvent {
  id: string;
  date: string;
  name: string;
  endDate?: string;
  subjects?: SubjectExam[];
}

export default function CalendarScreen() {
  const navigate = useNavigate();
  const { colors, onPrimary } = useTheme();
  const locale = useLocale();
  const t = translations[locale];
  const screenType = useResponsive();
  
  const isMobile = screenType !== 'desktop';
  const cellSize = isMobile ? Math.min(width / 7 - 8, 44) : Math.min(width / 7 - 4, 70);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState('');
  const [events, setEvents] = useState<ScheduledEvent[]>([]);
  const [eventName, setEventName] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isRange, setIsRange] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [subjectInputs, setSubjectInputs] = useState<SubjectExam[]>([]);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    try {
      const saved = await AsyncStorage.getItem('calendar_events');
      if (saved) {
        const parsed = JSON.parse(saved);
        setEvents(parsed);
      }
    } catch (e) {
      console.error('Load failed:', e);
    }
  };

  const saveEvents = async (newEvents: ScheduledEvent[]) => {
    try {
      await AsyncStorage.setItem('calendar_events', JSON.stringify(newEvents));
      setEvents(newEvents);
      return true;
    } catch (e) {
      console.error('Save failed:', e);
      Alert.alert('エラー', '保存に失敗しました');
      return false;
    }
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const weekDays = ['日', '月', '火', '水', '木', '金', '土'];

  const days: Array<number | null> = [];
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const goPrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
    setShowForm(false);
  };

  const goNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
    setShowForm(false);
  };

  const onDayPress = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDate(dateStr);
    setShowForm(true);
    
    const existing = events.find((e) => e.date === dateStr);
    if (existing) {
      setEditingEventId(existing.id);
      setEventName(existing.name);
      setEndDate(existing.endDate || '');
      setIsRange(!!existing.endDate);
      setSubjectInputs(existing.subjects || []);
    } else {
      setEditingEventId(null);
      setEventName('');
      setEndDate('');
      setIsRange(false);
      setSubjectInputs([]);
    }
  };

  const addSubjectInput = () => {
    if (!endDate && !selectedDate) {
      Alert.alert('エラー', '日付を設定してください');
      return;
    }
    setSubjectInputs([...subjectInputs, { subject: '', date: selectedDate }]);
  };

  const updateSubject = (index: number, field: 'subject' | 'date', value: string) => {
    const newInputs = [...subjectInputs];
    newInputs[index][field] = value;
    setSubjectInputs(newInputs);
  };

  const removeSubject = (index: number) => {
    const newInputs = subjectInputs.filter((_, i) => i !== index);
    setSubjectInputs(newInputs);
  };

  const saveEvent = async () => {
    if (!selectedDate || !eventName.trim()) {
      Alert.alert('エラー', '予定名を入力してください');
      return;
    }

    if (isRange && endDate && endDate <= selectedDate) {
      Alert.alert('エラー', '終了日は開始日より後にしてください');
      return;
    }

    const isExam = eventName.includes('試験');
    if (isExam && subjectInputs.length === 0) {
      Alert.alert('エラー', '教科を追加してください');
      return;
    }

    let newEvents = events;
    if (editingEventId) {
      newEvents = newEvents.filter((e: ScheduledEvent) => e.id !== editingEventId);
    } else {
      newEvents = newEvents.filter((e: ScheduledEvent) => e.date !== selectedDate);
    }
    
    const newEvent: ScheduledEvent = {
      id: editingEventId || Date.now().toString(),
      date: selectedDate,
      name: eventName.trim(),
      endDate: isRange && endDate ? endDate : undefined,
      subjects: isExam ? subjectInputs : undefined,
    };

    newEvents.push(newEvent);
    newEvents.sort((a, b) => a.date.localeCompare(b.date));

    const success = await saveEvents(newEvents);
    if (success) {
      SoundManager.play('complete');
      resetForm();
      Alert.alert('成功', '予定を保存しました');
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setSelectedDate('');
    setEventName('');
    setEndDate('');
    setIsRange(false);
    setSubjectInputs([]);
    setEditingEventId(null);
  };

  const deleteEvent = async (eventId: string, eventDate: string) => {
    Alert.alert(
      '確認', 
      'この予定を削除しますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              const saved = await AsyncStorage.getItem('calendar_events');
              const currentEvents = saved ? JSON.parse(saved) : [];
              const newEvents = currentEvents.filter((e: ScheduledEvent) => String(e.id) !== String(eventId));
              
              if (newEvents.length === currentEvents.length) {
                Alert.alert('エラー', '削除対象が見つかりませんでした');
                return;
              }
              
              await AsyncStorage.setItem('calendar_events', JSON.stringify(newEvents));
              setEvents(newEvents);
              SoundManager.play('decide');
              
              if (selectedDate === eventDate) {
                resetForm();
              }
              
              Alert.alert('完了', '予定を削除しました');
            } catch (error) {
              console.error('削除エラー:', error);
              Alert.alert('エラー', '削除に失敗しました');
            }
          },
        },
      ]
    );
  };

  const getDayStyle = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    const isPast = new Date(dateStr) < new Date(todayStr);
    const isSelected = dateStr === selectedDate;
    const hasEvent = events.some((e) => e.date === dateStr);
    const isInEventRange = events.some((e) => e.endDate && e.date <= dateStr && e.endDate >= dateStr);

    let bgColor = 'transparent';
    let textColor = colors.text;

    if (isPast && !isToday) {
      bgColor = '#cccccc';
      textColor = '#888888';
    }
    if (isToday) {
      bgColor = colors.primary + '30';
      textColor = colors.primary;
    }
    if (isSelected) {
      bgColor = colors.primary;
      textColor = '#fff';
    }
    if ((hasEvent || isInEventRange) && !isSelected && !isToday) {
      bgColor = colors.success + '20';
    }

    return { bgColor, textColor, hasEvent: hasEvent || isInEventRange };
  };

  const getExamsOnDate = (date: string) => {
    const exams: string[] = [];
    events.forEach(event => {
      if (event.name.includes('試験') && event.subjects) {
        event.subjects.forEach(sub => {
          if (sub.date === date) {
            exams.push(sub.subject);
          }
        });
      }
    });
    return exams;
  };

  // カレンダー本体のレンダリング
  const renderCalendar = () => (
    <>
      <View style={[styles.monthHeader, isMobile && { paddingHorizontal: 16 }]}>
        <TouchableOpacity onPress={goPrevMonth}>
          <Text style={[styles.monthArrow, { color: colors.primary }]}>＜</Text>
        </TouchableOpacity>
        <Text style={[styles.monthText, { color: colors.text, fontSize: isMobile ? 18 : 22 }]}>
          {year}年 {month + 1}月
        </Text>
        <TouchableOpacity onPress={goNextMonth}>
          <Text style={[styles.monthArrow, { color: colors.primary }]}>＞</Text>
        </TouchableOpacity>
      </View>

      {/* 曜日表示 */}
      <View style={styles.weekDaysRow}>
        {weekDays.map(day => (
          <Text key={day} style={[styles.weekDayText, { color: colors.textSecondary, fontSize: isMobile ? 12 : 15 }]}>
            {day}
          </Text>
        ))}
      </View>

      {/* 日付表示 */}
      <View style={styles.daysGrid}>
        {days.map((day, index) => {
          const dateStr = day ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
          const examsOnDate = dateStr ? getExamsOnDate(dateStr) : [];
          const dayStyle = day ? getDayStyle(day) : null;
          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.dayCell,
                { width: cellSize, height: cellSize, borderRadius: isMobile ? cellSize / 2 : 10 },
                day && dayStyle ? { backgroundColor: dayStyle.bgColor } : null,
              ]}
              onPress={() => day && onDayPress(day)}
              disabled={!day}
            >
              {day && (
                <>
                  <Text style={[styles.dayText, { fontSize: isMobile ? 14 : 18, fontWeight: isMobile ? '500' : '600' }, dayStyle && { color: dayStyle.textColor }]}>
                    {day}
                  </Text>
                  {examsOnDate.length > 0 && (
                    <View style={[styles.eventDot, { backgroundColor: colors.error, width: isMobile ? 4 : 8, height: isMobile ? 4 : 8 }]} />
                  )}
                  {dayStyle?.hasEvent && examsOnDate.length === 0 && (
                    <View style={[styles.eventDot, { backgroundColor: colors.success, width: isMobile ? 4 : 8, height: isMobile ? 4 : 8 }]} />
                  )}
                </>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );

  // 予定登録フォーム
  const renderForm = () => {
    if (!showForm || !selectedDate) return null;
    return (
      <View style={[styles.formContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.formTitle, { color: colors.text }]}>
          {editingEventId ? '予定を編集' : '予定を登録'}
        </Text>
        <Text style={[styles.selectedDateText, { color: colors.textSecondary }]}>
          開始日: {selectedDate}
        </Text>

        <TouchableOpacity
          style={[styles.toggleButton, { borderColor: colors.primary }]}
          onPress={() => setIsRange(!isRange)}
        >
          <Text style={[styles.toggleButtonText, { color: colors.primary }]}>
            {isRange ? '✓ 期間指定' : '○ 期間指定'}
          </Text>
        </TouchableOpacity>

        {isRange && (
          <TextInput
            style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text }]}
            value={endDate}
            onChangeText={setEndDate}
            placeholder="終了日 (YYYY-MM-DD)"
            placeholderTextColor={colors.textSecondary}
          />
        )}

        <TextInput
          style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text }]}
          value={eventName}
          onChangeText={setEventName}
          placeholder="予定名 (例: 中間試験)"
          placeholderTextColor={colors.textSecondary}
        />

        {eventName.includes('試験') && (
          <View style={styles.subjectsContainer}>
            <Text style={[styles.subjectsTitle, { color: colors.text }]}>教科ごとの試験日</Text>
            {subjectInputs.map((input, idx) => (
              <View key={idx} style={styles.subjectRow}>
                <TextInput
                  style={[styles.subjectInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text, flex: 1 }]}
                  value={input.subject}
                  onChangeText={(text) => updateSubject(idx, 'subject', text)}
                  placeholder="教科名"
                  placeholderTextColor={colors.textSecondary}
                />
                <TextInput
                  style={[styles.subjectDateInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text, width: 110 }]}
                  value={input.date}
                  onChangeText={(text) => updateSubject(idx, 'date', text)}
                  placeholder="日付"
                  placeholderTextColor={colors.textSecondary}
                />
                <TouchableOpacity onPress={() => removeSubject(idx)} style={styles.removeSubjectBtn}>
                  <Text style={[styles.removeSubjectText, { color: colors.error }]}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={[styles.addSubjectBtn, { borderColor: colors.primary }]} onPress={addSubjectInput}>
              <Text style={[styles.addSubjectText, { color: colors.primary }]}>+ 教科を追加</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.formButtons}>
          <TouchableOpacity style={[styles.saveButton, { backgroundColor: colors.primary }]} onPress={saveEvent}>
            <Text style={[styles.saveButtonText, { color: onPrimary }]}>保存</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.cancelButton, { borderColor: colors.border }]} onPress={resetForm}>
            <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>キャンセル</Text>
          </TouchableOpacity>
        </View>

        {events.some(e => (editingEventId ? e.id === editingEventId : e.date === selectedDate)) && (
          <TouchableOpacity 
            style={[styles.deleteEventButton, { backgroundColor: colors.error }]} 
            onPress={() => {
              const targetEvent = events.find(e => editingEventId ? e.id === editingEventId : e.date === selectedDate);
              if (targetEvent) {
                deleteEvent(targetEvent.id, targetEvent.date);
              }
            }}
          >
            <Text style={styles.deleteEventButtonText}>この予定を削除</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // 予定一覧
  const renderEventList = () => {
    if (events.length === 0) return null;
    return (
      <View style={styles.eventListContainer}>
        <Text style={[styles.eventListTitle, { color: colors.text, fontSize: isMobile ? 16 : 18 }]}>予定一覧</Text>
        {events.map(event => (
          <View
            key={event.id}
            style={[styles.eventItem, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <TouchableOpacity
              style={styles.eventContent}
              onPress={() => {
                setSelectedDate(event.date);
                setEditingEventId(event.id);
                setEventName(event.name);
                setEndDate(event.endDate || '');
                setIsRange(!!event.endDate);
                setSubjectInputs(event.subjects || []);
                setShowForm(true);
              }}
            >
              <Text style={[styles.eventName, { color: colors.text, fontWeight: 'bold', marginBottom: 4, fontSize: isMobile ? 14 : 15 }]}>
                {event.name}
              </Text>
              
              {event.subjects && event.subjects.length > 0 ? (
                <View style={{ marginTop: 4, gap: 3 }}>
                  {event.subjects.map((s, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[{ fontSize: 11, color: colors.textSecondary, minWidth: 85 }]}>
                        {s.date}
                      </Text>
                      <Text style={[{ fontSize: 13, color: colors.text }]}>
                        {s.subject}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={[styles.eventDate, { color: colors.textSecondary }]}>
                  {event.date}{event.endDate ? ` 〜 ${event.endDate}` : ''}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.deleteIcon, { backgroundColor: colors.error }]}
              onPress={() => deleteEvent(event.id, event.date)}
            >
              <Text style={styles.deleteIconText}>🗑️</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    );
  };

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollContent}
    >
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>カレンダー</Text>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: colors.primary }]}
          onPress={() => {
            SoundManager.play('decide');
            navigate('/');
          }}
        >
          <Text style={[styles.backButtonText, { color: onPrimary }]}>戻る</Text>
        </TouchableOpacity>
      </View>

      {/* PC時：2カラムレイアウト */}
      {screenType === 'desktop' ? (
        <View style={{ flexDirection: 'row', gap: 24, padding: 16 }}>
          {/* 左：カレンダー */}
          <View style={{ flex: 1, minWidth: 0 }}>
            {renderCalendar()}
            {renderForm()}
          </View>

          {/* 右：予定一覧 */}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.sectionTitle, { color: colors.text, fontSize: 18, marginBottom: 12 }]}>予定一覧</Text>
            <ScrollView>
              {events.length > 0 ? (
                events.map(event => (
                  <View
                    key={event.id}
                    style={[styles.eventItem, { backgroundColor: colors.card, borderColor: colors.border, padding: 16 }]}
                  >
                    <TouchableOpacity
                      style={styles.eventContent}
                      onPress={() => {
                        setSelectedDate(event.date);
                        setEditingEventId(event.id);
                        setEventName(event.name);
                        setEndDate(event.endDate || '');
                        setIsRange(!!event.endDate);
                        setSubjectInputs(event.subjects || []);
                        setShowForm(true);
                      }}
                    >
                      <Text style={[styles.eventName, { color: colors.text, fontWeight: 'bold', fontSize: 15 }]}>
                        {event.name}
                      </Text>
                      {event.subjects && event.subjects.length > 0 ? (
                        <View style={{ marginTop: 8, gap: 8 }}>
                          {event.subjects.map((s, i) => (
                            <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
                              <Text style={{ fontSize: 13, color: colors.textSecondary, minWidth: 100 }}>{s.date}</Text>
                              <Text style={{ fontSize: 13, color: colors.text }}>{s.subject}</Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 4 }}>
                          {event.date}{event.endDate ? ` 〜 ${event.endDate}` : ''}
                        </Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.deleteIcon, { backgroundColor: colors.error }]}
                      onPress={() => deleteEvent(event.id, event.date)}
                    >
                      <Text style={styles.deleteIconText}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                ))
              ) : (
                <Text style={[styles.noEventsText, { color: colors.textSecondary }]}>登録された予定はありません</Text>
              )}
            </ScrollView>
          </View>
        </View>
      ) : (
        /* モバイル：既存のレイアウト */
        <View style={styles.calendarContainer}>
          {renderCalendar()}
          {renderForm()}
          {renderEventList()}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 20 },
  header: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee' },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  backButton: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  backButtonText: { fontWeight: 'bold' },
  calendarContainer: { padding: 16, alignItems: 'center' },
  monthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, width: '100%' },
  monthArrow: { fontSize: 24, fontWeight: 'bold', paddingHorizontal: 16 },
  monthText: { fontSize: 18, fontWeight: 'bold' },
  weekDaysRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8, width: '100%' },
  weekDayText: { width: '14.28%', textAlign: 'center', fontWeight: 'bold' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  dayCell: { justifyContent: 'center', alignItems: 'center', margin: 2, position: 'relative' },
  dayText: { fontWeight: '500' },
  eventDot: { position: 'absolute', bottom: 2, borderRadius: 4 },
  formContainer: { margin: 16, padding: 16, borderRadius: 12, borderWidth: 1 },
  formTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  selectedDateText: { fontSize: 14, marginBottom: 12 },
  toggleButton: { padding: 10, borderRadius: 8, marginBottom: 10, borderWidth: 1, alignItems: 'center' },
  toggleButtonText: { fontWeight: 'bold' },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 12 },
  formButtons: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  saveButton: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
  saveButtonText: { fontWeight: 'bold' },
  cancelButton: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1 },
  cancelButtonText: { fontWeight: 'bold' },
  deleteEventButton: { padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  deleteEventButtonText: { color: '#fff', fontWeight: 'bold' },
  eventListContainer: { margin: 16, marginTop: 0 },
  eventListTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  eventItem: { padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eventContent: { flex: 1, flexWrap: 'wrap' },
  eventDate: { fontSize: 12, marginBottom: 4 },
  eventName: { fontSize: 14, fontWeight: '500', flexWrap: 'wrap', flexShrink: 1 },
  deleteIcon: { padding: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  deleteIconText: { fontSize: 14, color: '#fff' },
  subjectsContainer: { marginBottom: 12 },
  subjectsTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 8 },
  subjectRow: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'center' },
  subjectInput: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14 },
  subjectDateInput: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14, width: 110 },
  removeSubjectBtn: { padding: 8 },
  removeSubjectText: { fontSize: 16, fontWeight: 'bold' },
  addSubjectBtn: { padding: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, marginTop: 4 },
  addSubjectText: { fontWeight: 'bold' },
  sectionTitle: { fontWeight: 'bold', marginBottom: 12 },
  noEventsText: { fontSize: 14, textAlign: 'center', marginTop: 20 },
});