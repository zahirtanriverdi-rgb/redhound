const express = require('express');

const app = express();

app.post('/webhook', express.json(), async (req, res) => {
  const event = req.body;
  switch (event.type) {
    case 'invoice.paid':
      await grantAccess(event.data.object.customer);
      break;
    case 'customer.subscription.deleted':
      await revokeAccess(event.data.object.customer);
      break;
  }
  res.json({ received: true });
});
