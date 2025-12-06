import { GoogleGenerativeAI } from "@google/generative-ai";

// We will define the models to try in order of preference
const MODELS = [
    "imagen-4.0-generate-001", // Latest/Greatest (June 2025)
    "imagen-3.0-generate-002", // Stable Imagen 3 (Feb 2025)
    "imagen-3.0-generate-001"  // Legacy
];

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export async function generateImage(prompt: string): Promise<Buffer | null> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("Missing GEMINI_API_KEY");
        return null;
    }

    // Helper to try a specific model
    const tryModel = async (modelName: string) => {
        const url = `${BASE_URL}/${modelName}:predict?key=${apiKey}`;

        console.log(`🎨 Attempting image gen with model: ${modelName}`);

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                instances: [
                    {
                        prompt: `Tech illustration, dark mode, futuristic, minimal, high quality, ${prompt}`
                    }
                ],
                parameters: {
                    sampleCount: 1,
                    aspectRatio: "1:1"
                }
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`[${response.status}] ${errText}`);
        }

        const data = await response.json();
        const base64String = data.predictions?.[0]?.bytesBase64Encoded;

        if (!base64String) {
            throw new Error("No image data returned in 'predictions'");
        }

        return Buffer.from(base64String, 'base64');
    };

    // Iterate through models with fallback logic
    for (const model of MODELS) {
        try {
            return await tryModel(model);
        } catch (error: any) {
            console.warn(`⚠️ Failed with ${model}: ${error.message?.slice(0, 100)}...`);
            // If it's the last model, log the full error and return null
            if (model === MODELS[MODELS.length - 1]) {
                console.error("❌ All image models failed.");
            }
        }
    }

    return null;
}