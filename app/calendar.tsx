import { StyleSheet, Text, View, TouchableOpacity, TextInput, Alert, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect } from 'react';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { SoundManager } from './sound';
import { useTheme } from './theme';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';

LocaleConfig.locales['jp'] = {
  monthNames: ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'],
  monthNamesShort: ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'],
  dayNames: ['日曜日','月曜日','火曜日','水曜日','木曜日','金曜日','土曜日'],
  dayNamesShort: ['日','月','火','水','木','金','土'],
};
LocaleConfig.locales['en'] = {
  monthNames: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  monthNamesShort: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  dayNames: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
  dayNamesShort: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
};
LocaleConfig.defaultLocale = 'jp';

interface ExamDate {
  date: string;      // start date (or single date)
  endDate?: string;  // end date for multi-day exams
  name: string;
}

export default function CalendarScreen() {
  const { colors, onPrimary } = useTheme();
  const locale = useLocale();
  const t = translations[locale];
  const [selectedDate, setSelectedDate] = useState('');
  const [examDates, setExamDates] = useState<ExamDate[]>([]);
  const [examName, setExamName] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isRange, setIsRange] = useState(false);
  const [pendingDeleteDate, setPendingDeleteDate] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    loadExamDates();
    LocaleConfig.defaultLocale = locale === 'en' ? 'en' : 'jp';
  }, [locale]);

  const loadExamDates = async () => {
    try {
      const saved = await AsyncStorage.getItem('EXAM_DATES');
      if (saved) setExamDates(JSON.parse(saved));
    } catch (e) {}
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayString = (() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  })();

  // Build a set of all exam-covered dates for quick lookup
  const examDateMap: Record<string, ExamDate> = {};
  examDates.forEach(exam => {
    if (exam.endDate && exam.endDate > exam.date) {
      const cur = new Date(exam.date);
      const end = new Date(exam.endDate);
      while (cur <= end) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        const d = String(cur.getDate()).padStart(2, '0');
        const ds = `${y}-${m}-${d}`;
        examDateMap[ds] = exam;
        cur.setDate(cur.getDate() + 1);
      }
    } else {
      examDateMap[exam.date] = exam;
    }
  });

  const onDayPress = (day: any) => {
    const dateStr = day.dateString;
    setSelectedDate(dateStr);
    SoundManager.play('select');
    const existing = examDates.find(e => e.date === dateStr || examDateMap[dateStr] === e);
    if (existing) {
      setExamName(existing.name);
      setEndDate(existing.endDate || '');
      setIsRange(!!existing.endDate);
    } else {
      setExamName('');
      setEndDate('');
      setIsRange(false);
    }
  };

  const saveExamDate = async () => {
    if (!selectedDate || !examName.trim()) return;
    if (isRange && endDate && endDate <= selectedDate) {
      Alert.alert(t.error, t.endDateAfterStart);
      return;
    }
    try {
      const updatedDates = examDates.filter(e => e.date !== selectedDate);
      updatedDates.push({
        date: selectedDate,
        endDate: isRange && endDate ? endDate : undefined,
        name: examName.trim(),
      });
      updatedDates.sort((a, b) => a.date.localeCompare(b.date));
      setExamDates(updatedDates);
      await AsyncStorage.setItem('EXAM_DATES', JSON.stringify(updatedDates));
      SoundManager.play('complete');
      setSelectedDate('');
      setExamName('');
      setEndDate('');
      setIsRange(false);
    } catch (e) {}
  };

  const handleDeleteRequest = (date: string) => {
    if (Platform.OS === 'web') {
      setPendingDeleteDate(date);
    } else {
      Alert.alert(t.deleteExam, t.confirmDeleteExam, [
        { text: t.cancel, style: 'cancel' },
        { text: t.deleteAction, style: 'destructive', onPress: () => confirmDeleteExam(date) },
      ]);
    }
  };

  const confirmDeleteExam = async (date: string) => {
    try {
      const updatedDates = examDates.filter(e => e.date !== date);
      setExamDates(updatedDates);
      setPendingDeleteDate(null);
      await AsyncStorage.setItem('EXAM_DATES', JSON.stringify(updatedDates));
      SoundManager.play('complete');
      if (selectedDate === date) { setSelectedDate(''); setExamName(''); setEndDate(''); }
    } catch (e) {}
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.headerTitle, { color: colors.text }]}>{t.calendar}</Text>

      <View style={styles.calendarContainer}>
        <Calendar
          key={`${locale}-${selectedDate}-${examDates.length}`}
          onDayPress={onDayPress}
          markedDates={{}}
          markingType={'custom'}
          onMonthChange={() => SoundManager.play('decide')}
          dayComponent={({ date, state }: any) => {
            const dateStr = date.dateString;
            const isToday = dateStr === todayString;
            const isPast = dateStr < todayString;
            const isSelected = dateStr === selectedDate;
            const exam = examDateMap[dateStr];
            const isDisabled = state === 'disabled';

            // Determine if this date is start, end, or middle of a range
            const examEntry = exam;
            const isRangeStart = examEntry && examEntry.endDate && dateStr === examEntry.date;
            const isRangeEnd = examEntry && examEntry.endDate && dateStr === examEntry.endDate;
            const isRangeMid = examEntry && examEntry.endDate && !isRangeStart && !isRangeEnd;

            let bgColor = 'transparent';
            let textColor = isDisabled ? colors.border : colors.text;
            let fontWeight: 'normal' | 'bold' = 'normal';
            let borderColor = 'transparent';
            let borderWidth = 0;
            let borderRadius = 4;

            if (isPast && !isDisabled) {
              bgColor = colors.border;
              textColor = colors.textSecondary;
            }
            if (exam) {
              bgColor = colors.primary + '30';
              textColor = colors.primary;
              fontWeight = 'bold';
              if (isRangeMid) borderRadius = 0;
              if (isRangeStart) borderRadius = 8;
              if (isRangeEnd) borderRadius = 8;
            }
            if (isToday) {
              bgColor = 'transparent';
              textColor = colors.primary;
              fontWeight = 'bold';
              borderColor = colors.primary;
              borderWidth = 2;
              borderRadius = 18;
            }
            if (isSelected) {
              bgColor = colors.primary;
              textColor = '#ffffff';
              fontWeight = 'bold';
              borderColor = colors.primary;
              borderWidth = 2;
              borderRadius = 18;
            }

            const showName = examEntry && !examEntry.endDate
              ? dateStr === examEntry.date
              : isRangeStart;

            return (
              <TouchableOpacity
                onPress={() => onDayPress(date)}
                style={{
                  width: 36,
                  minHeight: 36,
                  height: showName ? 50 : 36,
                  borderRadius,
                  backgroundColor: bgColor,
                  borderWidth,
                  borderColor,
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: 1,
                }}
              >
                <Text style={{ color: textColor, fontWeight, fontSize: 14 }}>
                  {date.day}
                </Text>
                {showName && (
                  <Text style={{ color: onPrimary, fontSize: 8, fontWeight: 'bold', textAlign: 'center', paddingHorizontal: 2 }} numberOfLines={1}>
                    {examEntry!.name}
                  </Text>
                )}
              </TouchableOpacity>
            );
          }}
          onArrowLeftPress={() => SoundManager.play('decide')}
          onArrowRightPress={() => SoundManager.play('decide')}
          theme={{
            backgroundColor: colors.card,
            calendarBackground: colors.card,
            textSectionTitleColor: colors.textSecondary,
            todayTextColor: colors.primary,
            dayTextColor: colors.text,
            textDisabledColor: colors.border,
            arrowColor: colors.primary,
            monthTextColor: colors.text,
            textMonthFontWeight: 'bold',
          }}
        />
      </View>

      {/* Exam Registration Form */}
      {selectedDate && (
        <View style={[styles.formContainer, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
          <Text style={[styles.formTitle, { color: colors.text }]}>{t.registerExam}</Text>
          <Text style={[styles.selectedDateText, { color: colors.textSecondary }]}>{t.selected}: {selectedDate}</Text>
          <TouchableOpacity
            style={[styles.toggleButton, { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}
            onPress={() => { setIsRange(!isRange); setEndDate(''); }}
          >
            <Text style={[styles.toggleButtonText, { color: colors.primary }]}>
              {isRange ? `✓ ${t.rangeToggle}` : `○ ${t.rangeToggle}`}
            </Text>
          </TouchableOpacity>
          {isRange && (
              <TextInput
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text }]}
                value={endDate}
                onChangeText={setEndDate}
                placeholder={t.endDateLabel}
                placeholderTextColor={colors.textSecondary}
              />
            )}
          <TextInput
            style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text }]}
            value={examName}
            onChangeText={setExamName}
            placeholder={t.examNamePlaceholder}
            placeholderTextColor={colors.textSecondary}
          />
          <TouchableOpacity style={[styles.saveButton, { backgroundColor: colors.primary }]} onPress={saveExamDate}>
            <Text style={[styles.saveButtonText, { color: onPrimary }]}>{t.saveExam}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Exam Dates List */}
      {examDates.length > 0 && (
        <View style={styles.examListContainer}>
          <Text style={[styles.listTitle, { color: colors.text }]}>{t.registeredExams}</Text>
          {examDates.map((exam) => (
            <View key={exam.date} style={[styles.examItem, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
              <View style={styles.examInfo}>
                <Text style={[styles.examDateText, { color: colors.textSecondary }]}>
                  {exam.date}{exam.endDate ? ` ${t.to} ${exam.endDate}` : ''}
                </Text>
                <Text style={[styles.examNameText, { color: colors.text }]}>{exam.name}</Text>
              </View>
              <TouchableOpacity
                onPress={() => handleDeleteRequest(exam.date)}
                style={styles.deleteButton}
                activeOpacity={0.7}
              >
                <Text style={styles.deleteButtonText}>{t.deleteExam}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity
        style={[styles.backButton, { backgroundColor: colors.primary }]}
        onPress={() => { SoundManager.play('decide'); router.canGoBack() ? router.back() : router.replace("/"); }}
      >
        <Text style={[styles.backButtonText, { color: onPrimary }]}>{t.back}</Text>
      </TouchableOpacity>

      {/* Delete Confirmation UI */}
      {pendingDeleteDate && (
        <View style={[styles.confirmOverlay, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.confirmBox}>
            <Text style={[styles.confirmText, { color: colors.text }]}>{t.confirmDelete}</Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity style={[styles.confirmCancelButton, { borderColor: colors.border }]} onPress={() => setPendingDeleteDate(null)}>
                <Text style={[styles.confirmCancelText, { color: colors.textSecondary }]}>{t.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmDeleteButton, { backgroundColor: colors.error }]} onPress={() => confirmDeleteExam(pendingDeleteDate)}>
                <Text style={styles.confirmDeleteText}>{t.delete}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  headerTitle: { textAlign: 'center', marginBottom: 20, fontSize: 24, fontWeight: 'bold' },
  calendarContainer: { borderRadius: 10, overflow: 'hidden', marginBottom: 20 },
  formContainer: { backgroundColor: '#f8f8f8', padding: 15, borderRadius: 8, marginBottom: 20 },
  formTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: '#333' },
  selectedDateText: { fontSize: 14, color: '#555', marginBottom: 10 },
  toggleButton: { backgroundColor: '#E8F4FF', padding: 10, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#87CEEB' },
  toggleButtonText: { color: '#007AFF', fontWeight: 'bold', fontSize: 14 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: 'white', marginBottom: 10 },
  saveButton: { backgroundColor: '#007AFF', padding: 12, borderRadius: 8, alignItems: 'center' },
  saveButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  examListContainer: { marginBottom: 20 },
  listTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: '#333' },
  examItem: { backgroundColor: '#f8f8f8', padding: 15, borderRadius: 8, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  examInfo: { flex: 1 },
  examDateText: { fontSize: 13, color: '#666', marginBottom: 4 },
  examNameText: { fontSize: 16, color: '#333', fontWeight: 'bold' },
  deleteButton: { backgroundColor: '#ff4444', padding: 8, borderRadius: 5, alignItems: 'center' },
  deleteButtonText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  backButton: { backgroundColor: '#888', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10, marginBottom: 40 },
  backButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  confirmOverlay: { position: 'absolute', bottom: 80, left: 20, right: 20, backgroundColor: 'white', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#ddd', elevation: 8 },
  confirmBox: { alignItems: 'center' },
  confirmText: { fontSize: 14, color: '#333', marginBottom: 12, textAlign: 'center' },
  confirmButtons: { flexDirection: 'row', gap: 10, width: '100%' },
  confirmCancelButton: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  confirmCancelText: { color: '#666', fontWeight: 'bold', fontSize: 14 },
  confirmDeleteButton: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: '#ff4444', alignItems: 'center' },
  confirmDeleteText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
});
