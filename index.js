const express = require('express');
const fs = require('fs');
const app = express();

// Target 1: Arbitrary File Read
app.get('/read', (req, res) => {
  const file = req.query.file;
  fs.readFile(file, 'utf8', (err, data) => {
    res.send(data);
  });
});

// Target 2: Unvalidated arithmetic
app.get('/add', (req, res) => {
  const result = parseInt(req.query.a) + parseInt(req.query.b);
  res.json({ result });
});
app.listen(3000);
// Trigger Qodo PR Scan
