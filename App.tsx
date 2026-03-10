import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ClientArea from './pages/ClientArea';
import PartnerArea from './pages/PartnerArea';
import AdminArea from './pages/AdminArea';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<ClientArea />} />
      <Route path="/parceiros" element={<PartnerArea />} />
      <Route path="/admin" element={<AdminArea />} />
      <Route path="/admin/login" element={<Navigate to="/parceiros" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
