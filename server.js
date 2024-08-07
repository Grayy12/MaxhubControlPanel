const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

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

// Set up middleware.
app.use(express.json());

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

// Adds a new user to the list of connected clients.
function addNewUser(ws, { username, userid }) {
  // Check if the user is already connected.
  if (Object.values(ConnectedClients).some((user) => user.userid === userid)) {
    ws.close();
  } else {
    console.log(`New user connected: ${username}`);
    ConnectedClients[ws] = { username, userid, ws };
  }
}

// Sends a command to a specific user.
function sendCmd({ user, cmd, args }) {
  const userExists = findUserByUsername(user);
  if (userExists) {
    userExists.ws.send(JSON.stringify({ action: "run", cmd, args }));
  }
}

// Handle new WebSocket connections.
wss.on("connection", (ws) => {
  console.log("Connected to server");

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
      run: () => sendCmd(message),
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
    delete ConnectedClients[ws];
  });
});

// Handle GET request to the root URL ("/").
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Retrieve all connected users
app.get("/users", (req, res) => {
  const users = getConnectedUsers();
  res.send({ users: users });
});

// Route for running a command on a specific user
app.post("/run", (req, res) => {
  const { user, cmd, args } = req.body;
  const userExists = findUserByUsername(user);

  if (userExists) {
    userExists.ws.send(JSON.stringify({ action: "run", cmd, args }));
  }

  res.send({ success: Boolean(userExists) });
});

const port = process.env.PORT || 3001;
// Start the server and listen on the specified port
server.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on port ${port}`);
});
