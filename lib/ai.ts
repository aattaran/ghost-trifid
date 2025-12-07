import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function generateTweetVariations(input: string) {
    if (!process.env.GEMINI_API_KEY) {
        console.error("Missing GEMINI_API_KEY");
        // Return mock data if key is missing so app doesn't crash
        return getMockData(input);
    }

    const tryGenerate = async (modelName: string) => {
        try {
            console.log(`Attempting with model: ${modelName}`);

            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: { responseMimeType: "application/json" }
            });

            const prompt = `
            You are an expert software engineer who is also a viral social media manager.
            Rewrite the following text into 3 distinct Twitter/X formats.

            **Style Instruction:**
            If the input contains a "Viral Inspiration" section, analyze those tweets. MIMIC their sentence structure, hook style, and tone exactly.

            **Output Formats:**
            1. "The Hook" (Clickbaity, short, engaging)
            2. "The Value" (Professional, insightful, bullet points)
            3. "The Thread" (A 3-part thread structure)

            Input Text: "${input}"

            Output strict JSON format:
            {
              "hook": "...",
              "value": "...",
              "thread": ["part 1", "part 2", "part 3"],
              "imagePrompts": ["Image for tweet 1", "Image for tweet 2", "Image for tweet 3"]
            }
            `;

            const result = await model.generateContent(prompt);
            const text = result.response.text();
            console.log(`✅ Success with ${modelName} `);
            return JSON.parse(text);
        } catch (error: any) {
            // Log the specific error message to debug console
            console.warn(`❌ Failed with ${modelName}: ${error.message?.slice(0, 100)}...`);
            return null;
        }
    };

    try {
        // Attempt 1: Gemini 3 Pro (New Flagship - Maximum Intelligence)
        let data = await tryGenerate("gemini-3-pro-preview");

        // Attempt 2: Gemini 2.5 Flash (Fallback for Speed)
        if (!data) data = await tryGenerate("gemini-2.5-flash-001");

        // Attempt 3: Gemini 2.5 Pro (Last Resort)
        if (!data) data = await tryGenerate("gemini-2.5-pro-001");

        // If ALL fail, return mock data so the app doesn't break
        if (!data) {
            console.error("⚠️ All API models failed. Returning MOCK data to prevent crash.");
            return getMockData(input);
        }

        return {
            hook: data.hook || data.Hook || "",
            value: data.value || data.Value || "",
            thread: data.thread || data.Thread || [],
            imagePrompts: data.imagePrompts || data.ImagePrompts || [`Minimalist illustration of ${input} `]
        };

    } catch (error) {
        console.error("AI Gen Completely Failed:", error);
        return getMockData(input);
    }
}

// Fallback data function
function getMockData(input: string) {
    return {
        hook: `🔥 This is a simulated response because the API is having trouble.\n\n"${input.slice(0, 20)}..."`,
        value: `Here is the professional breakdown: \n• Point 1: API Key might be invalid\n• Point 2: Region might be blocked\n• Point 3: Model alias might be wrong`,
        thread: [
            "1/3 This is a fallback thread.",
            "2/3 Your app is working, but the AI connection failed.",
            "3/3 Check your server logs for the specific '404' or 'Permission' error."
        ],
        imagePrompts: [
            "Digital network failure illustration, abstract connection breakdown, blue and orange",
            "Broken link icon in futuristic style, neon cybernetic aesthetic",
            "System reboot visualization, loading spinner in 3d space"
        ]
    };
}