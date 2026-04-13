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
    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            client_reference_id: userId,
            line_items: [{
                price: 'ID_DO_SEU_PRECO_AQUI',
                quantity: 1,
            }],
            mode: 'subscription',
            success_url: `${FRONTEND_URL}/onboarding.html?upgrade=success`,
            cancel_url: `${FRONTEND_URL}/dashboard`,
        });

        res.json({ url: session.url });
    } catch (e) {
        res.status(500).json({ error: e.message });
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
        const { userId, petContext, logs, scans, chatHistory } = req.body;

        const limitCheck = await enforcePremiumAccess(userId);
        if (!limitCheck.allowed) {
            return res.status(403).json({ error: limitCheck.error });
        }

        const prompt = `[SISTEMA: MODO CLÍNICO ESTRITO ATIVADO]
Você é um Médico Veterinário Especialista em Patologia Clínica e Medicina Preventiva, redigindo um 'Laudo Clínico Semanal Automático' para o prontuário.

DADOS CLÍNICOS DO PACIENTE:
- Nome/Identificação: ${petContext.name}
- Espécie/Raça: ${petContext.species} / ${petContext.breed}
- Idade: ${petContext.age}
- Peso: ${petContext.weight} kg
- Nível de Atividade Base: ${petContext.activity || 'Não informado'}

REGISTROS DE MONITORAMENTO (Últimos 7 dias): ${JSON.stringify(logs)}
ANÁLISE NUTRICIONAL (Food Scans): ${JSON.stringify(scans)}
HISTÓRICO DO CHAT DE TRIAGEM: ${JSON.stringify(chatHistory)}

=== DIRETRIZES ABSOLUTAS DE GERAÇÃO ===
1. OBRIGATÓRIO: O texto deve ser extenso, detalhado e técnico (mínimo de 250 palavras).
2. OBRIGATÓRIO: O tom deve ser IMPESSOAL, OBJETIVO, TÉCNICO e CIENTÍFICO. 
   - PROIBIDO o uso de pronomes na primeira/segunda pessoa para o pet (você, seu).
   - PROIBIDO saudações informais ou conversas diretas com o animal (ex: NUNCA escreva "Ei Rex", "Parece que você...").
   - PROIBIDO uso de exclamações emocionais ou emojis.
   - Refira-se ao animal estritamente como "o paciente", "o animal", ou "o espécime ${petContext.name}".
3. ESTRUTURA DO LAUDO (Exatamente 3 parágrafos densos, separados por dupla quebra de linha "\\n\\n"):
   [Parágrafo 1 - Evolução Clínica e Sinais Vitais] Avalie os logs e o chat. Use jargão médico como "normorexia", "hiporexia", "letargia", "eutimia", "estabilidade comportamental". Sintetize a curva de energia e humor da semana de forma pericial e cronológica.
   [Parágrafo 2 - Parecer Nutricional e Metabólico] Examine os scans. Emita um parecer nutrológico técnico relacionando o alimento ingerido ao porte (${petContext.weight} kg), idade e raça (${petContext.breed}). Detalhe a adequação de macronutrientes, balanço energético e potenciais riscos ao trato gastrointestinal.
   [Parágrafo 3 - Plano Profilático e Prognóstico] Conclua com diretrizes médicas preditivas. Aponte fatores de risco morfofisiológicos cruzados com os achados da semana. Prescreva recomendações preventivas severas de forma autoritária.`;

        const result = await Promise.race([
            analyzeProactiveHealth(prompt),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 60000))
        ]);

        res.json({
            summary: result.insight || result.text || "Status: Logged. System sync in progress.",
            isPremiumTier: true
        });
    } catch (e) {
        console.error("Weekly Report Error:", e);
        res.json({ summary: "Status: Estável. Atualize os registros para ver mais." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 DailyPaw Backend online at port ${PORT}`);
});