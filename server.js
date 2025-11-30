const express = require("express");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ---------------- TASK STORE ----------------

/**
 * task = {
 *   id,
 *   ownerWs,
 *   sent,
 *   failed,
 *   activeCookies,
 *   loops,
 *   restarts,
 *   delayMs,
 *   messages,
 *   currentIndex,
 *   logs: [{ time, message, type }],
 *   interval
 * }
 */
const tasks = new Map();

function generateTaskId() {
  return (
    Date.now().toString() +
    Math.floor(Math.random() * 10000).toString().padStart(4, "0")
  );
}

function addTaskLog(task, message, type = "info", wsOverride) {
  const time = new Date().toLocaleTimeString();
  const entry = { time, message, type };

  task.logs.push(entry);
  if (task.logs.length > 100) {
    task.logs.shift(); // last 100 logs
  }

  const targetWs = wsOverride || task.ownerWs;
  if (targetWs && targetWs.readyState === WebSocket.OPEN) {
    targetWs.send(
      JSON.stringify({
        type: "log",
        message,
        messageType: type,
      })
    );
  }
}

function startTask(data, ws) {
  const messages = (data.messageContent || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!messages.length) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Message file is empty.",
      })
    );
    return;
  }

  const taskId = generateTaskId();
  const delayMs = (data.delay || 5) * 1000;

  const task = {
    id: taskId,
    ownerWs: ws,
    sent: 0,
    failed: 0,
    activeCookies: data.cookieContent ? 1 : 0,
    loops: 0,
    restarts: 0,
    delayMs,
    messages,
    currentIndex: 0,
    logs: [],
    interval: null,
  };

  // Simulated sending loop
  task.interval = setInterval(() => {
    try {
      if (!task.messages.length) {
        return;
      }

      const msgText = task.messages[task.currentIndex];
      task.currentIndex =
        (task.currentIndex + 1) % task.messages.length;

      if (task.currentIndex === 0) {
        task.loops += 1;
      }

      task.sent += 1;

      const composed =
        (data.hatersName || "") +
        " " +
        msgText +
        " " +
        (data.lastHereName || "");

      addTaskLog(
        task,
        `Simulated send to thread ${data.threadID || "N/A"}: "${composed.trim()}"`,
        "success"
      );
    } catch (err) {
      task.failed += 1;
      addTaskLog(
        task,
        "Error in simulated send loop: " + err.message,
        "error"
      );
    }
  }, delayMs);

  tasks.set(taskId, task);

  // Tell frontend task started
  ws.send(
    JSON.stringify({
      type: "task_started",
      taskId,
    })
  );

  addTaskLog(task, `Task ${taskId} created and started.`, "info");
}

function stopTask(taskId, ws) {
  const task = tasks.get(taskId);
  if (!task) {
    ws.send(
      JSON.stringify({
        type: "error",
        from: "stop",
        message: "Task not found or already stopped.",
      })
    );
    return;
  }

  if (task.interval) clearInterval(task.interval);

  addTaskLog(task, `Task ${taskId} stopped by user.`, "warning", ws);

  ws.send(
    JSON.stringify({
      type: "task_stopped",
      taskId,
    })
  );

  tasks.delete(taskId);
}

function sendTaskDetails(taskId, ws) {
  const task = tasks.get(taskId);
  if (!task) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Task not found.",
      })
    );
    return;
  }

  ws.send(
    JSON.stringify({
      type: "task_details",
      taskId: task.id,
      sent: task.sent,
      failed: task.failed,
      activeCookies: task.activeCookies,
      loops: task.loops,
      restarts: task.restarts,
      logs: task.logs,
    })
  );
}

// ---------------- EXPRESS STATIC ----------------

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// ---------------- WEBSOCKET LOGIC ----------------

wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (err) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Invalid JSON format.",
        })
      );
      return;
    }

    if (!data || !data.type) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Message type is required.",
        })
      );
      return;
    }

    switch (data.type) {
      case "start":
        startTask(data, ws);
        break;

      case "stop":
        if (!data.taskId) {
          ws.send(
            JSON.stringify({
              type: "error",
              from: "stop",
              message: "Task ID is required to stop.",
            })
          );
        } else {
          stopTask(data.taskId, ws);
        }
        break;

      case "view_details":
        if (!data.taskId) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Task ID is required to view details.",
            })
          );
        } else {
          sendTaskDetails(data.taskId, ws);
        }
        break;

      default:
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Unknown message type: " + data.type,
          })
        );
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");

    // Optional: stop all tasks owned by this ws
    for (const [id, task] of tasks.entries()) {
      if (task.ownerWs === ws) {
        if (task.interval) clearInterval(task.interval);
        tasks.delete(id);
      }
    }
  });
});

// ---------------- START SERVER ----------------

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
