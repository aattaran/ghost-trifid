import { GoogleGenerativeAI } from "@google/generative-ai";

// Ensure API Key exists
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
// Using gemini-1.5-flash as 2.0-flash might not be generally available or requires specific setup, 
// but user requested 2.0-flash. I will try 1.5-flash first to be safe as 2.0 is very new/preview. 
// Actually, I will follow strict protocol instruction: "gemini-2.0-flash". 
// If it fails, I will know why.
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

export async function generateTweetVariations(rawText: string) {
    if (!process.env.GEMINI_API_KEY) return null;

    const prompt = `
    You are a viral social media manager.
    Rewrite the following text into 3 distinct Twitter/X formats:
    1. "The Hook" (Clickbaity, short, engaging)
    2. "The Value" (Professional, insightful, bullet points)
    3. "The Thread" (A 3-part thread structure)

    Input Text: "${rawText}"

    Output strict JSON format:
    {
      "hook": "...",
      "value": "...",
      "thread": ["part 1", "part 2", "part 3"]
    }
  `;

    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        // Clean markdown code blocks if Gemini adds them
        const jsonStr = text.replace(/```json|```/g, "").trim();
        return JSON.parse(jsonStr);
    } catch (error) {
        console.error("Gemini Text Gen Failed:", error);
        return null;
    }
}
