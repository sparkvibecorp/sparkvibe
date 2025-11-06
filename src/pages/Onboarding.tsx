import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Button from '../components/Button';
import {
  Heart,
  Book,
  MessageCircle,
  Volume2,
  Zap,
} from 'lucide-react';

const vibes = [
  { id: 'heartbreak', label: 'Heartbreak', Icon: Heart, grad: 'from-rose-500 to-pink-500' },
  { id: 'study', label: 'Study Mode', Icon: Book, grad: 'from-blue-500 to-cyan-500' },
  { id: 'deep', label: 'Deep Talk', Icon: MessageCircle, grad: 'from-purple-500 to-indigo-500' },
  { id: 'rant', label: 'Rant Session', Icon: Volume2, grad: 'from-orange-500 to-red-500' },
  { id: 'hype', label: 'Hype Up', Icon: Zap, grad: 'from-yellow-500 to-green-500' },
];

export default function Onboarding() {
  const [selected, setSelected] = useState<string>('');
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-gray-900">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md bg-gray-900 rounded-3xl p-8 shadow-neon-glow"
      >
        <h1 className="text-3xl font-bold text-center mb-6 neon-text">
          What’s Your Vibe?
        </h1>
        <p className="text-gray-400 text-center mb-8">
          Pick one – we’ll match you instantly.
        </p>

        <div className="grid grid-cols-2 gap-4 mb-8">
          {vibes.map(({ id, label, Icon, grad }) => (
            <motion.button
              key={id}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSelected(id)}
              className={`p-4 rounded-2xl border-2 transition-all ${
                selected === id
                  ? `border-neonPurple bg-gradient-to-r ${grad} text-white`
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <Icon className="w-6 h-6 mx-auto mb-2" />
              <div className="font-medium">{label}</div>
            </motion.button>
          ))}
        </div>

        <Button
          variant="primary"
          onClick={() => selected && navigate('/match')}
          disabled={!selected}
          className="w-full"
        >
          Match Me
        </Button>

        <p className="text-xs text-gray-500 text-center mt-4">
          Mic required – you stay anonymous.
        </p>
      </motion.div>
    </div>
  );
}