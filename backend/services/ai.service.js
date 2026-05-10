import OpenAI from "openai";

class AIService {
  constructor() {
    this.client = null;
    this.initialized = false;
  }

  initialize() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn("⚠️ OPENAI_API_KEY not set. AI features disabled.");
      return false;
    }
    
    try {
      this.client = new OpenAI({ apiKey });
      this.initialized = true;
      console.log("✅ AI service initialized");
      return true;
    } catch (error) {
      console.error("❌ Failed to initialize AI service:", error.message);
      return false;
    }
  }

  async chat({ message, context = [], model = "gpt-3.5-turbo" }) {
    if (!this.initialized || !this.client) {
      throw new Error("AI service not available. Please configure OPENAI_API_KEY.");
    }

    const messages = [
      {
        role: "system",
        content: "You are a helpful assistant in a messaging app. Keep responses concise and friendly."
      },
      ...context.slice(-10), // Limit context to last 10 messages
      { role: "user", content: message }
    ];

    try {
      const completion = await this.client.chat.completions.create({
        model,
        messages,
        max_tokens: 500,
        temperature: 0.7
      });

      return {
        success: true,
        response: completion.choices[0].message.content,
        model,
        usage: completion.usage
      };
    } catch (error) {
      console.error("❌ AI chat error:", error.message);
      
      if (error.status === 401) {
        throw new Error("Invalid API key. Check OPENAI_API_KEY configuration.");
      }
      if (error.status === 429) {
        throw new Error("Rate limit exceeded. Please try again later.");
      }
      
      throw new Error("Failed to get AI response. Please try again.");
    }
  }
}

export default new AIService();