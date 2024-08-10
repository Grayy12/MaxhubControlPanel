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

const ConnectedClients = {};
const ConnectedAdmins = {};

// Set up middleware.
app.use(express.json());
app.use(cookieParser());

// Returns an array of connected user names.
function getConnectedUsers() {
  return Object.values(ConnectedClients).map(({ username }) => username);
}

// Finds a user by their username.
function findUserByUsername(username) {
  return Object.values(ConnectedClients).find(
    ({ username: userUsername }) => userUsername === username
  );
}

function findAdminById(id) {
  return Object.values(ConnectedAdmins).find(
    ({ id: adminId }) => adminId === id
  );
}

// Adds a new user to the list of connected clients.
function addNewUser(ws, { username, userid }) {
  // Check if the user is already connected.
  if (Object.values(ConnectedClients).some((user) => user.userid === userid)) {
    ws.close();
  }
  console.log(`New user connected: ${username}`);
  ConnectedClients[ws] = { username, userid, ws };
}

function addNewAdmin(ws, { token }) {
  const user = tokenHandler.getUserFromToken(token);
  if (user) {
    console.log(`New admin connected: ${user.id}`);
    ConnectedAdmins[ws] = { id: user.id, ws };
  }
}

function handleResponse(message) {
  const { sender, receiver, success, response } = message;
  const admin = findAdminById(receiver);
  admin?.ws?.send(
    JSON.stringify({ action: "cmdresponse", sender, success, response })
  );
}

// Handle new WebSocket connections.
wss.on("connection", (ws) => {
  // console.log("Connected to server");

  // Set up a ping interval to keep the connection alive.
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping(() => {});
    }
  }, 30000);

  // Handle incoming messages.
  const handleMessage = (message) => {
    const { action } = message;
    const actions = {
      newuser: () =>
        addNewUser(ws, { username: message.username, userid: message.userid }),
      newadmin: () => addNewAdmin(ws, { token: message.token }),
      cmdresponse: () => handleResponse(message),
    };
    actions[action]?.(); // Execute the corresponding action.
  };

  // Handle incoming messages.
  ws.on("message", (data) => handleMessage(JSON.parse(data.toString())));

  // Handle WebSocket errors.
  ws.on("error", console.error);

  // Handle WebSocket close events.
  ws.on("close", () => {
    clearInterval(pingInterval);
    if (ConnectedClients[ws])
      console.log(`${ConnectedClients[ws].username} Disconnected from server`);
    delete ConnectedClients[ws];

    if (ConnectedAdmins[ws])
      console.log(`Admin ${ConnectedAdmins[ws].id} Disconnected from server`);
    delete ConnectedAdmins[ws];
  });
});

// Handle GET request to the root URL ("/").
app.get("/", tokenHandler.authenticateToken, (req, res) => {
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

// Route for running a command on a specific user
app.post("/run", tokenHandler.authenticateToken, (req, res) => {
  const { user, cmd, args } = req.body;
  const userExists = findUserByUsername(user);

  if (userExists) {
    console.log(user, cmd, args);
    userExists.ws.send(
      JSON.stringify({ sender: req.user.id, action: "run", cmd, args })
    );
  }

  res.send({ success: Boolean(userExists) });
});

app.post("/login", loginRoute);

app.delete("/logout", logoutRoute);

app.post("/token", tokenRoute);

const port = process.env.PORT || 3001;
// Start the server and listen on the specified port
server.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on port ${port}`);
});
