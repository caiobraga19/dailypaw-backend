import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Fix for ES Modules __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

import express from "express";
import cors from "cors";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { analyzeFoodFromPhoto, analyzeProactiveHealth } from "./scannerTool.js";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const mcpServer = new Server({ name: "dailypaw-scanner", version: "1.0.0" }, { capabilities: { tools: {} } });

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{
        name: "analyze_food_from_photo",
        description: "Nutritional analysis of pet food from a photo.",
        inputSchema: {
            type: "object",
            properties: {
                base64Image: { type: "string" },
                petData: { type: "object" }
            },
            required: ["base64Image"]
        }
    }]
}));

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "analyze_food_from_photo") {
        const { base64Image, petData } = request.params.arguments;
        const result = await analyzeFoodFromPhoto(base64Image, "image/jpeg", petData);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    throw new Error("Tool not found");
});

const app = express();
app.use(cors());

// STRIPE WEBHOOK: Must be defined BEFORE express.json() to capture the raw body
app.post("/api/webhook", express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error(`Webhook Signature Verification Failed: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // 🛡️ STRIPE WEBHOOK: Clinical Grade Event Handling
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const userId = session.client_reference_id;
        const sessionId = session.id;

        console.log(`[STRIPE] 📥 Received checkout.session.completed | Session: ${sessionId}`);

        if (userId) {
            console.log(`[STRIPE] 🎯 Identification Match: user_id=${userId}. Initializing upgrade...`);

            const { error } = await supabaseAdmin
                .from('profiles')
                .update({ is_premium: true })
                .eq('id', userId);

            if (error) {
                console.error(`[STRIPE] ❌ Database Failure: ${error.message}`);
            } else {
                console.log(`[STRIPE] ✅ Success: user_id=${userId} is now DAILYPAW PREMIUM.`);
            }
        } else {
            console.warn(`[STRIPE] ⚠️ Identification Skip: No client_reference_id found in session ${sessionId}`);
        }
    }

    res.json({ received: true });
});

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// Ensure /signup route serves index.html for the auth flow
app.get("/signup", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});


// --- BACKEND GATING UTILITY ---
async function checkBackendLimit(userId, feature) {
    if (!userId) return { allowed: false, error: "Identification failed" };

    // 1. Get Profile
    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('is_premium')
        .eq('id', userId)
        .single();

    if (profile?.is_premium) return { allowed: true };

    // 2. Check Daily Limit (1/day for Free)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tableMap = {
        'CHAT': 'chat_logs',
        'SCAN': 'food_scans'
    };

    const table = tableMap[feature];
    if (!table) return { allowed: true };

    let query = supabaseAdmin
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', today.toISOString());

    if (feature === 'CHAT') {
        query = query.eq('role', 'user');
    }

    const { count } = await query;

    // 🛡️ CORREÇÃO CIRÚRGICA:
    // Como o frontend salva a 1ª mensagem ANTES de chamar a API, o count já será 1.
    // Então, para o CHAT, o limite real é bloquear apenas se for MAIOR que 1.
    if (feature === 'CHAT' && count > 1) {
        return { allowed: false, error: "Daily limit reached for Free Tier. Upgrade to AI+ for unlimited access." };
    } else if (feature === 'SCAN' && count >= 1) {
        return { allowed: false, error: "Daily limit reached for Free Tier. Upgrade to AI+ for unlimited access." };
    }

    return { allowed: true };
}



let transport;
app.get("/sse", async (req, res) => {
    transport = new SSEServerTransport("/messages", res);
    await mcpServer.connect(transport);
});
app.post("/messages", async (req, res) => {
    if (transport) await transport.handlePostMessage(req, res);
});

let isBusy = false;

app.post("/api/analyze", async (req, res) => {
    if (isBusy) return res.status(503).json({ error: "BUSY" });

    const { userId, image, mimeType, petData } = req.body;
    const limitCheck = await checkBackendLimit(userId, 'SCAN');
    if (!limitCheck.allowed) {
        return res.status(403).json({ error: limitCheck.error });
    }

    isBusy = true;
    try {
        const result = await analyzeFoodFromPhoto(image, mimeType || "image/jpeg", petData);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        isBusy = false;
    }
});

app.post("/api/chat", async (req, res) => {
    if (isBusy) return res.status(503).json({ error: "BUSY" });

    const { message, context, history, userId } = req.body;
    const limitCheck = await checkBackendLimit(userId, 'CHAT');
    if (!limitCheck.allowed) {
        return res.status(403).json({ error: limitCheck.error });
    }

    isBusy = true;
    try {
        console.log(`DEBUG: Chat message received: "${message}"`);
        // Enhanced prompt for Gemini 2.5 Intelligence
        const prompt = `You are the DailyPaw Veterinary AI Assistant, a Clinical Expert.
Context: ${context || "DailyPaw Assistant"}.
User message: ${message}
Conversation History: ${JSON.stringify(history || [])}

Instructions:
1. Always use Kilograms (kg) for weight. NEVER use lbs.
2. Maintain a professional, empathetic, and concise veterinary persona.
3. Use minimal markdown. Do NOT use excessive asterisks. Avoid bolding everything.
4. If a health emergency is mentioned, prioritize immediate veterinary advice.`;

        const result = await analyzeProactiveHealth(prompt);
        console.log(`DEBUG: AI Response received.`);
        res.json({ reply: result.insight || result.text || "I'm processing your request. Please wait a moment." });
    } catch (e) {
        console.error("DEBUG: Chat Endpoint Error:", e);
        res.status(500).json({ error: e.message });
    } finally {
        isBusy = false;
    }
});

app.post("/api/generate-weekly-report", async (req, res) => {
    try {
        const { userId, petContext, logs, scans, chatHistory } = req.body;

        // 1. Identify User Tier
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('is_premium')
            .eq('id', userId)
            .single();

        const isPremium = profile?.is_premium || false;

        // 2. Build Tiered Prompt
        let prompt = "";
        if (isPremium) {
            prompt = `You are a Board-Certified Veterinary Clinical Chief. Generate a Comprehensive Professional Weekly Health Synthesis for ${petContext.name}.
Pet Profile: ${JSON.stringify(petContext)}
Daily Logs (7 days): ${JSON.stringify(logs)}
Food Scanner Data (Photos): ${JSON.stringify(scans)}
Recent Chat Context: ${JSON.stringify(chatHistory)}

Requirements:
1. Write a detailed, comprehensive report containing at least 3 distinct paragraphs.
2. Paragraph 1 - Clinical Telemetry & Vitals: Analyze energy, appetite, and mood trends. Use professional clinical jargon (e.g., lethargy, anorexia, behavioral baseline, vital stability).
3. Paragraph 2 - Nutritional & Dietary Analysis: Deeply analyze the food scanner data. Correlate macro-nutrients and dietary patterns with the pet's breed (${petContext.breed}), age (${petContext.age}), and weight (${petContext.weight} kg). Always use KG.
4. Paragraph 3 - Behavioral Insights & Proactive Recommendations: Based on the chat history and logs, provide advanced proactive care instructions, potential risk factors to watch, and psychological/behavioral synthesis.
5. Maintain a highly professional, authoritative, yet empathetic tone. Format cleanly without excessive bolding or markdown. Write in English or the user's native language if evident.`;
        } else {
            prompt = `You are a casual pet assistant. Write a VERY SHORT summary (max 2 sentences) for ${petContext.name} based on these recent logs: ${JSON.stringify(logs)}.
            
        CRITICAL RULES:
        1. Acknowledge the actual metrics (e.g., if Energy is Low, suggest rest).
        2. DO NOT use technical medical terms.
        3. DO NOT include any "Upgrade" or "AI+" call to action in the text itself.
        4. Keep it friendly and concise.`;
        }

        const result = await Promise.race([
            analyzeProactiveHealth(prompt),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 60000))
        ]);

        res.json({
            summary: result.insight || result.text || "Status: Logged. System sync in progress.",
            isPremiumTier: isPremium
        });
    } catch (e) {
        console.error("Weekly Report Error:", e);
        res.json({ summary: "Clinical Status: Stable. Update your logs to see more." });
    }
});

// A PORTA DINÂMICA DA NUVEM FICA AQUI 👇
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 DailyPaw Backend online at port ${PORT}`);
});