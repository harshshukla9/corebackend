import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
dotenv.config();


const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"],
  },
});


app.use(
  cors({
    origin:"*", 
    methods: ["GET", "POST" ], 
    headers: ["Content-Type"],
    credentials: true, 
  })
);
app.options('*', cors())

app.use(express.json());
const Pieces = {
  Scout: {
    mv: 3,
    hp: 15,
    atk: 10,
    specialAbility: "Pathfinder"
  },
  Knight: {
    mv: 2,
    hp: 25,
    atk: 15,
    specialAbility: "Aggressor"
  },
  Tank: {
    mv: 1,
    hp: 40,
    atk: 10,
    specialAbility: "Fortified"
  },
  Mage: {
    mv: 2,
    hp: 20,
    atk: 15,
    specialAbility: "Ranged"
  },
  Healer: {
    mv: 2,
    hp: 30,
    atk: 5,
    heal: 15,
    specialAbility: "Medic"
  }
};

const initialGameState = {
  playerPiecesData: {
    1: {
      "Scout": { ...Pieces.Scout, index: -1 },
      "Knight": { ...Pieces.Knight, index: -1 },
      "Tank": { ...Pieces.Tank, index: -1 },
      "Mage": { ...Pieces.Mage, index: -1 },
      "Healer": { ...Pieces.Healer, index: -1 }
    },
    2: {
      "Scout": { ...Pieces.Scout, index: -1 },
      "Knight": { ...Pieces.Knight, index: -1 },
      "Tank": { ...Pieces.Tank, index: -1 },
      "Mage": { ...Pieces.Mage, index: -1 },
      "Healer": { ...Pieces.Healer, index: -1 }
    }
  },
  currentPlayer: 1,
  winner: 0,
  walletConnected1:null,
  walletConnected2:null
};

const cleanupRoom = (roomCode) => {
  if (rooms[roomCode]) {
    console.log(`Cleaning up room: ${roomCode}`);
    delete rooms[roomCode];
    io.to(roomCode).emit("roomClosed");
  }
};

const checkWin = (roomCode, room) => {
  const { playerPiecesData } = room.gameState;

  for (const piece of Object.values(playerPiecesData[1])) {
    if (piece.index === 1) {
      room.gameState.winner = 1;
      console.log("Player 1 wins!");
      const register = (room.gameState.walletConnected1!=null && room.gameState.walletConnected2!=null) ? room.gameState.walletConnected1 : null; 

      io.to(roomCode).emit("gameWon", {
      registerWin: register,
        winner: room.gameState.winner,
        playerPiecesData: room.gameState.playerPiecesData,
      });
      setTimeout(() => cleanupRoom(roomCode), 30000);
      return;
    }
  }

  for (const piece of Object.values(playerPiecesData[2])) {
    if (piece.index === 18) {
      room.gameState.winner = 2;
      console.log("Player 2 wins!");
      const register = (room.gameState.walletConnected1!=null && room.gameState.walletConnected2!=null) ? room.gameState.walletConnected2 : null; 
      io.to(roomCode).emit("gameWon", {
      registerWin: register,
        winner: room.gameState.winner,
        playerPiecesData: room.gameState.playerPiecesData,
      });
      setTimeout(() => cleanupRoom(roomCode), 30000);
      return;
    }
  }
};
const rooms = {};

app.post("/create-room", (req, res) => {
  const roomCode = uuidv4().slice(0, 6);
  rooms[roomCode] = {
    players: [],
    gameState: { ...initialGameState },
  };
  res.json({ roomCode });
});

app.post("/join-room", (req, res) => {
  const { roomCode } = req.body;

  if (!rooms[roomCode]) {
    return res.status(404).json({ error: "Room not found" });
  }

  if (rooms[roomCode].players.length >= 2) {
    return res.status(400).json({ error: "Room is full" });
  }

  res.json({ success: true });
});

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  let currentRoom = null;

  socket.on("joinRoom", ({ roomCode, walletConnected }) => {
    if (!rooms[roomCode]) {
      socket.emit("error", "Room not found");
      return;
    }
  
    if (rooms[roomCode].players.length >= 2) {
      socket.emit("error", "Room is full");
      return;
    }

    const room = rooms[roomCode];
    currentRoom = roomCode;
    const playerNumber = room.players.length + 1;
    if(walletConnected!==null){
      if (playerNumber === 1) {
        room.gameState.walletConnected1 = walletConnected;
      } else if (playerNumber === 2) {
        room.gameState.walletConnected2 = walletConnected;
      }
    }
    room.players.push({ id: socket.id, playerNumber });
    socket.join(roomCode);
    
    socket.emit("assignPlayer", playerNumber);
    
    if (room.players.length === 2) {
      io.to(roomCode).emit("startGame", { gameState: room.gameState });
      console.log("Game started for room:", roomCode);
    }
  });
    
  socket.on("playerMove", (data) => {  
    if (!currentRoom) {
      console.error("Error: No room assigned for this player.");
      socket.emit("error", "You are not part of a room.");
      return;
    }
  
    const room = rooms[currentRoom];
    if (!room) {
      console.error(`Error: Room ${currentRoom} not found.`);
      socket.emit("error", "Room not found.");
      return;
    }
  
    const currentPlayer = room.gameState.currentPlayer;
    const player = room.players.find((p) => p.id === socket.id);
  
    if (!player) {
      console.error(`Error: Player ${socket.id} not found in room ${currentRoom}.`);
      socket.emit("error", "Player not found.");
      return;
    }
  
    if (player.playerNumber !== currentPlayer) {
      console.error(`Invalid move: Not Player ${player.playerNumber}'s turn.`);
      socket.emit("invalidMove", "It's not your turn.");
      return;
    }
  
    room.gameState.playerPiecesData = { ...data.playerPiecesData };
    
    checkWin(currentRoom, room);

    if (!room.gameState.winner) {
      room.gameState.currentPlayer = currentPlayer === 1 ? 2 : 1;
      io.to(currentRoom).emit("updateGameState", room.gameState);
    }
  });


  socket.on("forfeit", (data) => {  
    if (!currentRoom) {
      console.error("Error: No room assigned for this player.");
      socket.emit("error", "You are not part of a room.");
      return;
    }
    const room = rooms[currentRoom];
    if (!room) {
      console.error(`Error: Room ${currentRoom} not found.`);
      socket.emit("error", "Room not found.");
      return;
    }

    const player = room.players.find((p) => p.id === socket.id);
  
    if (!player) {
      console.error(`Error: Player ${socket.id} not found in room ${currentRoom}.`);
      socket.emit("error", "Player not found.");
      return;
    }
    
    const wonBy = data.playerNumber===1 ? 2 : 1;
    const register = ( room.gameState.walletConnected1!=null &&  room.gameState.walletConnected2!=null) ? (wonBy===1?  room.gameState.walletConnected1 :  room.gameState.walletConnected2) : null; 
    io.to(currentRoom).emit("gameWon", {
      registerWin: register,
      winner: wonBy,
      playerPiecesData: room.gameState.playerPiecesData,
    });
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected:", socket.id);

    if (currentRoom && rooms[currentRoom]) {
      const room = rooms[currentRoom];

      room.players = room.players.filter((p) => p.id !== socket.id);

      if (room.players.length < 2) {
        io.to(currentRoom).emit("resetGame");
        setTimeout(() => cleanupRoom(currentRoom), 30000); // 30 seconds
      }
    }
  });
});

app.get('/', (req, res) => {
  res.send('Welcome to Adventurers Arena API');
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
