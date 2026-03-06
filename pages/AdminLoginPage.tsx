import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LoginForm } from '../components/LoginForm';

export default function AdminLoginPage() {
  const { user, loading, signIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (user?.role === 'ADMIN') navigate('/admin', { replace: true });
    else if (user) navigate('/', { replace: true });
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500"><i className="fas fa-spinner fa-spin text-3xl"></i></div>
      </div>
    );
  }

  if (user?.role === 'ADMIN') return null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <LoginForm
        title="Admin"
        subtitle="Acesso restrito"
        onSubmit={signIn}
        submitLabel="Entrar"
        onSuccess={() => {}}
      />
    </div>
  );
}
