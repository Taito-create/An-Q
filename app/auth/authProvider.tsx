import React, { createContext, useContext, useEffect, useState } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  orderBy,
  limit
} from 'firebase/firestore';
import { firebaseConfig, ALLOWED_DOMAINS, ADMIN_EMAIL } from '../../firebase-config';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

interface UserActivity {
  id: string;
  userId: string;
  action: string;
  details: any;
  timestamp: any;
  userEmail: string;
}

interface User {
  uid: string;
  email: string;
  isAdmin: boolean;
  createdAt: any;
  lastLogin: any;
}

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  logUserActivity: (action: string, details: any) => Promise<void>;
  getUserActivities: (userId?: string) => Promise<UserActivity[]>;
  getAllUsers: () => Promise<User[]>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Validate email domain
  const validateEmailDomain = (email: string): boolean => {
    const domain = email.split('@')[1];
    return ALLOWED_DOMAINS.includes(domain);
  };

  // Log user activity to Firestore
  const logUserActivity = async (action: string, details: any) => {
    if (!currentUser) return;
    
    try {
      const activityRef = doc(collection(db, 'userActivities'));
      await setDoc(activityRef, {
        userId: currentUser.uid,
        userEmail: currentUser.email,
        action,
        details,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  };

  // Get user activities
  const getUserActivities = async (userId?: string): Promise<UserActivity[]> => {
    try {
      const activitiesQuery = query(
        collection(db, 'userActivities'),
        where('userId', '==', userId || currentUser?.uid),
        orderBy('timestamp', 'desc'),
        limit(50)
      );
      
      const snapshot = await getDocs(activitiesQuery);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as UserActivity));
    } catch (error) {
      console.error('Error getting activities:', error);
      return [];
    }
  };

  // Get all users (admin only)
  const getAllUsers = async (): Promise<User[]> => {
    if (!currentUser?.isAdmin) {
      throw new Error('Admin access required');
    }
    
    try {
      const usersQuery = query(collection(db, 'users'));
      const snapshot = await getDocs(usersQuery);
      return snapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data()
      } as User));
    } catch (error) {
      console.error('Error getting users:', error);
      return [];
    }
  };

  // Register new user
  const register = async (email: string, password: string) => {
    if (!validateEmailDomain(email)) {
      throw new Error('有明高専のアカウント（@ga.ariake-nct.ac.jp）のみ登録できます');
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Create user document in Firestore
      const userDoc: User = {
        uid: user.uid,
        email: user.email!,
        isAdmin: user.email === ADMIN_EMAIL,
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp()
      };
      
      await setDoc(doc(db, 'users', user.uid), userDoc);
      
      // Log registration activity
      await logUserActivity('user_registered', { email: user.email });
      
    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') {
        throw new Error('このメールアドレスは既に登録されています');
      }
      throw error;
    }
  };

  // Login user
  const login = async (email: string, password: string) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Update last login
      await updateDoc(doc(db, 'users', user.uid), {
        lastLogin: serverTimestamp()
      });
      
      // Log login activity
      await logUserActivity('user_login', { email: user.email });
      
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        throw new Error('ユーザーが見つかりません');
      } else if (error.code === 'auth/wrong-password') {
        throw new Error('パスワードが間違っています');
      }
      throw error;
    }
  };

  // Logout user
  const logout = async () => {
    if (currentUser) {
      await logUserActivity('user_logout', { email: currentUser.email });
    }
    await signOut(auth);
  };

  // Monitor auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          setCurrentUser({
            uid: firebaseUser.uid,
            ...userDoc.data()
          } as User);
        }
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value: AuthContextType = {
    currentUser,
    loading,
    login,
    register,
    logout,
    logUserActivity,
    getUserActivities,
    getAllUsers
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
