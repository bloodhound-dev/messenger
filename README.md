# Messenger - Chat Application with Vercel Web Analytics

A simple messenger application built with Next.js 14 and integrated with Vercel Web Analytics.

## Features

- 💬 Simple chat interface
- 📊 Vercel Web Analytics integration
- ⚡ Built with Next.js 14 App Router
- 🎨 Modern, responsive design
- 📱 Mobile-friendly

## Getting Started

### Prerequisites

- Node.js 18+ installed
- A Vercel account (for analytics)

### Installation

1. Install dependencies:

```bash
npm install
# or
pnpm install
# or
yarn install
# or
bun install
```

2. Run the development server:

```bash
npm run dev
# or
pnpm dev
# or
yarn dev
# or
bun dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Vercel Web Analytics Setup

This project is pre-configured with Vercel Web Analytics. The `Analytics` component from `@vercel/analytics/next` is already integrated in the root layout (`app/layout.tsx`).

### To enable analytics:

1. Deploy your app to Vercel
2. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
3. Select your project
4. Click the **Analytics** tab
5. Click **Enable** from the dialog

Once enabled, the analytics will automatically start tracking:
- Page views
- User sessions
- Performance metrics
- Custom events (if configured)

### Viewing Analytics Data

After deployment and enabling analytics:
1. Visit your deployed site to generate some traffic
2. Go to your Vercel Dashboard
3. Select your project and click the **Analytics** tab
4. View real-time and historical data

## Project Structure

```
messenger/
├── app/
│   ├── layout.tsx          # Root layout with Analytics component
│   ├── page.tsx            # Home page with messenger UI
│   ├── page.module.css     # Page-specific styles
│   └── globals.css         # Global styles
├── public/                 # Static assets
├── .gitignore
├── next.config.js          # Next.js configuration
├── package.json
├── tsconfig.json
└── README.md
```

## Key Implementation Details

### Analytics Integration

The Vercel Web Analytics is integrated in the root layout:

```tsx
import { Analytics } from '@vercel/analytics/next'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```

This ensures analytics tracking is available across all pages of the application.

## Learn More

### Next.js

- [Next.js Documentation](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)

### Vercel Analytics

- [Vercel Analytics Documentation](https://vercel.com/docs/analytics)
- [Analytics Package Documentation](https://vercel.com/docs/analytics/package)
- [Custom Events](https://vercel.com/docs/analytics/custom-events)
- [Privacy Policy](https://vercel.com/docs/analytics/privacy-policy)

## Deployment

Deploy your app to Vercel:

```bash
vercel deploy
```

Or connect your Git repository to Vercel for automatic deployments.

## License

MIT
