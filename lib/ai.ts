// Using direct fetch API instead of SDK (SDK has fetch issues)

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta';

export async function generateTweetVariations(input: string) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        console.error("Missing GEMINI_API_KEY");
        return getMockData(input);
    }

    const prompt = `
    You are an expert software engineer who wants to generate viral tweets about your code.
    Rewrite the following text into 3 distinct Twitter/X formats.

    **CRITICAL: CHARACTER LIMITS**
    - The "hook" MUST be under 270 characters (strict limit).
    - The "value" MUST be under 270 characters (strict limit).
    - Each part of the "thread" array MUST be under 270 characters.
    Be concise. Remove unnecessary words. Use abbreviations if needed. COUNT YOUR CHARACTERS.

    **IMPORTANT: CODE SCREENSHOTS**
    For THREADS: A screenshot of the actual source code will be attached automatically.
    Make the thread text REFERENCE the code. Use phrases like:
    - "Here's the core logic 👇"
    - "Check out this snippet"
    - "The magic happens here ⬇️"
    - "See the implementation below"
    This makes the text and screenshot feel connected.

    **Style Instruction:**
    If the input contains a "Viral Inspiration" section, analyze those tweets. MIMIC their sentence structure, hook style, and tone exactly.

    **Output Formats:**
    1. "The Hook" (Clickbaity, short, engaging - MAX 270 chars, no image)
    2. "The Value" (Professional, insightful, concise - MAX 270 chars, no image)
    3. "The Thread" (A 3-part thread, each part MAX 270 chars, FIRST TWEET gets code screenshot)

    Input Text: "${input}"

    Output strict JSON format:
    {
      "hook": "...",
      "value": "...",
      "thread": ["part 1 (reference the code screenshot)", "part 2", "part 3"]
    }
    `;

    const tryGenerate = async (modelName: string) => {
        try {
            console.log(`Attempting with model: ${modelName}`);

            const response = await fetch(
                `${GEMINI_API_URL}/models/${modelName}:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { responseMimeType: 'application/json' }
                    })
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                console.warn(`❌ Failed with ${modelName}: ${response.status} - ${errorText.slice(0, 100)}...`);
                return null;
            }

            const result = await response.json();
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!text) {
                console.warn(`❌ Failed with ${modelName}: No text in response`);
                return null;
            }

            console.log(`📝 Raw response from ${modelName} (first 300 chars):`);
            console.log(text.substring(0, 300));

            const data = JSON.parse(text);

            // Validate that we got actual content
            if (!data.hook && !data.value && (!data.thread || data.thread.length === 0)) {
                console.warn(`⚠️ ${modelName} returned empty content! Trying fallback...`);
                return null;
            }

            console.log(`✅ Success with ${modelName}`);
            return data;
        } catch (error: any) {
            console.warn(`❌ Failed with ${modelName}: ${error.message?.slice(0, 100)}...`);
            return null;
        }
    };

    try {
        // Attempt 1: Gemini 2.5 Flash (Stable - fast and intelligent)
        let data = await tryGenerate("gemini-2.5-flash");

        // Attempt 2: Gemini 2.0 Flash (Fallback - second gen workhorse)
        if (!data) data = await tryGenerate("gemini-2.0-flash");

        // If ALL fail, return mock data so the app doesn't break
        if (!data) {
            console.error("⚠️ All API models failed. Returning MOCK data to prevent crash.");
            return getMockData(input);
        }

        return {
            hook: data.hook || data.Hook || "",
            value: data.value || data.Value || "",
            thread: data.thread || data.Thread || [],
            imagePrompts: [] // No longer using AI image prompts - using code screenshots
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
        imagePrompts: []
    };
}