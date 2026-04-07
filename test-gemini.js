import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(import.meta.dirname, ".env") });
import { GoogleGenerativeAI } from "@google/generative-ai";

async function run() {
  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    console.error("❌ GEMINI_API_KEY not found in .env file.");
    process.exit(1);
  }

  const genAI = new GoogleGenerativeAI(API_KEY);
  
  // Trying another model from the successful listing
  const modelName = "gemini-2.5-flash";
  
  try {
    console.log(`\nTesting Gemini API with model: "${modelName}"...`);
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent("Hello! Response with your name.");
    const response = await result.response;
    const text = response.text();
    console.log(`✅ Success! Response:`, text);
  } catch (error) {
    console.error(`❌ Error with ${modelName}:`, error.message);
  }
}

run();
