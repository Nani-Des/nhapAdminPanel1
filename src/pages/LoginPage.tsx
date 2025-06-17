import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AuthLayout from '../components/layout/AuthLayout';
import Button from '../components/ui/Button';
import { Lock, Eye, EyeOff } from 'lucide-react';

const LoginPage: React.FC = () => {
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showPin, setShowPin] = useState<boolean>(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const success = await login(pin);
      if (success) {
        navigate('/');
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Only allow numeric input
    if (/^\d*$/.test(value) && value.length <= 7) {
      setPin(value);
      setError(null);
    }
  };

  const handleDemoLogin = (demoPin: string) => {
    setPin(demoPin);
    setError(null);
  };

  return (
    <AuthLayout 
      title="Hospital Admin Login" 
      subtitle="Enter your 6-7 digit PIN to access your hospital dashboard"
    >
      <form className="space-y-6" onSubmit={handleLogin}>
        <div>
          <label htmlFor="pin" className="block text-sm font-semibold text-gray-700 mb-3">
            Admin PIN
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Lock className="h-5 w-5 text-gray-400" />
            </div>
            <input
              id="pin"
              name="pin"
              type={showPin ? "text" : "password"}
              inputMode="numeric"
              autoComplete="current-password"
              required
              value={pin}
              onChange={handlePinChange}
              placeholder="Enter your 6-7 digit PIN"
              className="w-full pl-10 pr-12 py-4 bg-gray-50 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white text-center text-lg tracking-widest font-mono transition-all duration-200"
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
              onClick={() => setShowPin(!showPin)}
            >
              {showPin ? (
                <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
              ) : (
                <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
              )}
            </button>
          </div>
          {error && (
            <p className="mt-3 text-sm text-red-600 flex items-center bg-red-50 p-3 rounded-xl">
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {error}
            </p>
          )}
        </div>

        <div>
          <Button
            type="submit"
            variant="primary"
            fullWidth
            isLoading={isLoading}
            disabled={pin.length < 6 || pin.length > 7}
            className="h-12 text-base font-semibold"
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </Button>
        </div>
      </form>

      {/* <div className="mt-8">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-white text-gray-500 font-medium">Demo Credentials</span>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-3">
          <button
            type="button"
            onClick={() => handleDemoLogin('123456')}
            className="w-full bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 text-blue-700 font-medium py-3 px-4 rounded-xl hover:from-blue-100 hover:to-cyan-100 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <div className="text-center">
              <p className="font-semibold">Central Hospital</p>
              <p className="text-sm opacity-75">PIN: 123456</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => handleDemoLogin('654321')}
            className="w-full bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 text-purple-700 font-medium py-3 px-4 rounded-xl hover:from-purple-100 hover:to-pink-100 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <div className="text-center">
              <p className="font-semibold">Mercy Medical Center</p>
              <p className="text-sm opacity-75">PIN: 654321</p>
            </div>
          </button>
        </div>
      </div> */}
    </AuthLayout>
  );
};

export default LoginPage;