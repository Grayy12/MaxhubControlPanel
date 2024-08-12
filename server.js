require("dotenv").config();
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cookieParser = require("cookie-parser");
const path = require("path");
const tokenHandler = require("./tokenHandler.js");
const loginRoute = require("./routes/login.js");
const logoutRoute = require("./routes/logout.js");
const tokenRoute = require("./routes/token.js");

// Set up express and WebSocket server.
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({
  server,
  perMessageDeflate: false,
  clientTracking: true,
  path: "/ws",
});

// Set up middleware.
app.use(express.json());
app.use(cookieParser());

// Returns an array of connected user names.
function getConnectedUsers() {
  return Array.from(ConnectedClients.values()).map(({ username }) => username);
}

function handleResponse(message) {
  const { sender, receiver, success, response } = message;
  for (const [_, admin] of ConnectedAdmins.entries()) {
    if (admin.id === receiver) {
      admin.ws.send(
        JSON.stringify({ action: "cmdresponse", sender, success, response })
      );
      break;
    }
  }
}

const ConnectedClients = new Map();
const ConnectedAdmins = new Map();
const Responses = {};
const { v4: uuidv4 } = require("uuid");

wss.on("connection", (ws) => {
  const connectionId = uuidv4();
  let isAdmin = false;
  let userId = null;
  let username = null;

  ws.connectionId = connectionId;

  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping(() => {});
    } else if (ws.readyState === WebSocket.CLOSED) {
      clearInterval(pingInterval);
      handleDisconnection(connectionId);
    }
  }, 30000);

  const handleDisconnection = (connId) => {
    if (isAdmin) {
      const admin = ConnectedAdmins.get(connId);
      if (admin) {
        console.log(`Admin ${admin.id} disconnected from server`);
        ConnectedAdmins.delete(connId);
      }
    } else if (userId) {
      const client = ConnectedClients.get(connId);
      if (client) {
        console.log(
          `User ${client.username} (${client.userid}) disconnected from server`
        );
        ConnectedClients.delete(connId);
      }
    }
  };

  const handleMessage = (message) => {
    const { action } = message;
    const actions = {
      newuser: () => {
        const { username: newUsername, userid, discordid, placeid } = message;
        userId = userid;
        username = newUsername;
        addNewUser(connectionId, ws, { username: newUsername, userid, discordid, placeid });
      },
      newadmin: () => {
        isAdmin = true;
        addNewAdmin(connectionId, ws, { token: message.token });
      },
      cmdresponse: () => handleResponse(message),
      reconnect: () => handleReconnect(connectionId, message),
    };
    actions[action]?.();
  };

  ws.on("message", (data) => handleMessage(JSON.parse(data.toString())));

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
    handleDisconnection(connectionId);
  });

  ws.on("close", () => {
    clearInterval(pingInterval);
    handleDisconnection(connectionId);
  });
});

function addNewUser(connectionId, ws, { username, userid, discordid, placeid }) {
  const existingUser = findUserByUsername(username);
  if (existingUser) {
    console.log(`Replacing existing connection for user: ${username}`);
    ConnectedClients.delete(existingUser.connectionId);
  }
  ConnectedClients.set(connectionId, { connectionId, username, userid, ws });
  console.log(
    `New user connected: ${username} (${userid}) discordid: ${discordid} placeid: ${placeid} with connection ID: ${connectionId}`
  );
}

function addNewAdmin(connectionId, ws, { token }) {
  const user = tokenHandler.getUserFromToken(token);
  if (user) {
    console.log(
      `Admin connected: ${user.id} with connection ID: ${connectionId}`
    );
    // Remove any existing connection for this admin
    for (const [existingConnId, admin] of ConnectedAdmins.entries()) {
      if (admin.id === user.id) {
        ConnectedAdmins.delete(existingConnId);
      }
    }
    ConnectedAdmins.set(connectionId, { connectionId, id: user.id, ws });
  }
}

function handleReconnect(connectionId, message) {
  const { username, userid, discordid } = message;
  const existingUser = findUserByUsername(username);
  if (existingUser) {
    console.log(
      `User ${username} (${userid}) reconnected with new connection ID: ${connectionId}`
    );
    ConnectedClients.delete(existingUser.connectionId);
    ConnectedClients.set(connectionId, { ...existingUser, connectionId, ws });
  } else {
    console.log(
      `Reconnection failed for user ${username} (${userid}). Creating new connection.`
    );
    addNewUser(connectionId, ws, { username, userid,  discordid});
  }
}

function findUserByUsername(username) {
  for (const user of ConnectedClients.values()) {
    if (user.username === username) {
      return user;
    }
  }
  return null;
}

function findAdminById(id) {
  return [...ConnectedAdmins.values()].find((admin) => admin.id === id);
}

// Handle GET request to the root URL ("/").
app.get("/", tokenHandler.authenticateToken, (req, res) => {
  Responses[req.user.id] = [];
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/login", (req, res) => {
  const token = req.cookies["accessToken"];
  if (token) return res.redirect("/");
  res.sendFile(path.join(__dirname, "login.html"));
});

// Retrieve all connected users
app.get("/users", tokenHandler.authenticateToken, (req, res) => {
  const users = getConnectedUsers();
  res.send({ users: users });
});

app.post("/run", tokenHandler.authenticateToken, (req, res) => {
  const { user, cmd, args } = req.body;
  const userExists = findUserByUsername(user);

  if (userExists) {
    console.log(
      `Sending command to user: ${user}, Command: ${cmd}, Args: ${args}, Connection ID: ${userExists.connectionId}`
    );
    if (userExists.ws.readyState === WebSocket.OPEN) {
      userExists.ws.send(
        JSON.stringify({ sender: req.user.id, action: "run", cmd, args })
      );
      res.send({ success: true });
    } else {
      console.log(
        `User ${user} connection is not open. Current state: ${userExists.ws.readyState}`
      );
      res.send({ success: false, error: "User connection is not open" });
    }
  } else {
    console.log(`User not found: ${user}`);
    res.send({ success: false, error: "User not found" });
  }
});

app.post("/sendres", (req, res) => {
  const { sender, receiver, success, response, id } = req.body;
  console.log({ sender, receiver, success, response, id });

  if (!Responses[receiver]) {
    Responses[receiver] = [];
  }

  Responses[receiver].push({ sender, success, response, id });

  res.sendStatus(200);
});

app.delete("/delres", tokenHandler.authenticateToken, (req, res) => {
  const { id } = req.body;

  if (Responses[req.user.id]) {
    Responses[req.user.id] = Responses[req.user.id].filter(
      (response) => response.id !== id
    );
  }
});

app.get("/responses", tokenHandler.authenticateToken, (req, res) => {
  if (!req.user.id) return res.sendStatus(401);

  const filteredResponses = Responses[req.user.id];
  res.json(filteredResponses);
});

app.post("/login", loginRoute);

app.delete("/logout", logoutRoute);

app.post("/token", tokenRoute);

app.get("/ping", (req, res) => {
  res.sendStatus(200);
});

app.get("/adminuser", tokenHandler.authenticateToken, (req, res) => {
  res.json(req.user);
});

const port = process.env.PORT || 3001;
// Start the server and listen on the specified port
server.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on port ${port}`);

  // constantly ping the server ping endpoint to keep the connection alive
  setInterval(async () => {
    // const res = await fetch("https://testserver-diki.onrender.com/ping", {
    const res = await fetch("https://testserver-diki.onrender.com/ping", {
      method: "GET",
    });
    console.log("pinged server", res.status);
  }, 300000);
});
