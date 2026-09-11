const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

const SAFE_DIR = path.join(__dirname, 'files');

// Target 1: Arbitrary File Read
app.get('/read', (req, res) => {
  const file = req.query.file;
  if (!file) {
    return res.status(400).json({ error: 'Missing required query parameter: file' });
  }

  // Strip any directory components so the request can't escape SAFE_DIR
  const safeName = path.basename(file);
  const filePath = path.join(SAFE_DIR, safeName);

  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: 'File not found' });
      }
      return res.status(500).json({ error: 'Failed to read file' });
    }
    res.send(data);
  });
});

// Target 2: Unvalidated arithmetic
app.get('/add', (req, res) => {
  const a = parseInt(req.query.a, 10);
  const b = parseInt(req.query.b, 10);

  if (Number.isNaN(a) || Number.isNaN(b)) {
    return res.status(400).json({ error: 'Query parameters "a" and "b" must be valid integers' });
  }

  res.json({ result: a + b });
});
app.listen(3000);
// Trigger Qodo PR Scan
