import { exec, execFile, spawn } from 'node:child_process';
import { Router } from 'express';
import { db } from './db';

export const router = Router();
const TOOLS: Record<string, string> = { ffmpeg: '/usr/bin/ffmpeg', convert: '/usr/bin/convert' };

router.post('/api/transcode', (req, res) => {
  // Arguments in an array, no shell: the input is one argument and cannot start a new command.
  spawn('ffmpeg', ['-i', req.body.file, '-c', 'copy', 'out.mp4']);
  execFile('convert', [req.body.input, 'out.png'], () => res.sendStatus(202));
});

router.get('/api/version', (req, res) => {
  // Fixed commands and allow-listed binaries.
  exec('git rev-parse HEAD', () => undefined);
  execFile(TOOLS[String(req.query.tool)] ?? '/usr/bin/ffmpeg', ['-version'], () => res.end());
});

router.get('/api/match', async (req, res) => {
  // Not child_process at all: RegExp.exec and a database exec.
  const match = /^[a-z]+$/.exec(String(req.query.name));
  await db.exec(`VACUUM`);
  res.json({ match });
});
