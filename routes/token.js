require("dotenv").config();
const tokenHandler = require("../tokenHandler.js");

module.exports = (req, res) => {
  const token = req.cookies["refreshToken"];
  if (token == null) return res.sendStatus(401);

  const { statusCode, error, accessToken } = tokenHandler.refreshToken(req.cookies["refreshToken"]);
  if (error) return res.status(statusCode).json({ error: error });
  res.cookie("accessToken", accessToken, { httpOnly: true });
  res.sendStatus(201);
};
