import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert
} from 'react-native';
import { useAuth } from './authProvider';
import { useTheme } from '../theme';

interface UserActivity {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  details: any;
  timestamp: any;
}

interface User {
  uid: string;
  email: string;
  isAdmin: boolean;
  createdAt: any;
  lastLogin: any;
}

export default function AdminDashboard() {
  const [users, setUsers] = useState<User[]>([]);
  const [activities, setActivities] = useState<UserActivity[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  const { currentUser, getAllUsers, getUserActivities } = useAuth();
  const { colors, onPrimary, fs } = useTheme();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [usersData, activitiesData] = await Promise.all([
        getAllUsers(),
        getUserActivities() // Get all activities for admin
      ]);
      setUsers(usersData);
      setActivities(activitiesData);
    } catch (error) {
      Alert.alert('エラー', 'データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return '不明';
    const date = timestamp.toDate();
    return date.toLocaleString('ja-JP');
  };

  const getActionText = (action: string) => {
    const actionMap: { [key: string]: string } = {
      'user_registered': 'アカウント作成',
      'user_login': 'ログイン',
      'user_logout': 'ログアウト',
      'quiz_completed': 'クイズ完了',
      'quiz_created': 'クイズ作成',
      'settings_changed': '設定変更'
    };
    return actionMap[action] || action;
  };

  const filteredActivities = selectedUserId
    ? activities.filter(activity => activity.userId === selectedUserId)
    : activities;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.loadingText, { color: colors.text }]}>読み込み中...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: fs(20) }]}>
          🛠️ 管理者ダッシュボード
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: fs(14) }]}>
          管理者: {currentUser?.email}
        </Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Users Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fs(18) }]}>
            👥 ユーザー一覧 ({users.length}人)
          </Text>
          
          {users.map((user) => (
            <TouchableOpacity
              key={user.uid}
              style={[
                styles.userCard,
                { 
                  backgroundColor: colors.card,
                  borderColor: selectedUserId === user.uid ? colors.primary : colors.border
                }
              ]}
              onPress={() => setSelectedUserId(selectedUserId === user.uid ? null : user.uid)}
            >
              <View style={styles.userInfo}>
                <Text style={[styles.userEmail, { color: colors.text, fontSize: fs(16) }]}>
                  {user.email}
                </Text>
                <Text style={[styles.userMeta, { color: colors.textSecondary, fontSize: fs(12) }]}>
                  {user.isAdmin ? '👑 管理者' : '👤 一般ユーザー'}
                </Text>
                <Text style={[styles.userMeta, { color: colors.textSecondary, fontSize: fs(12) }]}>
                  登録日: {formatTimestamp(user.createdAt)}
                </Text>
                <Text style={[styles.userMeta, { color: colors.textSecondary, fontSize: fs(12) }]}>
                  最終ログイン: {formatTimestamp(user.lastLogin)}
                </Text>
              </View>
              <Text style={[styles.arrow, { color: colors.textSecondary }]}>
                {selectedUserId === user.uid ? '▼' : '▶'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Activities Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fs(18) }]}>
            📊 活動ログ
            {selectedUserId && ` (フィルター: ${users.find(u => u.uid === selectedUserId)?.email})`}
          </Text>
          
          {filteredActivities.length === 0 ? (
            <Text style={[styles.noData, { color: colors.textSecondary, fontSize: fs(14) }]}>
              活動ログがありません
            </Text>
          ) : (
            filteredActivities.map((activity) => (
              <View key={activity.id} style={[styles.activityCard, { backgroundColor: colors.card }]}>
                <View style={styles.activityHeader}>
                  <Text style={[styles.activityUser, { color: colors.text, fontSize: fs(14) }]}>
                    {activity.userEmail}
                  </Text>
                  <Text style={[styles.activityTime, { color: colors.textSecondary, fontSize: fs(12) }]}>
                    {formatTimestamp(activity.timestamp)}
                  </Text>
                </View>
                <Text style={[styles.activityAction, { color: colors.primary, fontSize: fs(14) }]}>
                  {getActionText(activity.action)}
                </Text>
                {activity.details && Object.keys(activity.details).length > 0 && (
                  <Text style={[styles.activityDetails, { color: colors.textSecondary, fontSize: fs(12) }]}>
                    詳細: {JSON.stringify(activity.details)}
                  </Text>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    marginBottom: 4,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontWeight: 'bold',
    marginBottom: 15,
  },
  userCard: {
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userInfo: {
    flex: 1,
  },
  userEmail: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  userMeta: {
    marginBottom: 2,
  },
  arrow: {
    fontSize: 16,
  },
  activityCard: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  activityUser: {
    fontWeight: 'bold',
  },
  activityTime: {
  },
  activityAction: {
    fontWeight: '600',
    marginBottom: 2,
  },
  activityDetails: {
    fontStyle: 'italic',
  },
  noData: {
    textAlign: 'center',
    padding: 20,
    fontStyle: 'italic',
  },
  loadingText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
  },
});
