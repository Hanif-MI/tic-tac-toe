// Game types
export const gameTypes = {
  PLAYER_VS_PLAYER: "player_vs_player",
  COMPUTER: "computer",
  RANDOM: "random",
};

export const winningCombinations = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export const checkWin = (board) => {
  for (const combination of winningCombinations) {
    const [a, b, c] = combination;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], combination };
    }
  }
  return null;
};

export const checkDraw = (board) => board.every((cell) => cell !== null);
