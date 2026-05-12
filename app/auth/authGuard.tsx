import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import { useAuth } from './authProvider';
import LoginScreen from './loginScreen';

interface AuthGuardProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export default function AuthGuard({ children, requireAdmin = false }: AuthGuardProps) {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>読み込み中...</Text>
      </View>
    );
  }

  if (!currentUser) {
    return <LoginScreen />;
  }

  if (requireAdmin && !currentUser.isAdmin) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>管理者権限が必要です</Text>
      </View>
    );
  }

  return <>{children}</>;
}
