import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DIST_DIR = join(__dirname, 'dist');

console.log('Starting server...');
console.log('PORT:', PORT);
console.log('DIST_DIR:', DIST_DIR);
console.log('DIST_DIR exists:', existsSync(DIST_DIR));

// Serve static files from dist directory
app.use(express.static(DIST_DIR));

// SPA fallback - serve index.html for any non-file routes
app.get('*', (req, res) => {
  res.sendFile(join(DIST_DIR, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
