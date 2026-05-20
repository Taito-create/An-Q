import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCOUNT_KEY = 'user_account';

export interface User {
  username: string;
  password: string;
}

// アカウント情報を保存
export async function saveAccount(username: string, password: string): Promise<void> {
  try {
    const user: User = { username, password };
    await AsyncStorage.setItem(ACCOUNT_KEY, JSON.stringify(user));
  } catch (error) {
    console.error('Failed to save account:', error);
    throw new Error('アカウント情報を保存できませんでした');
  }
}

// ログイン：入力値とストレージの情報を比較
export async function login(username: string, password: string): Promise<boolean> {
  try {
    const storedData = await AsyncStorage.getItem(ACCOUNT_KEY);
    
    if (!storedData) {
      return false;  // アカウントが存在しない
    }
    
    const user: User = JSON.parse(storedData);
    
    // ユーザー名とパスワードが一致するか確認
    return user.username === username && user.password === password;
  } catch (error) {
    console.error('Login error:', error);
    throw new Error('ログイン処理に失敗しました');
  }
}

// 登録済みアカウントの存在確認
export async function checkAccountExists(): Promise<boolean> {
  try {
    const storedData = await AsyncStorage.getItem(ACCOUNT_KEY);
    return storedData !== null;
  } catch (error) {
    console.error('Check account error:', error);
    return false;
  }
}

// ログイン状態を取得
export async function getLoggedInUser(): Promise<User | null> {
  try {
    const storedData = await AsyncStorage.getItem(ACCOUNT_KEY);
    if (!storedData) {
      return null;
    }
    return JSON.parse(storedData);
  } catch (error) {
    console.error('Get user error:', error);
    return null;
  }
}

// ログアウト
export async function logout(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ACCOUNT_KEY);
  } catch (error) {
    console.error('Logout error:', error);
    throw new Error('ログアウトに失敗しました');
  }
}
