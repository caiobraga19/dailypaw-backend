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

// --- ROTA PARA CRIAR O PAGAMENTO (CHECKOUT) ---
app.post("/api/create-checkout-session", async (req, res) => {
    const { userId } = req.body;
    const FRONTEND_URL = process.env.FRONTEND_URL || 'https://dailypaw.vercel.app';

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            client_reference_id: userId,
            line_items: [{
                price: 'price_1THxUOCmBAQHtARwas7vSeks',
                quantity: 1,
            }],
            mode: 'subscription',
            success_url: `${FRONTEND_URL}/onboarding.html?upgrade=success`,
            cancel_url: `${FRONTEND_URL}/dashboard`,
        });

        res.json({ url: session.url });
    } catch (err) {
        console.error("Stripe Checkout Error:", err.message);
        res.status(500).json({ error: "Erro interno: " + err.message });
    }
});

app.get("/signup", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// --- PREMIUM-ONLY ACCESS ENFORCEMENT ---
async function enforcePremiumAccess(userId) {
    if (!userId) return { allowed: false, error: "Identification failed." };
    const { data: profile } = await supabaseAdmin.from('profiles').select('is_premium').eq('id', userId).single();
    if (profile?.is_premium === true) return { allowed: true };
    return { allowed: false, error: "Access Denied: Active subscription required." };
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
    const limitCheck = await enforcePremiumAccess(userId);
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
    const limitCheck = await enforcePremiumAccess(userId);
    if (!limitCheck.allowed) {
        return res.status(403).json({ error: limitCheck.error });
    }

    isBusy = true;
    try {
        console.log(`DEBUG: Chat message received: "${message}"`);
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
        const { userId, petContext } = req.body;

        const limitCheck = await enforcePremiumAccess(userId);
        if (!limitCheck.allowed) return res.status(403).json({ error: limitCheck.error });

        // Define a janela de tempo de 7 dias
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const isoDate = sevenDaysAgo.toISOString();

        // 1. OMNI-CHANNEL HARVESTING: Puxando TODAS as interações do usuário de uma vez
        const [logsRes, chatRes, scansRes, remindersRes] = await Promise.all([
            supabaseAdmin.from('daily_logs').select('energy, appetite, mood, created_at').eq('pet_id', petContext.id).gte('created_at', isoDate).order('created_at', { ascending: false }),
            supabaseAdmin.from('chat_logs').select('role, message, created_at').eq('pet_id', petContext.id).gte('created_at', isoDate).order('created_at', { ascending: false }).limit(20),
            supabaseAdmin.from('food_scans').select('detected_food, safety_status, created_at').eq('pet_id', petContext.id).gte('created_at', isoDate).order('created_at', { ascending: false }),
            supabaseAdmin.from('reminders').select('title, type, date').eq('pet_id', petContext.id).gte('created_at', isoDate)
        ]);

        const recentLogs = logsRes.data || [];
        const chatLogs = chatRes.data || [];
        const recentScans = scansRes.data || [];
        const recentReminders = remindersRes.data || [];

        // 2. REGRA DO COLD START GLOBAL
        const isColdStart = recentLogs.length === 0 && chatLogs.length === 0 && recentScans.length === 0;
        let reportText = "";

        if (isColdStart) {
            reportText = `The profile for ${petContext.name} was recently created. The Clinical AI is currently monitoring physiological parameters and awaiting further daily logs, food scans, and chat interactions to establish a comprehensive baseline report.`;
        } else {
            // 3. PROMPT DE SÍNTESE HOLÍSTICA (O "Médico Chefe")
            const systemPrompt = `You are an elite Veterinary AI Chief Medical Officer. Generate a comprehensive but concise 1-paragraph clinical status report for a ${petContext.age}-year-old ${petContext.breed} named ${petContext.name}.

STRICT RULES:
1. HOLISTIC ANALYSIS: Synthesize ALL provided data (Tracking, Chats, Food Scans, and Reminders). Connect the dots between diet and behavior.
2. CHRONOLOGICAL AWARENESS: Recognize resolutions. If a health scare was reported but later resolved, state the pet is currently stable.
3. NO MARKDOWN: Output 100% plain text. Absolutely NO asterisks (**), hashtags (#), or bolding.
4. TONE: Professional, reassuring, and analytical.
5. NO PRECISE TIMESTAMPS: You are strictly forbidden from including specific hours, minutes, or seconds. Do not write things like "00:35:56". Use natural time references like "today", "yesterday", "early this morning", or simply the date like "April 14".

--- PATIENT CHART (LAST 7 DAYS) ---
Daily Health Tracking: ${JSON.stringify(recentLogs.length > 0 ? recentLogs : 'No daily tracking data')}
AI Chat Interactions: ${JSON.stringify(chatLogs.length > 0 ? chatLogs : 'No chat interactions')}
Food & Nutrition Scans: ${JSON.stringify(recentScans.length > 0 ? recentScans : 'No food scanned')}
Medical/Care Reminders: ${JSON.stringify(recentReminders.length > 0 ? recentReminders : 'No reminders set')}
`;

            // 4. CHAMADA DA IA
            const result = await Promise.race([
                analyzeProactiveHealth(`${systemPrompt}\n\nRemember: 1 plain text paragraph synthesizing EVERYTHING. NO MARKDOWN.`),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 60000))
            ]);

            reportText = result.insight || result.text || "Patient data processed successfully.";

            // Sanitização brutal para garantir a UI limpa
            reportText = reportText.replace(/\*/g, '');
        }

        res.json({ summary: reportText, isPremiumTier: true });
    } catch (e) {
        console.error("Weekly Report Error:", e);
        res.json({ summary: "Status: Baseline evaluation recorded. Awaiting more data to synthesize a full report." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 DailyPaw Backend online at port ${PORT}`);
});