import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Button from '../components/Button';
import { Sparkles, Mic, AlertCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function Landing() {
  const navigate = useNavigate();
  const { user, signIn, loading, error } = useAuth();

  const handleStart = () => {
    console.log('Button clicked', { user, loading });
    if (user) {
      navigate('/onboarding');
    } else {
      signIn();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center max-w-md"
      >
        {/* Logo */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          className="inline-flex items-center justify-center w-24 h-24 mb-8 rounded-full bg-gradient-to-br from-neonPurple to-neonCyan shadow-neon-glow"
        >
          <Sparkles className="w-12 h-12 text-white" />
        </motion.div>

        <h1 className="text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-neonPurple to-neonCyan">
          SparkVibe
        </h1>
        <p className="text-xl text-gray-300 mb-8">
          Match. Talk. Vibe. Instantly.
        </p>

        {/* Feature */}
        <div className="flex items-center justify-center gap-2 text-gray-400 mb-8">
          <Mic className="w-5 h-5" />
          <span>Real-time voice calls • 1-on-1 matching</span>
        </div>

        {/* Error Display */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-300 text-left">{error}</p>
          </motion.div>
        )}

        {/* Button */}
        <Button
          variant="primary"
          onClick={handleStart}
          disabled={loading}
          className="w-full max-w-xs mx-auto"
        >
          {loading ? 'Loading...' : user ? 'Continue' : 'Start Vibing'}
        </Button>

        <p className="text-xs text-gray-500 mt-6">
          By continuing, you agree to our Terms & Privacy Policy
        </p>
      </motion.div>
    </div>
  );
}