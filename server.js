const express = require("express");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Static HTML serve
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// WebSocket logic (basic)
wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      console.log("Received:", data);

      // Example response
      ws.send(
        JSON.stringify({
          type: "log",
          message: "Server received your request",
          messageType: "info"
        })
      );
    } catch (err) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Invalid JSON format"
        })
      );
    }
  });

  ws.on("close", () => console.log("Client disconnected"));
});

// Render-compatible port
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
