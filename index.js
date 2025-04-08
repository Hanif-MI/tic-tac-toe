import dotenv from "dotenv";
dotenv.config();
import express from "express";
import { Server } from "socket.io";
import { createServer } from "http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { v4 as uuidv4 } from "uuid"; // Add uuid for unique game IDs
import { gameTypes, checkDraw, checkWin } from "./src/utility/constant.js";
import { getNextMove } from "./src/services/gemini.service.js";
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
const games = new Map(); // gameId -> { players: [socketId1, socketId2], board[], turn }
const randomPlayer = [];

const getPlayerSymbol = (socketId, game) => {
  return game.players[0] === socketId ? "X" : "O";
};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("createGame", (gameType) => {
    const gameId = uuidv4(); // Generate unique game ID
    const type = Object.values(gameTypes).includes(gameType)
      ? gameType
      : gameTypes.PLAYER_VS_PLAYER;
    console.log("Game type:", type);
    games.set(gameId, {
      players: [socket.id],
      board: Array(9).fill(null),
      turn: "X",
      type: type,
    });

    socket.join(gameId);
    if (type === gameTypes.COMPUTER) {
      socket.emit("joinGame1", gameId);
    } else {
      socket.emit("gameCreated", {
        gameId,
        link: `${process.env.appurl}/game/${gameId}?type=${type}`,
      });
    }
  });

  socket.on("joinRandomGame", () => {
    if (randomPlayer.length > 0) {
      const gameId = randomPlayer.pop();
      const game = games.get(gameId);
      if (game) {
        game.players.push(socket.id);
        socket.join(gameId);
        const roomSockets = io.sockets.adapter.rooms.get(gameId);
        roomSockets.forEach((socketId) => {
          const symbol = getPlayerSymbol(socketId, game);
          io.to(socketId).emit("playerAssignment", { player: symbol });
        });
        socket.emit("joinGame1", gameId);
        io.to(gameId).emit("gameStatus", {
          message: `Game started! "${game.turn}" turn.`,
          turn: game.turn,
        });
      } else {
        socket.emit("gameStatus", { message: "Invalid game ID!" });
      }
    } else {
      const gameId = uuidv4(); // Generate unique game ID
      games.set(gameId, {
        players: [socket.id],
        board: Array(9).fill(null),
        turn: "X",
        type: gameTypes.RANDOM,
      });
      socket.join(gameId);
      randomPlayer.push(gameId);
      socket.emit("randomJoinGame", gameId);
      socket.emit("gameStatus", {
        message: "Waiting for another player to join...",
      });
    }
  });

  socket.on("joinGame", (gameId) => {
    console.log("Game created with ID:", gameId);

    const game = games.get(gameId);
    if (!game) {
      socket.emit("gameStatus", { message: "Invalid game ID!" });
      return;
    }

    if (game.type === gameTypes.COMPUTER) {
      // if (game.players.length == 1) {
      //   socket.emit("gameStatus", { message: "Game is full!" });
      //   return;
      // }
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
    } else {
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
    }
  });

  socket.on("makeMove", async ({ gameId, index }) => {
    const game = games.get(gameId);
    console.log("Game ID:", gameId);
    console.log("Games :", games);
    console.log("Game :", game);
    console.log("gameId :", gameId);
    if (game.type === gameTypes.COMPUTER) {
      console.log("Computer move");

      const playerSymbol = getPlayerSymbol(socket.id, game);
      if (game.board[index] !== null) return;

      game.board[index] = playerSymbol;
      io.to(gameId).emit("updateBoard", { index, player: playerSymbol });

      let robotM = [];
      let opponentMove = [];
      game.board.forEach((cell, index) => {
        if (cell != null) {
          if (cell === "X") {
            opponentMove.push(index);
          } else {
            robotM.push(index);
          }
        }
      });
      console.log("board", robotM, opponentMove);
      
      let winResult = checkWin(game.board);
      
      if (!winResult && robotM.length + opponentMove.length < 9) {
        try {
          const response = await getNextMove(opponentMove, robotM);
          console.log("AI response:", response.text);
  
          const robotMove = Number(response.text);
          const robotSymbol = playerSymbol === "X" ? "O" : "X";
  
          game.board[robotMove] = robotSymbol;
          io.to(gameId).emit("updateBoard", {
            index: Number(response.text),
            player: robotSymbol,
          });
          game.turn = playerSymbol;
          winResult = checkWin(game.board);
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
        } catch (error) {
          console.error("Error:", error.message);
        } 
      }
    } else {
      if (!game || game.players.length < 2) return;
      const playerSymbol = getPlayerSymbol(socket.id, game);
      if (playerSymbol !== game.turn || game.board[index] !== null) return;

      game.board[index] = playerSymbol;
      io.to(gameId).emit("updateBoard", { index, player: playerSymbol });
      game.turn = game.turn === "X" ? "O" : "X";
    }

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
      io.to(gameId).emit("gameStatus", {
        message: "It's a draw!",
        turn: null,
      });
      return;
    }
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
        randomPlayer.pop(gameId);
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
