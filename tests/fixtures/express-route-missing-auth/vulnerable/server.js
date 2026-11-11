const express = require('express');

const app = express();

app.put('/admin/settings', function (req, res) {
  saveSettings(req.body);
  res.json({ ok: true });
});
