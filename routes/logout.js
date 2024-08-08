// refreshTokens = refreshTokens.filter((token) => token !== req.body.token);
// res.sendStatus(204);
const tokenHandler = require("../tokenHandler.js");

module.exports = (req, res) => {
  const token = req.cookies["refreshToken"];
  if (token == null) return res.sendStatus(401);
  tokenHandler.deleteToken(req.cookies["refreshToken"]);
  res.sendStatus(204);
}