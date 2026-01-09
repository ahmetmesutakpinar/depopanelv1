import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/constants/routes';
import toast from 'react-hot-toast';
import api from '@/services/api';
import type { User, LoginCredentials, RegisterData } from '@/utils/types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  // Load user from localStorage on mount
  useEffect(() => {
    const loadUser = async () => {
      const token = localStorage.getItem('token');
      const savedUser = localStorage.getItem('user');

      if (token && savedUser) {
        try {
          // First set saved user for immediate UI update
          const parsedUser = JSON.parse(savedUser);
          setUser(parsedUser);
          
          // Then verify token and get fresh user data (including permissions)
          const response = await api.getProfile();
          if (response.success && response.data) {
            const freshUser = response.data;
            setUser(freshUser);
            localStorage.setItem('user', JSON.stringify(freshUser));
          } else {
            // If getProfile fails but token exists, keep saved user
            console.warn('getProfile failed, using saved user data');
          }
        } catch (error: any) {
          console.error('Auth verification error:', error);
          // Only clear if it's an auth error (401), not network errors
          if (error.response?.status === 401 || error.message === 'Authentication required') {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            setUser(null);
          } else {
            // Network error or other issue - keep saved user for offline capability
            console.warn('Using cached user data due to network error');
          }
        }
      }

      setIsLoading(false);
    };

    loadUser();
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    setIsLoading(true);
    try {
      const response = await api.login(credentials.email, credentials.password);

      if (response.success && response.data) {
        const { user, token } = response.data;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        setUser(user);
        toast.success('Giriş başarılı!');
        navigate(ROUTES.DASHBOARD);
      }
    } catch (error: any) {
      const message = error.response?.data?.message || 'Giriş başarısız';
      toast.error(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

  const register = useCallback(async (data: RegisterData) => {
    setIsLoading(true);
    try {
      const response = await api.register(data);

      if (response.success && response.data) {
        const { user, token } = response.data;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        setUser(user);
        toast.success('Kayıt başarılı! Şirket hesabınız onay bekliyor.');
        navigate(ROUTES.DASHBOARD);
      }
    } catch (error: any) {
      const message = error.response?.data?.message || 'Kayıt başarısız';
      toast.error(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    toast.success('Çıkış yapıldı');
    navigate(ROUTES.LOGIN);
  }, [navigate]);

  const updateUser = useCallback((updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  }, []);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    updateUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;

