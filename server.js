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
const { Profanity, CensorType } = require("@2toad/profanity");
const { SaveToJSON, LoadFromJSON } = require("./utils/savetojson.js");
const { db } = require("./utils/database.js");
const requestIp = require("request-ip");
const getLuarmorUser = require("./utils/luarmor.js");

const profanity = new Profanity({
  languages: ["en"],
  wholeWord: false,
  grawlix: "****",
  grawlixChar: "*",
});

profanity.removeWords(["fuck", "shit", "damn", "ass", "bitch"]);

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
          message.sender,
          message.metadata
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

  const luarmorUser = await getLuarmorUser(key);
  if (!luarmorUser) {
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

      await userDocRef.update({ ipAddress: ip, discordid });

      if (accountDoc.exists) {
        const accountData = accountDoc.data();
        const updatedUses = (accountData.uses || 0) + 1;

        await accountRef.update({
          uses: updatedUses,
        });
      } else {
        await accountRef.set({
          userid: parseInt(userid),
          username,
          displayname,
          uses: 1,
        });
      }

      if (!gamesDoc.exists) {
        await gamesRef.set({
          gameid: parseInt(gameid),
          gamename,
          placeid: parseInt(placeid),
          timesPlayed: 1,
        });
      } else {
        await gamesRef.update({
          timesPlayed: gamesDoc.data().timesPlayed + 1,
        });
      }
    }
  } catch (error) {
    console.error("Error saving user: ", error);
  }
}

async function getAllDocumentsFromSubcollections(documentPath) {
  const allSubDocs = {}; // Store all documents from subcollections here

  // Get the document reference
  const docRef = db.doc(documentPath);

  // List all subcollections of the document
  const subcollections = await docRef.listCollections();

  // Iterate through each subcollection
  for (const subcollection of subcollections) {
    const subcollectionDocs = [];

    // Fetch all documents in the subcollection
    const querySnapshot = await subcollection.get();

    querySnapshot.forEach((doc) => {
      subcollectionDocs.push({ id: doc.id, ...doc.data() }); // Collect doc ID and data
    });

    // Add this subcollection's documents to the final result
    allSubDocs[subcollection.id] = subcollectionDocs;
  }

  const snapShot = await docRef.get();

  if (snapShot.exists) {
    const data = snapShot.data();
    Object.entries(data).forEach(([key, value]) => {
      allSubDocs[key] = value;
    });
  } else {
    console.log("No such document!");
  }

  return allSubDocs;
}

async function searchDB(searchQuery, limit) {
  const { key, value } = searchQuery;
  console.log(searchQuery);

  limit = limit || 10;

  // Validate key and value
  if (!key || typeof key !== "string" || key.trim() === "") {
    console.error("Invalid key provided.");
    return { keys: {} }; // Return empty object
  }

  if (!value) {
    console.error("Invalid value provided.");
    return { keys: {} }; // Return empty object
  }

  try {
    let result = {};

    const GameKeys = ["gameid", "gamename", "placeid", "timesPlayed"];
    const AccountKeys = ["userid", "username", "displayname", "uses"];

    let groupRef;
    let collectionName;
    if (GameKeys.includes(key)) {
      groupRef = db.collectionGroup("Games");
      collectionName = "Games";
    } else if (AccountKeys.includes(key)) {
      groupRef = db.collectionGroup("Accounts");
      collectionName = "Accounts";
    }

    if (key === "key") {
      const data = await getAllDocumentsFromSubcollections(`Keys/${value}`);
      return { [value]: data };
    }

    if (!groupRef) {
      return { keys: {} }; // No valid group found
    }

    const q = groupRef.where(key, "==", value).limit(limit);
    const qSnapshot = await q.get();

    if (!qSnapshot.empty) {
      console.log(`Found ${qSnapshot.size} documents`);

      // Create an array of promises for retrieving documents from subcollections
      const promises = qSnapshot.docs.map(async (doc) => {
        const scriptKey = doc.ref.path.split("/")[1];
        const idk = await getAllDocumentsFromSubcollections(
          `Keys/${scriptKey}`
        );
        result[scriptKey] = idk;
      });

      // Wait for all promises to resolve
      await Promise.all(promises);
    } else {
      console.log("No documents found");
    }

    // Return the structured result
    return result;
  } catch (error) {
    console.error("Error querying Firestore:", error);
    return { keys: {} }; // Return empty structure on error
  }
}

// HANDLE GLOBAL CHAT
function broadcastMessage(connectionId, message, msgType, sender, metadata) {
  // Filter URLs, emails and phone numbers
  const urlRegex = /\b(?:www\.|https?:\/\/)?[a-z0-9.-]+(?:\.[a-z]{2,})\b/i;
  const emailRegex = /\b[\w.-]+@[\w.-]+\.\w{2,}\b/i;
  const phoneRegex = /\b\d{3}-\d{3}-\d{4}\b/i;

  message = message.replace(emailRegex, "****");
  message = message.replace(phoneRegex, "****");
  message = message.replace(urlRegex, "****");
  message = message.replace(/`/g, "");
  message = profanity.censor(message, CensorType.Word);

  if (message === "" || message.replace(/\s/g, "") === "") {
    return;
  }
  // store the message
  if (!StoredMessages.has(connectionId)) {
    StoredMessages.set(connectionId, {
      messages: [{ message, timestamp: new Date(), msgType, sender, metadata }],
    });
  } else {
    const storedMessages = StoredMessages.get(connectionId);
    storedMessages.messages.push({
      message,
      timestamp: new Date(),
      msgType,
      sender,
      metadata,
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
        JSON.stringify({
          message,
          msgType,
          sender,
          action: "msg_received",
          metadata,
        })
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

app.post("/search", async (req, res) => {
  const { query, token, limit } = req.body;
  if (token !== process.env.ACCESS_TOKEN) return res.sendStatus(401);

  if (!query) return res.sendStatus(400);
  if (query.value && parseInt(query.value)) query.value = parseInt(query.value);

  const users = await searchDB(query, limit);
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

app.get("/luarmor", async (req, res) => {
  const { key } = req.query;

  if (!key) {
    return res.sendStatus(400);
  }

  const luarmorUser = await getLuarmorUser(key);
  if (!luarmorUser) {
    return res.sendStatus(403);
  } else {
    return res.sendStatus(200);
  }
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
