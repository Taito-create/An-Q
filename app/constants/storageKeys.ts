import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * AsyncStorage キー管理
 * すべてのストレージキーをここで一元管理
 */

export const STORAGE_KEYS = {
  // ユーザー設定
  USER_LANGUAGE: 'user_language',
  SELECTED_THEME: 'selected_theme',
  
  // クイズ設定
  APP_TIMER_SETTING: 'APP_TIMER_SETTING',
  QUIZ_QUESTIONS: 'quiz_questions',
  QUESTION_FOLDERS: 'question_folders',
  INBOX_ITEMS: 'inbox_items',
  TIMER: 'APP_TIMER_SETTING',
  STATS: 'quiz_stats',
  LANGUAGE: 'user_language',
  
  // 音楽設定
  BGM_PRESET: 'bgm_preset',
  SE_TYPE: 'se_type',
  BGM_ENABLED: 'bgm_enabled',
  MUSIC_UNLOCKED: 'music_unlocked',
  BGM_SETTINGS: 'bgm_settings',
  
  // ホーム画面設定
  HOME_LAYOUT_MODE: 'home_layout_mode',
  HOME_CARD_ORDER: 'home_card_order',
  HOME_NAV_MODE: 'home_nav_mode',
  
  // 統計情報
  USER_STATS: 'user_stats',
  TOTAL_QUESTIONS_ANSWERED: 'total_questions_answered',
  CORRECT_ANSWERS: 'correct_answers',
  
  // ミッション・ショップ
  MISSION_PROGRESS: 'mission_progress',
  SHOP_ITEMS: 'shop_items',
  UNLOCKED_FEATURES: 'unlocked_features',
  
  // カレンダー
  EXAM_DATES: 'EXAM_DATES',
  
  // 称号
  USER_TITLES: 'user_titles',
  CURRENT_TITLE: 'current_title',

  // クイズ結果・履歴
  QUIZ_RESULTS: 'quiz_results',
  QUIZ_HISTORY: 'quiz_history',

  // ユーザー進捗
  USER_XP: 'user_xp',
  USER_COINS: 'user_coins',
  USER_LEVEL: 'user_level',
  STREAK_COUNT: 'streakCount',
  LAST_STUDY_DATE: 'lastStudyDate',

  // アプリ設定
  DEV_MODE_ENABLED: 'dev_mode_enabled',
  SE_ENABLED: 'se_enabled',

  // スクリーンタイム
  WEEKLY_SCREEN_TIME: 'weekly_screen_time_minutes',
  CUSTOM_TIMERS: 'CUSTOM_TIMERS',

  // マイグレーション
  DB_VERSION: 'db_version',
} as const;

/**
 * ストレージ操作のヘルパー関数
 */
export class StorageHelper {
  /**
   * 文字列をストレージに保存
   */
  static async setString(key: string, value: string): Promise<boolean> {
    try {
      await AsyncStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.error(`Failed to save ${key}:`, error);
      return false;
    }
  }

  /**
   * 文字列をストレージから取得
   */
  static async getString(key: string, defaultValue: string = ''): Promise<string> {
    try {
      const value = await AsyncStorage.getItem(key);
      return value !== null ? value : defaultValue;
    } catch (error) {
      console.error(`Failed to load ${key}:`, error);
      return defaultValue;
    }
  }

  /**
   * オブジェクトをストレージに保存
   */
  static async setObject<T>(key: string, value: T): Promise<boolean> {
    try {
      const jsonString = JSON.stringify(value);
      await AsyncStorage.setItem(key, jsonString);
      return true;
    } catch (error) {
      console.error(`Failed to save ${key}:`, error);
      return false;
    }
  }

  /**
   * オブジェクトをストレージから取得
   */
  static async getObject<T>(key: string, defaultValue: T): Promise<T> {
    try {
      const jsonString = await AsyncStorage.getItem(key);
      return jsonString !== null ? JSON.parse(jsonString) : defaultValue;
    } catch (error) {
      console.error(`Failed to load ${key}:`, error);
      return defaultValue;
    }
  }

  /**
   * ストレージからキーを削除
   */
  static async remove(key: string): Promise<boolean> {
    try {
      await AsyncStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`Failed to remove ${key}:`, error);
      return false;
    }
  }

  /**
   * すべてのストレージをクリア
   */
  static async clear(): Promise<boolean> {
    try {
      await AsyncStorage.clear();
      return true;
    } catch (error) {
      console.error('Failed to clear storage:', error);
      return false;
    }
  }
}