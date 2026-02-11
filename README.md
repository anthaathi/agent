# Anthaathi Agent

Web-based AI coding assistant for managing interactive coding sessions with AI agents. Provides a chat interface with integrated terminal, file browser, and git diff viewer.

## Features

- Real-time AI chat with streaming responses
- Integrated terminal for each session
- Project and session management
- File browser and git diff viewer
- Command palette for quick navigation
- Dark and light theme support

## Getting Started

**Prerequisites**
- Node.js with Yarn 4.x
- Backend API running on port 3000

**Frontend**
```bash
yarn install
yarn dev
```

**Backend**
```bash
cd backend
yarn install
yarn dev
```

**Configuration**

Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Edit `VITE_API_URL` if your backend runs on a different port.

## License

MIT
