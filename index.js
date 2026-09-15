const express = require('express');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');
const app = express();

const SAFE_DIR = path.join(__dirname, 'files');
const MAX_READ_BYTES = 5 * 1024 * 1024; // 5 MB cap on /read responses

// Maps a filesystem error (from realpath/open/fstat/streaming) to the HTTP
// status code we should return for it. Kept in one place so every phase of
// /read (the up-front check, the open, and the stream itself) answers the
// same way for the same underlying error.
function statusForFsError(err) {
  switch (err.code) {
    case 'ENOENT':
    case 'ENOTDIR':
    case 'ELOOP': // final path component is a symlink (blocked by O_NOFOLLOW) or a symlink loop
      return 404;
    case 'EACCES':
    case 'EPERM':
      return 403;
    case 'ENAMETOOLONG':
      return 400;
    default:
      return 500;
  }
}

function sendFsError(res, err) {
  const status = statusForFsError(err);
  const message = status === 404 ? 'File not found' : status === 403 ? 'Permission denied' : 'Failed to read file';
  return res.status(status).json({ error: message });
}

// Target 1: Arbitrary File Read
app.get('/read', (req, res) => {
  const file = req.query.file;
  if (!file) {
    return res.status(400).json({ error: 'Missing required query parameter: file' });
  }

  // Strip any directory components so the request can't escape SAFE_DIR
  const safeName = path.basename(file);
  const filePath = path.join(SAFE_DIR, safeName);

  // Up-front containment check: resolve symlinks on both sides and make sure
  // the fully-resolved target still lives inside SAFE_DIR. This is a
  // best-effort check only — it can't close the gap between "we checked" and
  // "we open the file" (a TOCTOU race, e.g. the entry is swapped for a
  // symlink right after this check runs), so it is backed up by an atomic,
  // race-free guard at open time below.
  let resolvedSafeDir;
  try {
    resolvedSafeDir = fs.realpathSync(SAFE_DIR);
    const resolvedPath = fs.realpathSync(filePath);
    const relative = path.relative(resolvedSafeDir, resolvedPath);
    if (relative === '' || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
      return res.status(404).json({ error: 'File not found' });
    }
  } catch (err) {
    return sendFsError(res, err);
  }

  // Open with O_NOFOLLOW: if the final path component is, or was just raced
  // into being, a symlink, the open call itself fails (ELOOP) instead of
  // following it outside SAFE_DIR. Every check from here on (fstat, size,
  // streaming) operates on this single file descriptor, so there is no
  // further window for the target to be swapped out from under us.
  fs.open(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW, (openErr, fd) => {
    if (openErr) {
      return sendFsError(res, openErr);
    }

    const closeFd = () => fs.close(fd, () => {});

    fs.fstat(fd, (statErr, stats) => {
      if (statErr) {
        closeFd();
        return sendFsError(res, statErr);
      }

      if (!stats.isFile()) {
        closeFd();
        return res.status(404).json({ error: 'File not found' });
      }

      if (stats.size > MAX_READ_BYTES) {
        closeFd();
        return res.status(413).json({ error: 'File too large to read' });
      }

      res.type('text/plain; charset=utf-8');

      // Read from the already-opened, already-validated fd (not the path),
      // so nothing can substitute the target between the checks above and
      // the actual read.
      const stream = fs.createReadStream(null, { fd, encoding: 'utf8', autoClose: true });

      // pipeline() (unlike a bare .pipe()) guarantees the read stream (and
      // its fd) is torn down for every outcome: a read error, the client
      // disconnecting mid-transfer, or normal completion — and it surfaces
      // that outcome as a single callback instead of separate 'error'
      // listeners on each stream.
      pipeline(stream, res, (err) => {
        if (!err) {
          return;
        }
        if (!res.headersSent) {
          return sendFsError(res, err);
        }
        // Headers were already flushed to the client, so the status code
        // can no longer change; just make sure the connection is torn down.
        res.destroy();
      });
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
