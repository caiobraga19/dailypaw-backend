import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(import.meta.dirname, ".env") });

import { GoogleGenerativeAI } from "@google/generative-ai";

// ============================================================
// SINGLETON: Initialize API key and model ONCE at module load
// ============================================================
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("FATAL: GEMINI_API_KEY is missing from environment.");
}
const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;
const geminiModel = genAI ? genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" }) : null;
// Removed fallback to ensure scanner stability as per user request

console.log("Gemini Model initialized:", !!geminiModel, "| Key prefix:", API_KEY ? API_KEY.substring(0, 5) : "NONE");

/**
 * Helper to clean Base64 image data by stripping Data URI prefixes
 */
function cleanBase64(base64String) {
  if (typeof base64String !== 'string') return '';
  return base64String.replace(/^data:image\/\w+;base64,/, "");
}

/**
 * Analyzes a food photo using Gemini 2.5 Flash with Fallback to 2.0 Pro
 * Improved for multimodal stability and 400 error prevention.
 */
export async function analyzeFoodFromPhoto(base64Image, mimeType = "image/jpeg", petData = {}, userProvidedDetails = "") {
  try {
    if (!geminiModel) throw new Error("GEMINI_API_KEY is missing from environment.");

    // Pet Data Logic
    const species = petData.species || 'adult dog';
    const breed = petData.breed || 'medium breed';
    const weight = petData.weight || '20';
    const context = userProvidedDetails ? `\nUser additional context: "${userProvidedDetails}"` : '';

    const prompt = `You are a Board-Certified Veterinary Clinical Nutritionist (DACVN). Analyze the food visible in this photo for a pet with the following profile: ${weight}kg ${breed} (${species}).${context}

IMPORTANT: 
1. Use ONLY Kilograms (kg) for weight. NEVER use lbs or pounds.
2. Maintain a professional veterinary tone.
3. Be concise and avoid excessive markdown formatting (limit the use of asterisks).

Return ONLY valid JSON (no markdown fences, no extra text) matching this EXACT structure. All text values MUST be in English:
{
  "food_analysis": {
    "identified_food_type": "Name of the food identified",
    "verified_details": "Brief description of what you see in the image"
  },
  "macros_estimated": {
    "estimated_metabolizable_energy_kcal": "estimated kcal per typical serving",
    "protein_percent": "estimated protein %",
    "fat_percent": "estimated fat %"
  },
  "nutritional_suitability_for_this_pet": {
    "status": "SAFE or CAUTION or RISKY or TOXIC",
    "badge_text": "short 2-3 word safety badge e.g. Safe to Eat or Highly Toxic",
    "personalized_veterinary_summary": "2-3 sentence professional nutritional assessment specific to this ${breed} weighing ${weight}kg. Include breed-specific risks if any. Respond in English using ONLY kg for weight reference."
  }
}`;

    // Retry logic for Gemini rate limits (429)
    const MAX_RETRIES = 3;
    let lastError = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const delay = (attempt * 3000) + Math.random() * 1000; // 3s, 6s, 9s + jitter
          console.log(`Retry attempt ${attempt}/${MAX_RETRIES} after ${Math.round(delay)}ms...`);
          await new Promise(r => setTimeout(r, delay));
        }

        const cleanedData = cleanBase64(base64Image);
        
        // Audit: Using the multimodal 'parts' structure for v1beta stability
        const promptParts = [
          { text: prompt },
          { inlineData: { mimeType: mimeType, data: cleanedData } }
        ];

        console.log(`[MODEL] Attempting analysis with Gemini 2.5 Flash...`);
        
        const result = await geminiModel.generateContent(promptParts);

        const response = await result.response;
        let text = response.text();

        // Robust cleaning: strip markdown code fences and extract JSON object
        text = text.replace(/```json/gi, "").replace(/```/gi, "").trim();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          text = jsonMatch[0];
        }

        const parsed = JSON.parse(text);

        // Defensive validation: ensure expected structure exists
        if (!parsed.food_analysis || !parsed.macros_estimated || !parsed.nutritional_suitability_for_this_pet) {
          console.warn("Gemini returned unexpected structure, wrapping...");
          return {
            food_analysis: {
              identified_food_type: parsed.identified_food_type || "Unknown Food",
              verified_details: parsed.nutritional_analysis || "Analysis unavailable"
            },
            macros_estimated: {
              estimated_metabolizable_energy_kcal: "N/A",
              protein_percent: "N/A",
              fat_percent: "N/A"
            },
            nutritional_suitability_for_this_pet: {
              status: parsed.safety_rating || "CAUTION",
              badge_text: parsed.safety_rating || "Unknown",
              personalized_veterinary_summary: parsed.nutritional_analysis || "Unable to generate detailed analysis."
            }
          };
        }

        return parsed;
      } catch (err) {
        lastError = err;
        const is429 = err.message?.includes('429') || err.message?.includes('Too Many Requests') || err.message?.includes('RESOURCE_EXHAUSTED');
        if (is429 && attempt < MAX_RETRIES) {
          console.warn(`Rate limited by Gemini (429). Will retry...`);
          continue;
        }
        // If it's a 429 and retries exhausted, bubble up with a marker
        if (is429) {
          const rateLimitError = new Error("RATE_LIMIT: Too Many Requests");
          rateLimitError.statusCode = 429;
          throw rateLimitError;
        }
        // Non-429 errors: don't retry
        break;
      }
    }

    // Fallback: non-429 error after loop
    console.error("Gemini API Error details:", lastError);
    return {
      food_analysis: { identified_food_type: "Error", verified_details: lastError?.message || "Unknown error" },
      macros_estimated: { estimated_metabolizable_energy_kcal: "N/A", protein_percent: "N/A", fat_percent: "N/A" },
      nutritional_suitability_for_this_pet: { status: "CAUTION", badge_text: "Error", personalized_veterinary_summary: "Analysis failed: " + (lastError?.message || "Unknown error") }
    };
  } catch (error) {
    // Re-throw 429s so Express can set the proper status code
    if (error.statusCode === 429) throw error;

    console.error("Gemini API Error details:", error);
    return {
      food_analysis: { identified_food_type: "Error", verified_details: error.message },
      macros_estimated: { estimated_metabolizable_energy_kcal: "N/A", protein_percent: "N/A", fat_percent: "N/A" },
      nutritional_suitability_for_this_pet: { status: "CAUTION", badge_text: "Error", personalized_veterinary_summary: "Analysis failed: " + error.message }
    };
  }
}

/**
 * Generates proactive health insights using Gemini (with retry for 429)
 * Currently DISABLED from frontend auto-calls — only manual trigger
 */
export async function analyzeProactiveHealth(prompt, petData = {}) {
  try {
    if (!geminiModel) throw new Error("GEMINI_API_KEY is missing.");

    const MAX_RETRIES = 1;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise(r => setTimeout(r, 2000));
        }
        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        return { insight: response.text() };
      } catch (err) {
        const is429 = err.message?.includes('429') || err.message?.includes('Too Many Requests');
        if (is429 && attempt < MAX_RETRIES) continue;
        throw err;
      }
    }
  } catch (error) {
    console.error("Proactive AI Error:", error);
    return { error: error.message };
  }
}
