const express = require("express");
const WebSocket = require("ws");

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());

// Create a WebSocket server for players to connect to and be able to control their client
const wss = new WebSocket.Server({ port: port });

let ConnectedClients = {};

function GetConnectedUsers() {
  console.log("Getting connected users");
  const users = Object.values(ConnectedClients).map(user => user.username);
  console.log(users);
  return users;
}

function FindUserByUsername(username) {
  console.log("find user by username");
  return Object.values(ConnectedClients).find(user => user.username === username);
}

function AddNewUser(ws, message) {
  console.log(`New user connected`);
  const userExists = Object.values(ConnectedClients).find(user => user.userid === message.userid);

  if (userExists) {
    console.log("User already connected");
    userExists.ws.close();
  }

  ConnectedClients[ws] = {
    username: message.username,
    userid: message.userid,
    ws: ws,
  };

  // console.log(ConnectedClients);
}

function SendCmd(message) {
  console.log("Sending command");
  const user = FindUserByUsername(message.user);
  if (user) {
    user.ws.send(JSON.stringify({ action: "run", cmd: message.cmd, args: message.args }));
  }
}

wss.on("connection", (ws) => {
  console.log("Connected to server");
  
  ws.on("message", (data) => {
    let message = JSON.parse(data.toString());

    switch (message.action) {
      // Add new user
      case "newuser":
        AddNewUser(ws, message);
        break;
      // Run a command
      case "run":
        console.log(message);
        SendCmd(message);
        break;
      default:
        break;
    }
  });

  ws.on("error", console.error);

  ws.on("close", () => {
    if (!ConnectedClients[ws]) return;

    console.log("User Disconnected", ConnectedClients[ws].username);
    delete ConnectedClients[ws];
  });

  // ws.send("User Connected!");
});

app.listen(port + 1, () => {
  console.log(`Express Server listening on port ${port + 1}`);
});

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

app.get("/users", (req, res) => {
  const users = GetConnectedUsers();
  res.send({ users: users });
});

app.post('/run', (req, res) => {
  console.log(req.body);
  const { user, cmd, args } = req.body;
  const userExists = Object.values(ConnectedClients).find(finduser => finduser.username === user);
  if (userExists) {
    userExists.ws.send(JSON.stringify({ action: "run", cmd, args }));
    res.send({ success: true });
  } else {
    res.send({ success: false });
  }
})

console.log(`Websocket listening on port ${port}`);
