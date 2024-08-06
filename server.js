// const express = require("express");
// const http = require("http");
// const WebSocket = require("ws");

// const app = express();
// const port = process.env.PORT || 3001;

// app.use(express.json());

// // Create an HTTP server using the Express app
// const server = http.createServer(app);

// // Create a WebSocket server by passing the HTTP server
// const wss = new WebSocket.Server({ server });

// let ConnectedClients = {};

// function GetConnectedUsers() {
//   console.log("Getting connected users");
//   const users = Object.values(ConnectedClients).map((user) => user.username);
//   console.log(users);
//   return users;
// }

// function FindUserByUsername(username) {
//   console.log("find user by username");
//   return Object.values(ConnectedClients).find(
//     (user) => user.username === username
//   );
// }

// function AddNewUser(ws, message) {
//   console.log("New user connected");
//   const userExists = Object.values(ConnectedClients).find(
//     (user) => user.userid === message.userid
//   );

//   if (userExists) {
//     console.log("User already connected");
//     userExists.ws.close();
//   }

//   ConnectedClients[ws] = {
//     username: message.username,
//     userid: message.userid,
//     ws: ws,
//   };
// }

// function SendCmd(message) {
//   console.log("Sending command");
//   const user = FindUserByUsername(message.user);
//   if (user) {
//     user.ws.send(
//       JSON.stringify({ action: "run", cmd: message.cmd, args: message.args })
//     );
//   }
// }

// wss.on("connection", (ws) => {
//   console.log("Connected to server");

//   ws.on("message", (data) => {
//     let message = JSON.parse(data.toString());

//     switch (message.action) {
//       case "newuser":
//         AddNewUser(ws, message);
//         break;
//       case "run":
//         console.log(message);
//         SendCmd(message);
//         break;
//       default:
//         break;
//     }
//   });

//   ws.on("error", console.error);

//   ws.on("close", () => {
//     if (!ConnectedClients[ws]) return;

//     console.log("User Disconnected", ConnectedClients[ws].username);
//     delete ConnectedClients[ws];
//   });
// });

// app.get("/", (req, res) => {
//   res.sendFile(__dirname + "/index.html");
// });

// app.get("/users", (req, res) => {
//   const users = GetConnectedUsers();
//   res.send({ users: users });
// });

// app.post("/run", (req, res) => {
//   console.log(req.body);
//   const { user, cmd, args } = req.body;
//   const userExists = Object.values(ConnectedClients).find(
//     (finduser) => finduser.username === user
//   );
//   if (userExists) {
//     userExists.ws.send(JSON.stringify({ action: "run", cmd, args }));
//     res.send({ success: true });
//   } else {
//     res.send({ success: false });
//   }
// });

// // Start the server
// server.listen(port, () => {
//   console.log(`Server listening on port ${port}`);
// });

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());

// Create an HTTP server using the Express app
const server = http.createServer(app);

// Create a WebSocket server by passing the HTTP server
const wss = new WebSocket.Server({
  server: server,
  perMessageDeflate: false,
  clientTracking: true,
});

let ConnectedClients = {};

function GetConnectedUsers() {
  console.log("Getting connected users");
  const users = Object.values(ConnectedClients).map((user) => user.username);
  console.log(users);
  return users;
}

function FindUserByUsername(username) {
  console.log("find user by username");
  return Object.values(ConnectedClients).find(
    (user) => user.username === username
  );
}

function AddNewUser(ws, message) {
  console.log("New user connected");
  const userExists = Object.values(ConnectedClients).find(
    (user) => user.userid === message.userid
  );

  if (userExists) {
    console.log("User already connected");
    userExists.ws.close();
  }

  ConnectedClients[ws] = {
    username: message.username,
    userid: message.userid,
    ws: ws,
  };
}

function SendCmd(message) {
  console.log("Sending command");
  const user = FindUserByUsername(message.user);
  if (user) {
    user.ws.send(
      JSON.stringify({ action: "run", cmd: message.cmd, args: message.args })
    );
  }
}

wss.on("connection", (ws) => {
  console.log("Connected to server");

  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping(() => {});
    }
  }, 30000);

  ws.on("message", (data) => {
    let message = JSON.parse(data.toString());

    switch (message.action) {
      case "newuser":
        AddNewUser(ws, message);
        break;
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
    clearInterval(pingInterval);
    if (!ConnectedClients[ws]) return;

    console.log("User Disconnected", ConnectedClients[ws].username);
    delete ConnectedClients[ws];
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/users", (req, res) => {
  const users = GetConnectedUsers();
  res.send({ users: users });
});

app.post("/run", (req, res) => {
  console.log(req.body);
  const { user, cmd, args } = req.body;
  const userExists = Object.values(ConnectedClients).find(
    (finduser) => finduser.username === user
  );
  if (userExists) {
    userExists.ws.send(JSON.stringify({ action: "run", cmd, args }));
    res.send({ success: true });
  } else {
    res.send({ success: false });
  }
});

// Start the server
server.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on port ${port}`);
});
