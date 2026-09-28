import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import ProfilePage from './pages/ProfilePage';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <div className="min-h-screen bg-cyber-black text-cyber-text font-sans selection:bg-cyber-primary selection:text-black">
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } />
              <Route path="/profile" element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              } />
              {/* Redirect any unknown route to login */}
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
            <Toaster
              position="top-right"
              toastOptions={{
                style: {
                  background: '#0a0a0a',
                  color: '#00f3ff',
                  border: '1px solid #00f3ff',
                  fontFamily: 'JetBrains Mono',
                },
              }}
            />
          </div>
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
