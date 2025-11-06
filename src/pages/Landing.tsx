import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Button from '../components/Button';
import { Mic, Users, Zap } from 'lucide-react';
import { InstallPWA } from '../components/InstallPWA';

const steps = [
  { Icon: Mic, title: 'Voice Check-In', desc: 'Share your vibe in 10 s.' },
  { Icon: Users, title: 'Instant Match', desc: 'AI pairs you instantly.' },
  { Icon: Zap, title: 'Spark Convo', desc: 'Anonymous voice chat.' },
];

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-900">
      {/* Hero */}
      <section className="flex-1 flex items-center justify-center px-4 py-16">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <motion.h1
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-6xl md:text-8xl font-bold neon-text mb-6"
          >
            Spark<span className="block">Vibe</span>
          </motion.h1>
          <p className="text-xl md:text-2xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Real-time voice matches based on mood. No swipes, just sparks.
          </p>
          <Link to="/onboarding">
          <InstallPWA />
            <Button variant="primary">Start Vibing</Button>
          </Link>
        </motion.div>
      </section>

      {/* How it works */}
      <section className="py-20 bg-gray-800/30">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-4xl font-bold text-center mb-16 neon-text">
            How It Sparks
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {steps.map(({ Icon, title, desc }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.2 }}
                className="text-center p-6 rounded-2xl bg-gray-900/50 neon-glow-hover"
              >
                <Icon className="w-12 h-12 mx-auto mb-4 text-neonPurple" />
                <h3 className="text-xl font-semibold mb-2">{title}</h3>
                <p className="text-gray-400">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-8 text-center text-gray-500 text-sm">
        © 2025 SparkVibe
      </footer>
    </div>
  );
}