/**
 * NVIDIA NIM AI Service (using OpenAI-compatible API)
 * Powers all AI Agents in the messenger app
 * Model: qwen/qwen3-coder-480b-a35b-instruct via integrate.api.nvidia.com
 */
import OpenAI from "openai";

const BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_MODEL = "qwen/qwen3-coder-480b-a35b-instruct";

class NvidiaAIService {
    constructor() {
        if (!process.env.NVIDIA_API_KEY) {
            console.warn("⚠️ NVIDIA_API_KEY is not set in .env. AI Agent features will not work.");
        }
        this.client = new OpenAI({
            apiKey: process.env.NVIDIA_API_KEY || "dummy_key_to_prevent_crash",
            baseURL: BASE_URL,
        });
    }

    /**
     * Search the web for real-time information using DuckDuckGo's instant answer API
     * @param {string} query - The search query
     * @returns {Promise<string>} - Search result summary
     */
    async searchWeb(query) {
        try {
            const encoded = encodeURIComponent(query);
            const url = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`;
            
            const response = await fetch(url, {
                headers: { "User-Agent": "MessengerAI/1.0" },
                signal: AbortSignal.timeout(8000)
            });
            
            if (!response.ok) throw new Error("Search failed");
            
            const data = await response.json();
            
            let result = "";
            
            // Abstract (summary paragraph)
            if (data.Abstract) {
                result += `**Summary**: ${data.Abstract}\n`;
                if (data.AbstractSource) result += `Source: ${data.AbstractSource} (${data.AbstractURL})\n`;
            }
            
            // Answer (short definition/fact)
            if (data.Answer) {
                result += `**Answer**: ${data.Answer}\n`;
            }
            
            // Definition
            if (data.Definition) {
                result += `**Definition**: ${data.Definition}\n`;
            }
            
            // Related topics (up to 3)
            if (data.RelatedTopics && data.RelatedTopics.length > 0) {
                result += "\n**Related**:\n";
                data.RelatedTopics.slice(0, 3).forEach(topic => {
                    if (topic.Text) result += `- ${topic.Text}\n`;
                });
            }

            return result || `No instant results found for "${query}". I'll answer from my training knowledge.`;
        } catch (error) {
            console.warn("⚠️ Web search failed:", error.message);
            return `Web search unavailable for "${query}". Answering from training data.`;
        }
    }

    /**
     * Generate a chat response from an AI agent
     * @param {Object} options
     * @param {string} options.userMessage - The user's message
     * @param {string} options.agentInstructions - Agent's system instructions
     * @param {string} options.agentDescription - Agent's role description
     * @param {Array}  options.history - Previous messages [{role, content}]
     * @param {boolean} options.canSearchWeb - Whether agent can search the web
     * @param {string} options.model - Model to use
     * @returns {Promise<{response: string, searchUsed: boolean}>}
     */
    async agentChat({ userMessage, agentInstructions = "", agentDescription = "", history = [], canSearchWeb = true, model = DEFAULT_MODEL }) {
        let searchContext = "";
        let searchUsed = false;

        // Determine if web search is needed
        if (canSearchWeb) {
            const needsSearch = this._detectSearchIntent(userMessage);
            if (needsSearch) {
                console.log(`🔍 Agent searching web for: "${userMessage}"`);
                searchContext = await this.searchWeb(userMessage);
                searchUsed = true;
            }
        }

        // Build system prompt
        const systemParts = [];
        systemParts.push("You are a helpful AI assistant in a messaging app.");
        
        if (agentDescription) {
            systemParts.push(`Your role: ${agentDescription}`);
        }
        
        if (agentInstructions) {
            systemParts.push(`Instructions: ${agentInstructions}`);
        }
        
        systemParts.push("Format your responses clearly. When showing code, always use markdown code blocks with the language specified (e.g. ```python). Be concise but thorough.");
        
        if (searchContext) {
            systemParts.push(`\n--- Real-time Web Search Results ---\n${searchContext}\n--- End of Search Results ---\nUse the above search results to inform your response when relevant.`);
        }

        const systemPrompt = systemParts.join("\n\n");

        // Build messages array
        const messages = [
            { role: "system", content: systemPrompt },
            ...history.slice(-10), // Keep last 10 messages for context
            { role: "user", content: userMessage }
        ];

        try {
            // Non-streaming response for API simplicity
            const completion = await this.client.chat.completions.create({
                model,
                messages,
                temperature: 0.7,
                top_p: 0.8,
                max_tokens: 4096,
                stream: false
            });

            const response = completion.choices[0]?.message?.content || "I couldn't generate a response.";
            return { response, searchUsed, usage: completion.usage };
        } catch (error) {
            console.error("❌ NVIDIA AI error:", error.message);
            throw new Error(`AI service error: ${error.message}`);
        }
    }

    /**
     * Stream a chat response chunk by chunk
     * @returns {AsyncGenerator} - Yields text chunks
     */
    async *agentChatStream({ userMessage, agentInstructions = "", agentDescription = "", history = [], canSearchWeb = true, model = DEFAULT_MODEL }) {
        let searchContext = "";

        if (canSearchWeb && this._detectSearchIntent(userMessage)) {
            searchContext = await this.searchWeb(userMessage);
            yield { type: "search_started", query: userMessage };
        }

        const systemParts = ["You are a helpful AI assistant in a messaging app."];
        if (agentDescription) systemParts.push(`Your role: ${agentDescription}`);
        if (agentInstructions) systemParts.push(`Instructions: ${agentInstructions}`);
        systemParts.push("Format responses clearly. Use markdown code blocks with language tags for code.");
        if (searchContext) {
            systemParts.push(`\n--- Web Search Results ---\n${searchContext}\n--- End Results ---`);
        }

        const messages = [
            { role: "system", content: systemParts.join("\n\n") },
            ...history.slice(-10),
            { role: "user", content: userMessage }
        ];

        const completion = await this.client.chat.completions.create({
            model,
            messages,
            temperature: 0.7,
            top_p: 0.8,
            max_tokens: 4096,
            stream: true
        });

        for await (const chunk of completion) {
            const text = chunk.choices[0]?.delta?.content || "";
            if (text) yield { type: "text", content: text };
        }

        yield { type: "done" };
    }

    /**
     * Detect if user's message likely needs real-time web search
     */
    _detectSearchIntent(message) {
        const msg = message.toLowerCase();
        const searchTriggers = [
            "latest", "current", "today", "now", "recent", "2024", "2025", "2026",
            "news", "price", "weather", "stock", "update", "new", "released",
            "what is", "who is", "when did", "where is", "how much",
            "search", "find", "look up", "check"
        ];
        return searchTriggers.some(trigger => msg.includes(trigger));
    }
}

// Singleton instance
const nvidiaService = new NvidiaAIService();
export default nvidiaService;
