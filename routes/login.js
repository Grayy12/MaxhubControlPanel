require("dotenv").config();
const tokenHandler = require("../tokenHandler.js");

module.exports = (req, res) => {
  const { apiKey } = req.body;

  if (apiKey !== process.env.API_KEY)
    return res.status(401).json({ error: "Invalid API key" });

  const id = Date.now().toString();
  const { accessToken, refreshToken } = tokenHandler.createToken({ id });

  res.cookie("accessToken", accessToken);
  res.cookie("refreshToken", refreshToken);
  res.redirect("/");
};
