# pplai.app - Frontend

Progressive Web App (PWA) frontend for the pplai.app networking application.

## Features

- Mobile-first responsive design
- Offline support with service worker
- QR code scanning and generation
- Business card OCR scanning
- Contact management
- Event management
- Profile management
- Tag management
- Chat interface
- Voice notes
- Image compression
- Admin panel

## Tech Stack

- **HTML5/CSS3/JavaScript**: Vanilla JS (no framework)
- **PWA**: Service Worker, Web Manifest
- **QR Codes**: Backend-generated (Python qrcode library)
- **OCR**: Tesseract.js
- **PDF Export**: jsPDF
- **Storage**: LocalStorage for caching

## Setup

### Prerequisites

- Modern web browser (Chrome, Firefox, Safari, Edge)
- HTTP server (for local development)

### Local Development

1. **Using Python HTTP server:**
   ```bash
   python3 -m http.server 8080
   ```

2. **Using Node.js http-server:**
   ```bash
   npx http-server -p 8080
   ```

3. **Access the app:**
   ```
   http://localhost:8080
   ```

### Configuration

Update `api.js` with your backend URL:
```javascript
const API_BASE_URL = 'http://localhost:8000/api';
```

## Project Structure

```
frontend/
├── index.html          # Main HTML file
├── script.js           # Main application logic
├── api.js              # API client
├── styles.css          # Styles
├── sw.js               # Service worker
├── offline-queue.js    # Offline sync queue
├── manifest.json       # PWA manifest
└── README.md          # This file
```

## Features

### Offline Support

- Service worker caches static assets
- Offline queue for contacts, events, and tags
- Automatic sync when online
- Network-first strategy for API calls

### QR Codes

- URL-based QR codes (requires network)
- vCard QR codes (works offline)
- Backend-generated for reliability

### Image Compression

- Client-side compression for all uploads
- Reduces bandwidth and storage costs
- Maintains quality while reducing size

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Production Deployment

1. Update `API_BASE_URL` in `api.js` to production backend
2. Update `manifest.json` with production URLs
3. Serve over HTTPS (required for PWA features)
4. Configure service worker caching strategy
5. Minify and bundle assets (optional)

## License

Proprietary - All rights reserved

