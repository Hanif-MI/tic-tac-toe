import dotenv from "dotenv";
dotenv.config();
import express from "express";
import { Server } from "socket.io";
import { createServer } from "http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { v4 as uuidv4 } from "uuid"; // Add uuid for unique game IDs
import ip from "ip"; // Add ip for local IP address
const app = express();
const server = createServer(app);
const io = new Server(server);

const __dirname = dirname(fileURLToPath(import.meta.url));

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});

app.get("/game/:gameId", (req, res) => {
  res.sendFile(join(__dirname, "index.html")); // Serve the same HTML with gameId in URL
});

// Store game instances
const games = new Map(); // gameId -> { players: [socketId1, socketId2], board, turn }

const winningCombinations = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const getPlayerSymbol = (socketId, game) => {
  return game.players[0] === socketId ? "X" : "O";
};

const checkWin = (board) => {
  for (const combination of winningCombinations) {
    const [a, b, c] = combination;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], combination };
    }
  }
  return null;
};

const checkDraw = (board) => board.every((cell) => cell !== null);

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);
  const myIp = ip.address();
  console.log(myIp);

  socket.on("createGame", () => {
    const gameId = uuidv4(); // Generate unique game ID
    games.set(gameId, {
      players: [socket.id],
      board: Array(9).fill(null),
      turn: "X",
    });
    socket.join(gameId);
    socket.emit("gameCreated", {
      gameId,
      link: `${process.env.appurl}/game/${gameId}`,
    });
  });

  socket.on("joinGame", (gameId) => {
    const game = games.get(gameId);
    if (!game) {
      socket.emit("gameStatus", { message: "Invalid game ID!" });
      return;
    }
    if (game.players.length >= 2) {
      socket.emit("gameStatus", { message: "Game is full!" });
      return;
    }
    game.players.push(socket.id);
    socket.join(gameId);

    // Assign symbols and start game
    const roomSockets = io.sockets.adapter.rooms.get(gameId);
    roomSockets.forEach((socketId) => {
      const symbol = getPlayerSymbol(socketId, game);
      io.to(socketId).emit("playerAssignment", { player: symbol });
    });
    io.to(gameId).emit("gameStatus", {
      message: `Game started! "${game.turn}" turn.`,
      turn: game.turn,
    });
  });

  socket.on("makeMove", ({ gameId, index }) => {
    const game = games.get(gameId);
    if (!game || game.players.length < 2) return;
    const playerSymbol = getPlayerSymbol(socket.id, game);
    if (playerSymbol !== game.turn || game.board[index] !== null) return;

    game.board[index] = playerSymbol;
    io.to(gameId).emit("updateBoard", { index, player: playerSymbol });

    const winResult = checkWin(game.board);
    if (winResult) {
      io.to(gameId).emit("gameStatus", {
        message: `${winResult.winner} wins!`,
        turn: null,
      });
      io.to(gameId).emit("gameOver", {
        winningCombination: winResult.combination,
      });
      return;
    }

    if (checkDraw(game.board)) {
      io.to(gameId).emit("gameStatus", { message: "It's a draw!", turn: null });
      return;
    }

    game.turn = game.turn === "X" ? "O" : "X";
    io.to(gameId).emit("gameStatus", {
      message: `Player "${game.turn}" turn.`,
      turn: game.turn,
    });
  });

  socket.on("resetGame", (gameId) => {
    const game = games.get(gameId);
    if (game) {
      game.board.fill(null);
      game.turn = "X";
      io.to(gameId).emit("gameReset");
      io.to(gameId).emit("gameStatus", {
        message: `Game reset! "${game.turn}" turn.`,
        turn: game.turn,
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    for (const [gameId, game] of games) {
      if (game.players.includes(socket.id)) {
        games.delete(gameId);
        io.to(gameId).emit("gameStatus", {
          message: "A player disconnected. Game ended.",
          turn: null,
        });
        io.to(gameId).emit("gameReset");
        break;
      }
    }
  });

  socket.on("sendMessage", ({ gameId, message }) => {
    console.log(message);
    if (games.get(gameId).players.includes(socket.id)) {
      io.to(gameId).emit("receiveMessage", {
        message,
        player: getPlayerSymbol(socket.id, games.get(gameId)),
      });
    } else {
      io.to(gameId).emit("receiveMessage", { message, player: "Spectator" });
    }
  });
});

server.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});
