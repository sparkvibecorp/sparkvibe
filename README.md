# SparkVibe 🎤✨

**Real-time anonymous voice chat matching platform.** Connect with people based on your emotional vibe for instant 1-on-1 conversations.

## 🌟 Features

- **1-on-1 Voice Matching**: Real-time pairing based on emotional vibes
- **5 Vibe Categories**: Heartbreak, Study Mode, Deep Talk, Rant Session, Hype Up
- **Anonymous Conversations**: No profiles, just authentic connections
- **WebRTC Audio**: Crystal-clear voice quality via LiveKit
- **PWA Support**: Install on mobile devices
- **Real-time Queue**: Live matching with sub-second latency

## 🛠️ Tech Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS with neon theme
- **Backend**: Supabase (PostgreSQL + Auth + Realtime)
- **Audio**: LiveKit WebRTC
- **Animations**: Framer Motion
- **Routing**: React Router v7

## 📋 Prerequisites

- Node.js 18+ and npm/yarn
- Supabase account ([supabase.com](https://supabase.com))
- LiveKit account ([livekit.io](https://livekit.io))
- Google OAuth credentials

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/sparkvibecorp/sparkvibe.git
cd sparkvibe
npm install
```

### 2. Set Up Supabase

1. Create a new Supabase project
2. Run the database schema:
   ```bash
   # Copy the SQL from supabase/schema.sql
   # Paste into Supabase SQL Editor and run
   ```
3. Enable Google OAuth:
   - Go to Authentication > Providers
   - Enable Google provider
   - Add your OAuth credentials

### 3. Set Up LiveKit

1. Create a LiveKit project at [livekit.io](https://livekit.io)
2. Get your API Key and Secret
3. Note your WebSocket URL

### 4. Deploy Supabase Edge Function

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Deploy function
supabase functions deploy get-livekit-token

# Set secrets
supabase secrets set LIVEKIT_API_KEY=your-api-key
supabase secrets set LIVEKIT_API_SECRET=your-api-secret
```

### 5. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_LIVEKIT_URL=wss://your-project.livekit.cloud
```

### 6. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:5173`

## 📁 Project Structure

```
sparkvibe/
├── src/
│   ├── components/       # Reusable UI components
│   │   ├── Button.tsx
│   │   └── InstallPWA.tsx
│   ├── hooks/           # Custom React hooks
│   │   ├── useAuth.ts
│   │   ├── useEmotionAnalysis.ts
│   │   ├── useLiveStats.ts
│   │   ├── useMatching.ts (legacy)
│   │   └── useWebRTC.ts (legacy)
│   ├── pages/           # Route pages
│   │   ├── Landing.tsx
│   │   ├── Onboarding.tsx
│   │   └── VibeMatch.tsx
│   ├── lib/
│   │   └── supabase.ts  # Supabase client
│   ├── types/
│   │   └── index.ts     # TypeScript types
│   ├── utils/
│   │   └── helpers.ts   # Utility functions
│   └── App.tsx          # Main app with routing
├── supabase/
│   ├── schema.sql       # Database schema
│   └── functions/       # Edge functions
│       └── get-livekit-token/
└── public/              # Static assets
```

## 🔧 Available Scripts

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

## 🗄️ Database Schema

### Tables

- **users**: User profiles and status
- **calls**: Active and historical calls
- **call_queue**: Matching queue
- **webrtc_signals**: WebRTC signaling (legacy)

### Functions

- `get_live_stats()`: Get active users and call counts
- `cleanup_expired_queue()`: Remove expired queue entries

See `supabase/schema.sql` for full schema.

## 🔐 Security

- Row Level Security (RLS) enabled on all tables
- Users can only access their own data
- Google OAuth for authentication
- Automatic user profile creation on signup

## 🎨 Theming

Custom neon theme defined in `tailwind.config.js`:

```js
colors: {
  neonPurple: '#A020F0',
  neonMagenta: '#7F00FF',
  neonCyan: '#00C6FF',
}
```

## 📱 PWA Configuration

The app is installable as a Progressive Web App:

- Offline support via service worker
- Custom app icons
- Standalone display mode
- Auto-updates

## 🐛 Known Issues

1. **Emotion Detection**: Built but not displayed in UI (future feature)
2. **Call History**: No persistence of past conversations
3. **User Reporting**: No moderation system yet

## 🔮 Future Features

- [ ] Emotion visualization during calls
- [ ] Call history and statistics
- [ ] User reporting and moderation
- [ ] In-call emoji reactions
- [ ] Custom vibe creation
- [ ] Time-based matching preferences

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

- **Email**: support@sparkvibe.app
- **Issues**: [GitHub Issues](https://github.com/sparkvibecorp/sparkvibe/issues)
- **Docs**: [Documentation](https://docs.sparkvibe.app)

## 🙏 Acknowledgments

- [Supabase](https://supabase.com) - Backend infrastructure
- [LiveKit](https://livekit.io) - WebRTC platform
- [Framer Motion](https://www.framer.com/motion/) - Animations
- [Lucide](https://lucide.dev) - Icons

---

Built with ❤️ by SparkVibe Corp