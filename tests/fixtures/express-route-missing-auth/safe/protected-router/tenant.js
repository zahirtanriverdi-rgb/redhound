const express = require('express');
const { tenantAuth } = require('../auth');

const router = express.Router();
router.use(tenantAuth());

router.delete('/vods/bulk', async (req, res) => {
  res.json(await deleteVods(req.body.ids));
});

module.exports = router;
