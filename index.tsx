import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity,
  ScrollView, StatusBar
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { SoundManager } from './app/sound';

// 多言語対応
const translations = {
  ja: {
    appTitle: 'クイズアプリ',
    subtitle: '知識をテストしよう',
    startQuiz: 'クイズ開始',
    createQuestion: '問題作成',
    learningHistory: '学習履歴',
    learningDesc: '成長をチェック',
    musicSettings: '音楽設定',
    musicDesc: '音のカスタマイズ',
    questions: '問題',
    timer: 'タイマー',
  },
  en: {
    appTitle: 'Quiz App',
    subtitle: 'Test your knowledge',
    startQuiz: 'Start Quiz',
    createQuestion: 'Create Question',
    learningHistory: 'Stats',
    learningDesc: 'Check your progress',
    musicSettings: 'Music Settings',
    musicDesc: 'Customize sounds',
    questions: 'Questions',
    timer: 'Timer',
  }
};

const HomeScreen = () => {
  const router = useRouter();
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [themeColor, setThemeColor] = useState('#007AFF');
  const [language, setLanguage] = useState<'ja' | 'en'>('ja');

  useEffect(() => {
    loadSettings();
    SoundManager.initialize();
  }, []);

  const loadSettings = async () => {
    try {
      const questions = await AsyncStorage.getItem('questions');
      if (questions) {
        const parsed = JSON.parse(questions);
        setTotalQuestions(parsed.length);
      }

      const timer = await AsyncStorage.getItem('timer_minutes');
      if (timer) {
        setTimerMinutes(parseInt(timer));
      }

      const color = await AsyncStorage.getItem('theme_color');
      if (color) {
        setThemeColor(color);
      }

      const lang = await AsyncStorage.getItem('user_language');
      if (lang && (lang === 'ja' || lang === 'en')) {
        setLanguage(lang);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const toggleLanguage = async () => {
    const newLanguage = language === 'ja' ? 'en' : 'ja';
    setLanguage(newLanguage);
    try {
      await AsyncStorage.setItem('user_language', newLanguage);
      SoundManager.play('decide');
    } catch (error) {
      console.error('Failed to save language:', error);
    }
  };

  const t = (key: keyof typeof translations.ja) => {
    return translations[language][key];
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <StatusBar barStyle="light-content" />
      
      {/* Header with Language Toggle */}
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>{t('appTitle')}</Text>
          <Text style={styles.subtitle}>{t('subtitle')}</Text>
        </View>
        
        {/* Language Toggle Button */}
        <TouchableOpacity 
          style={styles.languageButton} 
          onPress={toggleLanguage}
        >
          <Text style={styles.languageText}>
            {language === 'ja' ? 'JP' : 'EN'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{totalQuestions}</Text>
          <Text style={styles.statLabel}>{t('questions')}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{timerMinutes}m</Text>
          <Text style={styles.statLabel}>{t('timer')}</Text>
        </View>
      </View>

      {/* Main Actions */}
      <View style={styles.mainActions}>
        <TouchableOpacity 
          style={styles.primaryButton} 
          onPress={() => {
            SoundManager.play('decide');
            router.push('/quiz');
          }}
        >
          <Ionicons name="play" size={24} color="#FFF" />
          <Text style={styles.primaryButtonText}>{t('startQuiz')}</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.secondaryButton} 
          onPress={() => {
            SoundManager.play('decide');
            router.push('/create');
          }}
        >
          <Ionicons name="add" size={24} color={themeColor} />
          <Text style={[styles.secondaryButtonText, { color: themeColor }]}>{t('createQuestion')}</Text>
        </TouchableOpacity>
      </View>

      {/* Navigation Grid */}
      <View style={styles.grid}>
        {/* 学習履歴 */}
        <TouchableOpacity 
          style={styles.navCard} 
          onPress={() => {
            SoundManager.play('decide');
            router.push('/browse');
          }}
        >
          <View style={[styles.iconCircle, { backgroundColor: '#EEF2FF' }]}>
            <Ionicons name="stats-chart" size={20} color="#6366F1" />
          </View>
          <Text style={styles.navTitle}>{t('learningHistory')}</Text>
          <Text style={styles.navDesc}>{t('learningDesc')}</Text>
        </TouchableOpacity>

        {/* 音楽設定（追加） */}
        <TouchableOpacity 
          style={styles.navCard} 
          onPress={() => {
            SoundManager.play('decide');
            router.push('/music');
          }}
        >
          <View style={[styles.iconCircle, { backgroundColor: '#FFF7ED' }]}>
            <Ionicons name="musical-notes" size={20} color="#F97316" />
          </View>
          <Text style={styles.navTitle}>{t('musicSettings')}</Text>
          <Text style={styles.navDesc}>{t('musicDesc')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  content: {
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
  },
  titleContainer: {
    alignItems: 'center',
    flex: 1,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  languageButton: {
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FFF',
  },
  languageText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 30,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  mainActions: {
    marginBottom: 30,
    gap: 15,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  secondaryButton: {
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#007AFF',
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  grid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 15,
  },
  navCard: {
    width: '47%',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  navTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  navDesc: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
});

export default HomeScreen;
