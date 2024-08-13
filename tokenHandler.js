require("dotenv").config();
const jwt = require("jsonwebtoken");

const refreshTokens = [];

function authenticateToken(req, res, next) {
  const token = req.cookies["accessToken"];
  const refresh = req.cookies["refreshToken"];

  if (token == null) return res.redirect("/login");

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) {
      res.clearCookie("accessToken");

      if (refresh == null) return res.sendStatus(403);

      const { error, accessToken } = refreshToken(refresh);

      if (!error) {
        res.cookie("accessToken", accessToken);
        return next();
      } else {
        return res.redirect("/login");
      }
    }
    req.user = user;
    next();
  });
}

function getUserFromToken(token) {
  let user;
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, fetchedUser) => {
    if (err) return;
    user = fetchedUser;
  });

  return user;
}

function createToken(user) {
  const accessToken = jwt.sign(
    { id: user.id },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: "15m",
    }
  );
  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: "1d",
    }
  );
  refreshTokens.push(refreshToken);
  return { accessToken, refreshToken };
}

function refreshToken(refreshToken) {
  if (!refreshToken || !refreshTokens.includes(refreshToken))
    // return res.status(403).json({ error: "Invalid refresh token" });
    return { statusCode: 403, error: "Invalid refresh token" };
  let newAccessToken;
  jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    newAccessToken = jwt.sign(
      { id: user.id },
      process.env.ACCESS_TOKEN_SECRET,
      {
        expiresIn: "15m",
      }
    );
  });

  return { statusCode: 201, accessToken: newAccessToken };
}

function deleteToken(refreshToken) {
  refreshTokens = refreshTokens.filter((token) => token !== refreshToken);
  return { statusCode: 200 };
}

module.exports = {
  authenticateToken,
  createToken,
  refreshToken,
  deleteToken,
  getUserFromToken,
};
