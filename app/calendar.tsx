import { StyleSheet, Text, View, TouchableOpacity, ScrollView, TextInput, Alert, Dimensions, Modal } from 'react-native';
import PressableButton from './components/PressableButton';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../src/config/firebase';
import BackButton from './components/BackButton';
import { useTheme } from './theme';
import { SoundManager } from './sound';
import { useLocale } from './hooks/useLocale';
import { translations } from './translations';
import { safeParseArray } from './utils/storageUtils';
import { useAuth } from './auth/AuthContext';
import { Trash2, X } from 'lucide-react';

const { width: windowWidth } = Dimensions.get('window');

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
  const { colors, onPrimary, isCyberpunk, br } = useTheme();
  const locale = useLocale();
  const t = translations[locale];
  const screenType = useResponsive();
  const { user } = useAuth();
  
  const isMobile = screenType !== 'desktop';

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState('');
  const [events, setEvents] = useState<ScheduledEvent[]>([]);
  const [eventName, setEventName] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isRange, setIsRange] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [subjectInputs, setSubjectInputs] = useState<SubjectExam[]>([]);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; date: string } | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  const showToastNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    if (!user?.uid) {
      // Fallback to AsyncStorage if not logged in
      const saved = await AsyncStorage.getItem('calendar_events');
      setEvents(safeParseArray<ScheduledEvent>(saved, []));
      return;
    }

    try {
      const docRef = doc(db, 'userEvents', user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        const events = data.events || [];
        setEvents(events);
        // Backup to AsyncStorage
        await AsyncStorage.setItem('calendar_events', JSON.stringify(events));
      } else {
        // No Firestore data, try AsyncStorage
        const saved = await AsyncStorage.getItem('calendar_events');
        const events = safeParseArray<ScheduledEvent>(saved, []);
        setEvents(events);
        if (events.length > 0) {
          // Migrate to Firestore
          await saveEvents(events);
        }
      }
    } catch (error) {
      console.error('Failed to load events from Firestore:', error);
      // Fallback to AsyncStorage
      const saved = await AsyncStorage.getItem('calendar_events');
      setEvents(safeParseArray<ScheduledEvent>(saved, []));
    }
  };

  const saveEvents = async (newEvents: ScheduledEvent[]) => {
    // Always save to AsyncStorage first (backup)
    await AsyncStorage.setItem('calendar_events', JSON.stringify(newEvents));
    setEvents(newEvents);

    // If logged in, save to Firestore
    if (!user?.uid) return true;

    try {
      //  Sanitize events: remove undefined values before saving to Firestore
      const sanitizedEvents = newEvents.map(event => {
        const sanitized: any = {
          id: event.id,
          date: event.date,
          name: event.name,
        };
        // Only add fields if they exist and are not undefined
        if (event.endDate !== undefined && event.endDate !== '') {
          sanitized.endDate = event.endDate;
        }
        if (event.subjects !== undefined && event.subjects.length > 0) {
          sanitized.subjects = event.subjects;
        }
        return sanitized;
      });

      const docRef = doc(db, 'userEvents', user.uid);
      await setDoc(docRef, { 
        events: sanitizedEvents, 
        updatedAt: serverTimestamp() 
      }, { merge: true });
      console.log('Events saved to Firestore:', sanitizedEvents.length);
      return true;
    } catch (error) {
      console.error('Failed to save events to Firestore:', error);
      return false;
    }
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const weekDays = locale === 'ja' 
    ? ['日', '月', '火', '水', '木', '金', '土']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // 月の最初の日が何曜日か取得（0=日, 1=月... 6=土）
  const getFirstDayOfWeek = (year: number, month: number): number => {
    return new Date(year, month, 1).getDay();
  };

  // カレンダー日付配列を生成（空セルを含む）
  const generateCalendarDays = (year: number, month: number): (number | null)[] => {
    const firstDay = getFirstDayOfWeek(year, month);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days: (number | null)[] = [];
    
    // 最初の行に空セルを追加（最初の日曜日までの空白）
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    
    // 月の日付を追加
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    
    return days;
  };

  const days = generateCalendarDays(year, month);

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
      ...(isRange && endDate ? { endDate } : {}),  // Only add if exists
      ...(isExam && subjectInputs.length > 0 ? { subjects: subjectInputs } : {}),  // Only add if exists
    };

    newEvents.push(newEvent);
    newEvents.sort((a, b) => a.date.localeCompare(b.date));

    const success = await saveEvents(newEvents);
    if (success) {
      SoundManager.play('complete');
      resetForm();
      showToastNotification(locale === 'ja' ? '予定を保存しました' : 'Event saved', 'success');
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

  const deleteEvent = (eventId: string, eventDate: string) => {
    console.log('deleteEvent called:', { eventId, eventDate });
    setDeleteTarget({ id: eventId, date: eventDate });
    setShowDeleteConfirmModal(true);
  };

  const confirmDeleteEvent = async () => {
    if (!deleteTarget) return;
    
    const { id: eventId, date: eventDate } = deleteTarget;
    console.log('confirmDeleteEvent called:', { eventId, eventDate });
    
    setShowDeleteConfirmModal(false);
    
    try {
      // 1. Get current events from Firestore first (if logged in)
      let currentEvents: ScheduledEvent[] = [];
      if (user?.uid) {
        try {
          console.log(' Reading from Firestore...');
          const docRef = doc(db, 'userEvents', user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            currentEvents = data.events || [];
            console.log(' Firestore events count:', currentEvents.length);
          }
        } catch (firestoreError) {
          console.warn('Failed to load from Firestore:', firestoreError);
        }
      }
      
      // 2. If Firestore didn't return events, try AsyncStorage
      if (currentEvents.length === 0) {
        console.log(' Falling back to AsyncStorage...');
        const saved = await AsyncStorage.getItem('calendar_events');
        currentEvents = safeParseArray<ScheduledEvent>(saved, []);
        console.log(' AsyncStorage events count:', currentEvents.length);
      }
      
      const newEvents = currentEvents.filter((e: ScheduledEvent) => String(e.id) !== String(eventId));
      
      if (newEvents.length === currentEvents.length) {
        console.warn('No event found to delete');
        showToastNotification('削除対象が見つかりませんでした', 'error');
        return;
      }
      
      // 3. Save to AsyncStorage
      await AsyncStorage.setItem('calendar_events', JSON.stringify(newEvents));
      setEvents(newEvents);
      
      // 4. Save to Firestore (if logged in)
      if (user?.uid) {
        try {
          const docRef = doc(db, 'userEvents', user.uid);
          await setDoc(docRef, { events: newEvents, updatedAt: serverTimestamp() }, { merge: true });
          console.log('Firestore synced');
        } catch (firestoreError) {
          console.warn('Failed to sync to Firestore:', firestoreError);
        }
      }
      
      SoundManager.play('decide');
      if (selectedDate === eventDate) {
        resetForm();
      }
      
      showToastNotification(locale === 'ja' ? '予定を削除しました' : 'Event deleted', 'success');
      setDeleteTarget(null);
    } catch (error) {
      console.error('Delete error:', error);
      showToastNotification(locale === 'ja' ? '削除に失敗しました' : 'Delete failed', 'error');
    }
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

  const getEventCountForDay = (date: string) => {
    let count = 0;
    events.forEach(event => {
      if (event.date === date) {
        count++;
      } else if (event.endDate && event.date <= date && event.endDate >= date) {
        count++;
      }
    });
    return count;
  };

  // カレンダー本体のレンダリング（7列グリッド - gapを使わずpaddingで調整）
  const renderCalendar = () => (
    <>
      <View style={[styles.monthHeader, isMobile && { paddingHorizontal: 16 }]}>
        <TouchableOpacity onPress={goPrevMonth}>
          <Text style={[styles.monthArrow, { color: colors.primary }]}>＜</Text>
        </TouchableOpacity>
        <Text style={[styles.monthText, { color: colors.text, fontSize: isMobile ? 18 : 22 }]}>
          {locale === 'ja'
            ? `${year}年 ${month + 1}月`
            : `${new Date(year, month).toLocaleString('en-US', { month: 'long' })} ${year}`}
        </Text>
        <TouchableOpacity onPress={goNextMonth}>
          <Text style={[styles.monthArrow, { color: colors.primary }]}>＞</Text>
        </TouchableOpacity>
      </View>

      {/* 曜日ヘッダー（7列） */}
      <View style={[styles.calendarGrid, { marginBottom: isMobile ? 12 : 24 }]}>
        {weekDays.map((day, i) => (
          <View key={`header-${i}`} style={styles.gridCell}>
            <Text style={[
              styles.weekdayHeader,
              {
                color: colors.textSecondary,
                fontSize: isMobile ? 12 : 14,
                paddingBottom: isMobile ? 6 : 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }
            ]}>
              {day}
            </Text>
          </View>
        ))}

        {/* 日付セル（7列グリッドに自動配置） */}
        {days.map((day, index) => {
          const dateStr = day ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
          const dayStyle = day ? getDayStyle(day) : null;
          const examsOnDate = dateStr ? getExamsOnDate(dateStr) : [];
          const eventCount = dateStr ? getEventCountForDay(dateStr) : 0;

          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.gridCell,
                day ? { opacity: 1 } : { opacity: 0 },
              ]}
              onPress={() => day && onDayPress(day)}
              disabled={!day}
            >
              {day && (
                <View style={[
                  styles.dayCell,
                  {
                    backgroundColor: dayStyle?.bgColor || 'transparent',
                    borderRadius: isMobile ? 6 : 8,
                  },
                ]}>
                  <Text style={[
                    styles.dayText,
                    {
                      color: dayStyle?.textColor || colors.text,
                      fontSize: isMobile ? 14 : 18,
                      fontWeight: dayStyle?.bgColor === colors.primary ? '700' : '500',
                    }
                  ]}>
                    {day}
                  </Text>
                  
                  {/* 予定アイコン（試験のドット or 件数バッジ） */}
                  {examsOnDate.length > 0 && (
                    <View style={[
                      styles.eventDot,
                      {
                        backgroundColor: colors.error,
                        width: isMobile ? 6 : 8,
                        height: isMobile ? 6 : 8,
                        borderRadius: isMobile ? 3 : 4,
                      }
                    ]} />
                  )}
                  {eventCount > 0 && examsOnDate.length === 0 && (
                    <View style={[
                      styles.eventDot,
                      {
                        backgroundColor: colors.success,
                        width: isMobile ? 6 : 8,
                        height: isMobile ? 6 : 8,
                        borderRadius: isMobile ? 3 : 4,
                      }
                    ]} />
                  )}
                </View>
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
          {editingEventId
            ? (locale === 'ja' ? '予定を編集' : 'Edit Event')
            : '+ SCHEDULE EVENT'}
        </Text>
        <Text style={[styles.selectedDateText, { color: colors.textSecondary }]}>
          {locale === 'ja' ? '開始日: ' : 'Start Date: '}{selectedDate}
        </Text>

        <TouchableOpacity
          style={[styles.toggleButton, { borderColor: colors.primary }]}
          onPress={() => setIsRange(!isRange)}
        >
          <Text style={[styles.toggleButtonText, { color: colors.primary }]}>
            {isRange
              ? (locale === 'ja' ? ' 期間指定' : ' Date Range')
              : (locale === 'ja' ? '○ 期間指定' : '○ Date Range')}
          </Text>
        </TouchableOpacity>

        {isRange && (
          <TextInput
            style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text }]}
            value={endDate}
            onChangeText={setEndDate}
            placeholder={locale === 'ja' ? '終了日 (YYYY-MM-DD)' : 'End Date (YYYY-MM-DD)'}
            placeholderTextColor={colors.textSecondary}
          />
        )}

        <TextInput
          style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text }]}
          value={eventName}
          onChangeText={setEventName}
          placeholder={locale === 'ja' ? '予定名 (例: 中間試験)' : 'Event Name (e.g., Midterm Exam)'}
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
                  placeholder={locale === 'ja' ? '教科名' : 'Subject'}
                  placeholderTextColor={colors.textSecondary}
                />
                <TextInput
                  style={[styles.subjectDateInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text, width: 110 }]}
                  value={input.date}
                  onChangeText={(text) => updateSubject(idx, 'date', text)}
                  placeholder={locale === 'ja' ? '日付' : 'Date'}
                  placeholderTextColor={colors.textSecondary}
                />
                <TouchableOpacity onPress={() => removeSubject(idx)} style={styles.removeSubjectBtn}>
                  <X size={16} color={colors.error} />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={[styles.addSubjectBtn, { borderColor: colors.primary }]} onPress={addSubjectInput}>
              <Text style={[styles.addSubjectText, { color: colors.primary }]}>+ {locale === 'ja' ? '教科を追加' : 'Add Subject'}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.formButtons}>
          <TouchableOpacity style={[styles.saveButton, { backgroundColor: colors.primary }]} onPress={saveEvent}>
            <Text style={[styles.saveButtonText, { color: onPrimary }]}>{locale === 'ja' ? '保存' : 'Save'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.cancelButton, { borderColor: colors.border }]} onPress={resetForm}>
            <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>{locale === 'ja' ? 'キャンセル' : 'Cancel'}</Text>
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
            <Text style={styles.deleteEventButtonText}>{locale === 'ja' ? 'この予定を削除' : 'Delete Event'}</Text>
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
        <Text style={[styles.eventListTitle, { color: colors.text, fontSize: isMobile ? 16 : 18 }]}>{locale === 'ja' ? '予定一覧' : 'Events'}</Text>
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
              <Trash2 size={16} color="#fff" />
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
      <View style={[styles.header, { borderBottomColor: colors.border, justifyContent: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
        <BackButton to="/sub" />
        <Text style={[styles.headerTitle, { color: colors.text, fontFamily: 'monospace', letterSpacing: 1, flex: 1, flexShrink: 1 }]} numberOfLines={1}>
          $ SCHEDULED TRANSFERS
        </Text>
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
            <Text style={[styles.sectionTitle, { color: colors.text, fontSize: 18, marginBottom: 12 }]}>{locale === 'ja' ? '予定一覧' : 'Events'}</Text>
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
                      <Trash2 size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))
              ) : (
                <Text style={[styles.noEventsText, { color: colors.textSecondary }]}>[NO_DATA_FOUND] 予定されたインストール・シーケンスはありません</Text>
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

      {/* 予定削除確認モーダル */}
      <Modal visible={showDeleteConfirmModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.confirmModalContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.confirmModalTitle, { color: colors.text }]}>
              {locale === 'ja' ? '予定を削除' : 'Delete Event'}
            </Text>
            <Text style={[styles.confirmModalMessage, { color: colors.textSecondary }]}>
              {locale === 'ja'
                ? 'この予定を削除してもよろしいですか？\nこの操作は取り消せません。'
                : 'Are you sure you want to delete this event?\nThis action cannot be undone.'}
            </Text>
            <View style={styles.confirmModalButtons}>
              <TouchableOpacity
                style={[styles.confirmModalCancel, { borderColor: colors.border }]}
                onPress={() => {
                  setShowDeleteConfirmModal(false);
                  setDeleteTarget(null);
                }}
              >
                <Text style={[styles.confirmModalCancelText, { color: colors.textSecondary }]}>
                  {locale === 'ja' ? 'キャンセル' : 'Cancel'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmModalConfirm, { backgroundColor: colors.error }]}
                onPress={confirmDeleteEvent}
              >
                <Text style={styles.confirmModalConfirmText}>
                  {locale === 'ja' ? '削除する' : 'Delete'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Toast Notification */}
      {showToast && (
        <View style={[styles.toastContainer, {
          position: 'absolute',
          bottom: 80,
          left: '50%',
          transform: [{ translateX: '-50%' }],
          zIndex: 9999,
        }]}>
          <View style={[
            styles.toast,
            {
              backgroundColor: toastType === 'success' ? colors.success : colors.error,
              borderRadius: 12,
              paddingVertical: 12,
              paddingHorizontal: 24,
              boxShadow: '0px 2px 4px rgba(0,0,0,0.25)',
              elevation: 5,
            }
          ]}>
            <Text style={[styles.toastText, { color: '#fff', fontSize: 15, fontWeight: '600' }]}>
              {toastMessage}
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  header: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee' },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  calendarContainer: { padding: 16, alignItems: 'center' },
  monthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, width: '100%' },
  monthArrow: { fontSize: 24, fontWeight: 'bold', paddingHorizontal: 16 },
  monthText: { fontSize: 18, fontWeight: 'bold' },

  // 7列グリッド（React Native は CSS Grid 非対応のため flexWrap で代用）
  // gap を使わず padding で調整して 7列が正しく収まるように
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },
  gridCell: {
    width: '14.28%', // 100% / 7 = 14.28%
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },

  // 曜日ヘッダー
  weekdayHeader: {
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
  },

  // 日付セル（gridCell の padding 内で full width になるように）
  dayCell: {
    width: '100%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dayText: {
    textAlign: 'center',
  },
  eventDot: {
    position: 'absolute',
    bottom: 2,
  },

  // フォーム
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

  // 予定一覧
  eventListContainer: { margin: 16, marginTop: 0 },
  eventListTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  eventItem: { padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eventContent: { flex: 1, flexWrap: 'wrap' },
  eventDate: { fontSize: 12, marginBottom: 4 },
  eventName: { fontSize: 14, fontWeight: '500', flexWrap: 'wrap', flexShrink: 1 },
  deleteIcon: { padding: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  deleteIconText: { fontSize: 14, color: '#fff' },

  // 教科サブフォーム
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
  closeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  confirmModalContainer: {
    width: '80%',
    maxWidth: 300,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
  },
  confirmModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  confirmModalMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  confirmModalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  confirmModalCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  confirmModalCancelText: {
    fontWeight: 'bold',
  },
  confirmModalConfirm: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmModalConfirmText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  toastContainer: {
    position: 'absolute',
    bottom: 80,
    left: '50%',
    transform: [{ translateX: '-50%' }],
    zIndex: 9999,
  },
  toast: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    boxShadow: '0px 2px 4px rgba(0,0,0,0.25)',
    elevation: 5,
  },
  toastText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
