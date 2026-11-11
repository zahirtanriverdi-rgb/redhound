const express = require('express');
const { tenantAuth, namespaceGrant } = require('../auth');

const router = express.Router();
// Middleware bundles defined once and reused by name.
const upload = [tenantAuth(), namespaceGrant('upload')];
const transform = [tenantAuth(), namespaceGrant('transform')];

router.post('/:id/upload-url', upload, async (req, res) => {
  res.json(await presign(req.params.id));
});
router.post('/:jobId/approve', transform, async (req, res) => {
  res.json(await approve(req.params.jobId));
});

module.exports = router;
