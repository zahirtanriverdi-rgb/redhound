const cp = require('child_process');

function ping(req, res) {
  const output = cp.execSync('ping -c 1 ' + req.query.host);
  res.send(output.toString());
}

module.exports = { ping };
