import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listModels() {
    try {
        const models = await genAI.listModels();
        console.log("AVAILABLE MODELS:");
        models.models.forEach(m => {
            console.log(`- ${m.name}`);
        });
    } catch (e) {
        console.error("Error listing models:", e);
    }
}

listModels();
