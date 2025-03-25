import express from "express";
import { Server } from "socket.io";
import { createServer } from "http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const app = express();
const server = createServer(app);
const io = new Server(server);

const __dirname = dirname(fileURLToPath(import.meta.url));

app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "./index.html"));
});

let players = [];
let currentTurn = 0;

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Assign player (X or O)
  if (players.length < 2) {
    players.push(socket.id);
    socket.emit("playerAssignment", players.length === 1 ? "1" : "2");
    if (players.length === 2) {
      io.emit("gameStatus", "Game started! Player 1 turn.");
    }
  } else {
    socket.emit("gameStatus", "Game is full!");
    return;
  }

  socket.on("makeMove", (msg) => {
    if (players[currentTurn] === socket.id) {
      io.emit("makeMove", {
        index: msg.index,
        player: currentTurn === 0 ? "X" : "O",
      });
      currentTurn = 1 - currentTurn;
      io.emit("gameStatus", `Player ${currentTurn === 0 ? "1" : "2"}'s turn.`, socket.id);
    }
  });


  socket.on('requestReset', (playerId) => {
    // Validate reset request if needed
    io.emit('gameReset');  // Broadcast reset to all clients
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected:", socket.id);
    players = [];
    currentTurn = 0;
    io.emit("gameStatus", "A player disconnected. Waiting for players...");
    io.emit("resetBoard");
  });
});

server.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});
