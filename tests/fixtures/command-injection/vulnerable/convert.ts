import { exec, execFile as runFile, spawn } from 'node:child_process';
import { Router } from 'express';

export const router = Router();

router.post('/api/convert', (req, res) => {
  const { file } = req.body;
  exec(`ffmpeg -i uploads/${file} out.mp4`, (error) => {
    res.json({ ok: !error });
  });
});

router.post('/api/resize', (req, res) => {
  spawn('convert', [req.body.input, '-resize', '50%', 'out.png'], { shell: true });
  res.sendStatus(202);
});

router.get('/api/version', (req, res) => {
  runFile(String(req.query.tool), ['--version'], (_error, stdout) => res.send(stdout));
});
