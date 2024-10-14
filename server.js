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
const leoProfanity = require("leo-profanity");
const { SaveToJSON, LoadFromJSON } = require("./utils/savetojson.js");
const { db } = require("./utils/database.js");
const requestIp = require("request-ip");
// const { query, where, collection } = require("@firebase/firestore");

leoProfanity.remove(["fuck", "shit", "damn", "ass", "bitch"]);

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
app.use(requestIp.mw());

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
const BannedUsers = [];

const StoredMessages = new Map();

const Responses = {};
const { v4: uuidv4 } = require("uuid");

const PING_INTERVAL = 10000;
const PING_TIMEOUT = 10000;

wss.on("connection", (ws) => {
  const connectionId = uuidv4();
  let pingTimeout = null;

  ws.connectionId = connectionId;

  const handleDisconnection = (connId) => {
    const client = ConnectedClients.get(connId);
    if (client) {
      console.log(
        `User ${client.username} (${client.userid}) disconnected from server`
      );
      ConnectedClients.delete(connId);
    }
  };

  const sendPing = () => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: "ping" }));

      pingTimeout = setTimeout(() => {
        console.log(`Client ${connectionId} did not respond to ping`);
        ws.close();
        handleDisconnection(connectionId);
      }, PING_TIMEOUT);
    } else if (
      ws.readyState === WebSocket.CLOSING ||
      ws.readyState === WebSocket.CLOSED
    ) {
      clearInterval(pingInterval);
      handleDisconnection(connectionId);
    }
  };

  const pingInterval = setInterval(sendPing, PING_INTERVAL);

  const handleMessage = (message) => {
    const { action } = message;
    const actions = {
      newuser: () => {
        message.ws = ws;
        addNewUser(connectionId, message);
      },
      cmdresponse: () => handleResponse(message),
      pong: () => {
        console.log(`Client ${connectionId} responded to ping`);
        clearTimeout(pingTimeout);
      },

      send_msg: () => {
        broadcastMessage(
          connectionId,
          message.chat_msg,
          message.msg_type,
          message.sender
        );
      },
      get_msgs: () => {
        ws.send(
          JSON.stringify({
            action: "get_msgs",
            messages: getAllStoredMessages(),
          })
        );
      },
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
    clearTimeout(pingTimeout);
    handleDisconnection(connectionId);
  });
});

function addNewUser(connectionId, message) {
  const existingUser = findUserByUsername(message.username);
  if (existingUser) {
    console.log(`Replacing existing connection for user: ${message.username}`);
    ConnectedClients.delete(existingUser.connectionId);
  }
  message.connectionId = connectionId;
  ConnectedClients.set(connectionId, message);
  console.log(
    `New user connected: ${message.username} (${message.userid}) discordid: ${message.discordid} placeid: ${message.placeid} jobid: ${message.jobid} with connection ID: ${connectionId}`
  );
}

async function saveUser(user) {
  const {
    key,
    username,
    userid,
    displayname,
    ip,
    gameid,
    placeid,
    gamename,
    discordid,
  } = user;

  if (!key || typeof key !== "string" || key.trim() === "") {
    console.error("Invalid key provided.");
    return;
  }

  if (!userid || typeof userid !== "string" || userid.trim() === "") {
    console.error("Invalid userid provided.");
    return;
  }

  const keysRef = db.collection("Keys");

  try {
    const userDocRef = keysRef.doc(key);
    const userRef = await userDocRef.get();

    if (!userRef.exists) {
      await userDocRef.set({ createdAt: new Date(), ipAddress: ip, discordid });
      await userDocRef
        .collection("Accounts")
        .doc(userid)
        .set({
          userid: parseInt(userid),
          username,
          displayname,
          uses: 1,
        });

      await userDocRef
        .collection("Games")
        .doc(gameid)
        .set({
          gameid: parseInt(gameid),
          gamename,
          placeid: parseInt(placeid),
          timesPlayed: 1,
        });
    } else {
      const accountRef = userDocRef.collection("Accounts").doc(userid);
      const accountDoc = await accountRef.get();

      const gamesRef = userDocRef.collection("Games").doc(gameid);
      const gamesDoc = await gamesRef.get();

      if (accountDoc.exists) {
        const accountData = accountDoc.data();
        const updatedUses = (accountData.uses || 0) + 1;

        await accountRef.update({
          uses: updatedUses,
        });

        await userDocRef.update({
          ipAddress: ip,
          discordid,
        });

        await gamesRef.update({
          timesPlayed: gamesDoc.data().timesPlayed + 1,
        });
      } else {
        await userDocRef.update({ ipAddress: ip });
        await accountRef.set({
          userid: parseInt(userid),
          username,
          displayname,
          uses: 1,
        });

        await gamesRef.set({
          gameid: parseInt(gameid),
          gamename,
          placeid: parseInt(placeid),
          timesPlayed: 1,
        });
      }
    }
  } catch (error) {
    console.error("Error saving user: ", error);
  }
}

async function searchDB(searchQuery) {
  const { key, value, group } = searchQuery;
  console.log(searchQuery);

  if (!key || typeof key !== "string" || key.trim() === "") {
    console.error("Invalid key provided.");
    return;
  }

  if (!value) {
    console.error("Invalid value provided.");
    return;
  }

  try {
    const groupRef = db.collectionGroup(group);
    if (!groupRef) {
      console.error(`Invalid group provided: ${group}`);
      return;
    }

    const q = groupRef.where(key, "==", value);
    const qSnapshot = await q.get();

    if (qSnapshot.empty) {
      console.log("No matching documents found.");
      return [];
    }

    return qSnapshot.docs;
  } catch (error) {
    console.error("Error querying Firestore:", error);
  }
}

// async function searchUsers(query) {
//   const keysRef = db.collection("Keys");
//   const matchingKeys = []; // Store matching keys

//   try {
//     // Get all documents in the 'Keys' collection
//     const keysSnapshot = await keysRef.get();

//     for (const keyDoc of keysSnapshot.docs) {
//       const key = keyDoc.id;

//       // Get all documents in the 'Accounts' subcollection for this key
//       const accountsRef = keysRef.doc(key).collection("Accounts");
//       const accountsSnapshot = await accountsRef.get();

//       // Check each account in the 'Accounts' subcollection
//       accountsSnapshot.forEach((accountDoc) => {
//         const accountData = accountDoc.data();

//         // Dynamically check the query against account data
//         const matchesQuery = Object.keys(query).every((field) => {
//           // Convert both field and query to lowercase for case-insensitive matching (optional)
//           if (
//             typeof accountData[field] === "string" &&
//             typeof query[field] === "string"
//           ) {
//             return (
//               accountData[field].toLowerCase() === query[field].toLowerCase()
//             );
//           }
//           // For non-string fields, check directly
//           return accountData[field] === query[field];
//         });

//         // If the account matches the query, add the key to the result list
//         if (matchesQuery) {
//           matchingKeys.push(key);
//         }
//       });
//     }

//     return matchingKeys; // Return list of matching keys
//   } catch (error) {
//     console.error("Error searching users: ", error);
//     return [];
//   }
// }

// HANDLE GLOBAL CHAT
function broadcastMessage(connectionId, message, msgType, sender, senderID) {
  if (BannedUsers.includes(senderID)) {
    return;
  }
  // Filter URLs, emails and phone numbers
  const urlRegex = /\b(?:www\.|https?:\/\/)?[a-z0-9.-]+(?:\.[a-z]{2,})\b/i;
  const emailRegex = /\b[\w.-]+@[\w.-]+\.\w{2,}\b/i;
  const phoneRegex = /\b\d{3}-\d{3}-\d{4}\b/i;

  message = message.replace(emailRegex, "****");
  message = message.replace(phoneRegex, "****");
  message = message.replace(urlRegex, "****");
  message = message.replace(/`/g, "");
  message = leoProfanity.clean(message);

  if (message === "" || message.replace(/\s/g, "") === "") {
    return;
  }
  // store the message
  if (!StoredMessages.has(connectionId)) {
    StoredMessages.set(connectionId, {
      messages: [{ message, timestamp: new Date(), msgType, sender }],
    });
  } else {
    const storedMessages = StoredMessages.get(connectionId);
    storedMessages.messages.push({
      message,
      timestamp: new Date(),
      msgType,
      sender,
    });
    StoredMessages.set(connectionId, storedMessages);
  }

  // Debug logs
  console.log(
    `${connectionId} sent message: ${message}, msgType: ${msgType}, sender: ${sender}`
  );

  // Send message to all clients except the sender
  for (const [_, client] of ConnectedClients.entries()) {
    if (client.connectionId !== connectionId) {
      client.ws.send(
        JSON.stringify({ message, msgType, sender, action: "msg_received" })
      );
    } else {
      client.ws.send(JSON.stringify({ action: "msg_sent" }));
    }
  }
}

function getAllStoredMessages() {
  const messages = [];
  for (const [_, storedMessages] of StoredMessages.entries()) {
    messages.push(...storedMessages.messages);
  }
  return messages.sort((a, b) => a.timestamp - b.timestamp);
}

// Delete message older than a day
setInterval(() => {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 86400000);
  for (const [_, storedMessages] of StoredMessages.entries()) {
    storedMessages.messages = storedMessages.messages.filter((message) => {
      return new Date(message.timestamp) > twentyFourHoursAgo;
    });
  }
}, 86400000);

function findUserByUsername(username) {
  for (const user of ConnectedClients.values()) {
    if (user.username === username) {
      return user;
    }
  }
  return null;
}

// Handle GET request to the root URL ("/").
app.get("/", tokenHandler.authenticateToken, (req, res) => {
  if (!req.user || !req.user.id) return res.redirect("/login");
  if (!Responses[req.user.id]) Responses[req.user.id] = [];
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/login", (req, res) => {
  const token = req.cookies["accessToken"];
  if (token) return res.redirect("/");
  res.sendFile(path.join(__dirname, "login.html"));
});

// Retrieve all connected users
app.get("/users", tokenHandler.authenticateToken, (req, res) => {
  const users = Array.from(ConnectedClients.values());
  // console.log("users", users)
  res.send({ users: users });
});

app.get("/messages", (req, res) => {
  const messages = getAllStoredMessages();
  res.send({ messages: messages });
});

app.post("/ban", (req, res) => {
  const { id, token } = req.body;

  if (token !== process.env.BAN_TOKEN) {
    res.send({ success: false, error: "Invalid token" });
    return;
  }

  BannedUsers.push(id);
  SaveToJSON(BannedUsers);
  res.send({ success: true });
});

app.post("/adduserdata", async (req, res) => {
  var data = req.body;
  data.ip = requestIp.getClientIp(req);
  await saveUser(data);
  console.log("User data saved:", data);
  res.send({ success: true });
});

app.get("/search", async (req, res) => {
  const { query, token } = req.body;
  if (token !== process.env.ACCESS_TOKEN) return res.sendStatus(401);
  const users = await searchDB(query);
  res.send({ keys: users });
});

app.post("/run", tokenHandler.authenticateToken, (req, res) => {
  const { user, cmd, args } = req.body;
  console.log(
    `Received command request: User: ${user}, Command: ${cmd}, Args:`,
    args
  );

  const userExists = findUserByUsername(user);

  if (userExists) {
    console.log(
      `User found: ${user}, Connection ID: ${userExists.connectionId}`
    );
    if (userExists.ws.readyState === WebSocket.OPEN) {
      userExists.ws.send(
        JSON.stringify({ sender: req.user.id, action: "run", cmd, args })
      );
      console.log(`Command sent to user: ${user}, Command: ${cmd}`);
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

  if (req.user && Responses[req.user.id]) {
    Responses[req.user.id] = Responses[req.user.id].filter(
      (response) => response.id !== id
    );
  }
});

app.get("/responses", tokenHandler.authenticateToken, (req, res) => {
  if (!req.user || !req.user.id) return res.sendStatus(401);

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

  // BannedUsers = LoadFromJSON();

  // constantly ping the server ping endpoint to keep the connection alive
  setInterval(async () => {
    // const res = await fetch("https://testserver-diki.onrender.com/ping", {
    const res = await fetch("http://localhost:3001/ping", {
      method: "GET",
    });
    console.log("pinged server", res.status);
  }, 300000);
});
