import dotenv from "dotenv";
dotenv.config();
import { GoogleGenAI } from "@google/genai";

// Load the API key from environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

console.log("GEMINI_API_KEY:", GEMINI_API_KEY);

// Initialize the AI client with the API key
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export async function getNextMove(opponentMove, robotM) {   
  try {
    const prompt =
      robotM === null
        ? `Hey expert, I need your help. I have a game of tic-tac-toe, and the selected index of my opponent is ${opponentMove}. Which index should I select next? Just return the number, no text or explanation.`
        : `
             You are a tic-tac-toe strategist with expert-level tactics. Consider the game board as a 3x3 grid with positions indexed from 0 to 8. The opponent’s last move is represented by ${opponentMove} and my last move is represented by ${robotM}. Your task is to choose the next move based on the following criteria:

            1. **Winning Move:** If you have a move that will win the game immediately, select that move.
            2. **Blocking:** If the opponent is one move away from winning, choose the move that blocks their win.
            3. **Strategy:** Otherwise, choose the move that maximizes your chances of winning by setting up a future win or creating a fork.
            4. **Outcome Awareness:** If your move results in a win, ensure the appropriate game file action is triggered. If the opponent wins, adjust your strategy to make the game more challenging, rather than playing automatically without strategy.

            Output only the index (a number from 0 to 8) of your chosen move, with no additional text or explanation.
            `;

    console.log("Prompt:", prompt);
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-001",
      contents: prompt,
    });

    return response; // Return the response from the AI
  } catch (error) {
    console.error("Error generating next move:", error);
    throw error; // Re-throw the error for the caller to handle
  }
}
