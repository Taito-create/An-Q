import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import ErrorBoundary from './ErrorBoundary';
import { View, Text, ActivityIndicator } from 'react-native';
import { useTheme } from '../theme';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const { colors } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 12, color: colors.textSecondary }}>読み込み中...</Text>
      </View>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <ErrorBoundary>{children}</ErrorBoundary>
  );
}