const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

const SAFE_DIR = path.join(__dirname, 'files');
const MAX_READ_BYTES = 5 * 1024 * 1024; // 5 MB cap on /read responses

// Target 1: Arbitrary File Read
app.get('/read', (req, res) => {
  const file = req.query.file;
  if (!file) {
    return res.status(400).json({ error: 'Missing required query parameter: file' });
  }

  // Strip any directory components so the request can't escape SAFE_DIR
  const safeName = path.basename(file);
  const filePath = path.join(SAFE_DIR, safeName);

  fs.realpath(filePath, (realErr, resolvedPath) => {
    if (realErr) {
      if (realErr.code === 'ENOENT') {
        return res.status(404).json({ error: 'File not found' });
      }
      return res.status(500).json({ error: 'Failed to read file' });
    }

    // Resolve SAFE_DIR too (in case it itself contains symlinks) and make sure
    // the fully-resolved target still lives inside it. This blocks symlinks
    // placed inside SAFE_DIR that point outside of it.
    const resolvedSafeDir = fs.realpathSync(SAFE_DIR);
    const relative = path.relative(resolvedSafeDir, resolvedPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return res.status(404).json({ error: 'File not found' });
    }

    fs.stat(resolvedPath, (statErr, stats) => {
      if (statErr) {
        if (statErr.code === 'ENOENT') {
          return res.status(404).json({ error: 'File not found' });
        }
        return res.status(500).json({ error: 'Failed to read file' });
      }

      if (!stats.isFile()) {
        return res.status(404).json({ error: 'File not found' });
      }

      if (stats.size > MAX_READ_BYTES) {
        return res.status(413).json({ error: 'File too large to read' });
      }

      res.type('text/plain; charset=utf-8');

      const stream = fs.createReadStream(resolvedPath, { encoding: 'utf8' });

      stream.on('error', (err) => {
        if (!res.headersSent) {
          if (err.code === 'ENOENT') {
            return res.status(404).json({ error: 'File not found' });
          }
          return res.status(500).json({ error: 'Failed to read file' });
        }
        res.destroy();
      });

      // pipe() respects backpressure automatically
      stream.pipe(res);
    });
  });
});

// Target 2: Unvalidated arithmetic
const INTEGER_PATTERN = /^-?\d+$/;

app.get('/add', (req, res) => {
  const { a, b } = req.query;

  if (typeof a !== 'string' || typeof b !== 'string' || !INTEGER_PATTERN.test(a) || !INTEGER_PATTERN.test(b)) {
    return res.status(400).json({ error: 'Query parameters "a" and "b" must be valid integers' });
  }

  res.json({ result: parseInt(a, 10) + parseInt(b, 10) });
});
app.listen(3000);
// Trigger Qodo PR Scan
