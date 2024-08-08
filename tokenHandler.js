require("dotenv").config();
const jwt = require("jsonwebtoken");

const refreshTokens = [];

function authenticateToken(req, res, next) {
  const token = req.cookies["accessToken"];

  if (token == null) return res.redirect("/login");

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) {
      res.clearCookie("accessToken");
      return res.sendStatus(403);
    }
    req.user = user;
    next();
  });
}

function createToken(user) {
  const accessToken = jwt.sign(
    { id: user.id },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: "1h",
    }
  );
  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: "7d",
    }
  );
  refreshTokens.push(refreshToken);
  return { accessToken, refreshToken };
}

function refreshToken(refreshToken) {
  if (!refreshToken || !refreshTokens.includes(refreshToken))
    // return res.status(403).json({ error: "Invalid refresh token" });
    return { statusCode: 403, error: "Invalid refresh token" };

  jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    const newAccessToken = jwt.sign(
      { id: user.id },
      process.env.ACCESS_TOKEN_SECRET,
      {
        expiresIn: "1h",
      }
    );
  });

  return { statusCode: 201, accessToken: newAccessToken };
}

function deleteToken(refreshToken) {
  refreshTokens = refreshTokens.filter((token) => token !== refreshToken);
  return { statusCode: 200 };
}

module.exports = { authenticateToken, createToken, refreshToken, deleteToken };
