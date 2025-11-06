import { useState, useEffect } from 'react';
import Button from './Button';
import { Download } from 'lucide-react';

export function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 pointer-events-none">
      <div className="bg-gray-900/95 backdrop-blur-sm rounded-2xl p-4 shadow-neon-glow flex items-center gap-3 max-w-sm mx-auto pointer-events-auto">
        <Download className="w-6 h-6 text-neonPurple flex-shrink-0" />
        <div className="flex-1">
          <p className="font-semibold text-gray-100">Install SparkVibe</p>
          <p className="text-xs text-gray-400">Add to home screen</p>
        </div>
        <Button variant="secondary" onClick={install}>
          Install
        </Button>
      </div>
    </div>
  );
}