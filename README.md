# Chatify

Modern full-stack real-time chat application with private 1:1 messaging, group conversations, media sharing, reactions, polls, and secure OTP-based password reset.

## Highlights

- Real-time direct and group messaging with Socket.IO
- Rich message types: text, images, video, voice notes, and file attachments
- Message reactions (WhatsApp-style picker + animated UX)
- Group polls with single or multi-select voting
- Message status lifecycle: sent, delivered, read
- Message editing (time-limited) and forwarding to users/groups
- Privacy controls for profile photo and last-seen visibility
- Contact blocking and conversation clearing
- Secure OTP password reset flow
- Welcome and OTP email delivery via Resend

## Features

### Authentication and Account

- Sign up and login with JWT cookie-based auth
- Auth session check endpoint for persistent login
- Secure logout
- Profile update (name, about, profile photo)
- Password reset with 6-digit OTP verification
	- OTP hash-based verification (OTP never stored as plain text)
	- OTP expiry window
	- Invalid-attempt throttling logic
	- Password reuse prevention

### Direct Messaging

- One-to-one chat threads
- Text and media/file message support:
	- images
	- videos
	- voice messages (with duration)
	- arbitrary files
- Delivery and read receipts
- Pagination and date-jump for long conversations
- Edit message (within a 5-minute window)
- React to messages (toggle/update/remove)
- Forward messages to multiple users/groups
- Clear conversation history

### Group Messaging

- Create groups with name, description, optional group avatar
- Add/remove members (admin-managed)
- Membership-aware group history visibility
- Group text/media/file/audio messages
- Group polls:
	- create poll messages
	- single/multi-select voting
	- real-time vote updates
- React to group messages

### Presence, Privacy, and Safety

- Online user presence via Socket.IO
- Live profile and presence update broadcasts
- Privacy-aware sanitization for:
	- profile photos
	- last seen
	- contact visibility behavior
- Block/unblock users
- CORS origin controls with allowlist + dev tunnel support

### Frontend UX

- Responsive chat layout for desktop and mobile
- Stateful tabs (Chats, Unread, Contacts, Groups)
- Optimistic message sending and updates
- Unread count tracking and persistence in localStorage
- OTP modal with 6-digit split input and resend flow
- Notification toasts and loading states
- Sound cues for incoming/outgoing messages (toggleable)

## Tech Stack

### Frontend

- React 19
- Zustand (state management)
- Vite 7
- Tailwind CSS + DaisyUI
- React Router
- Axios
- Socket.IO Client
- Lucide React icons
- emoji-picker-react
- react-hot-toast

### Backend

- Node.js (>= 20)
- Express
- MongoDB + Mongoose
- Socket.IO
- JWT + cookie-parser authentication
- bcryptjs password hashing
- Cloudinary media storage
- Resend transactional email
- Arcjet security middleware integration

### Testing and Quality

- Jest + Supertest (backend tests)
- Vitest + Testing Library (frontend unit tests)
- Playwright (frontend e2e dependency)
- ESLint (frontend linting)

## Security and Developer Practices

- Layered request protection design using middleware (auth + security)
- Arcjet integrated with:
	- shield protection
	- bot detection
	- sliding-window rate limit policy (currently configured in dry-run/no-op path for safe rollout)
- Password reset OTP uses hash + expiry + attempt guard
- Input validation and ID validation across controllers
- Access control checks for conversation participation and group membership/admin actions
- Privacy-first payload sanitization before sending user data to other clients
- Structured socket events for real-time synchronization (`newMessage`, `messageUpdated`, `group:newMessage`, `group:messageUpdated`, `messagesDelivered`, `messagesRead`)
- Optimistic UI updates with server reconciliation for better perceived performance

## Monorepo Structure

```text
Chatify/
	backend/      # Express API, Socket.IO server, Mongo models/controllers/routes
	frontend/     # React app (Vite)
	scripts/      # Utility scripts
	turnserver.conf
	TURN_SETUP.md
```

## Local Setup

### 1) Install dependencies

```bash
npm install
npm install --prefix backend
npm install --prefix frontend
```

### 2) Configure environment

Create `backend/.env` with required values:

```env
PORT=3000
MONGO_URI=your_mongodb_uri
JWT_SECRET=your_jwt_secret
NODE_ENV=development
CLIENT_URL=http://localhost:5173

RESEND_API_KEY=your_resend_api_key
EMAIL_FROM=your_sender_email
EMAIL_FROM_NAME=Chatify

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

ARCJET_KEY=your_arcjet_key
ARCJET_ENV=disabled
```

### 3) Run the app

Backend:

```bash
npm run dev --prefix backend
```

Frontend:

```bash
npm run dev --prefix frontend
```

## Production Build and Start

From repo root:

```bash
npm run build
npm run start
```

Root build script installs backend/frontend dependencies and builds the frontend. In production mode, backend serves `frontend/dist`.

## Deployment Notes

- Render/Vercel split deployment is supported.
- Single-service deployment is also supported by serving built frontend from backend.
- If running behind a proxy (like Render), `trust proxy` handling is already configured in server startup.
- For email reliability on constrained hosts, Resend HTTP API is used for transactional flows.

## API Modules (High-Level)

- `/api/auth`: auth, profile, privacy, block/unblock, OTP reset
- `/api/messages`: contacts/chats, direct messaging, receipts, edit/reaction/forward/clear
- `/api/groups`: group lifecycle, group messages, polls, reactions

## Current State

This repository includes recent production-oriented improvements such as message reactions, OTP reset UX, privacy-preserving presence handling, and resilient deployment/email behavior.
