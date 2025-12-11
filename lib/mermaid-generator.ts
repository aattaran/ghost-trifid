import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';

export interface MermaidDiagramOptions {
    definition: string;
    theme?: 'default' | 'dark' | 'forest' | 'neutral';
    bgColor?: string;
}

/**
 * Generates a Mermaid diagram PNG from a definition string
 * Uses Puppeteer to render via mermaid.js
 */
export async function generateMermaidDiagram(options: MermaidDiagramOptions): Promise<Buffer | null> {
    const { definition, theme = 'dark', bgColor = '#1a1a2e' } = options;

    console.log(`📊 Generating Mermaid diagram (theme: ${theme})...`);

    try {
        const browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        // Set viewport for consistent sizing
        await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });

        // Create HTML with Mermaid.js
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
            <style>
                body {
                    margin: 0;
                    padding: 40px;
                    background-color: ${bgColor};
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                }
                #diagram {
                    background: transparent;
                }
            </style>
        </head>
        <body>
            <pre class="mermaid" id="diagram">
${definition}
            </pre>
            <script>
                mermaid.initialize({
                    startOnLoad: true,
                    theme: '${theme}',
                    themeVariables: {
                        primaryColor: '#4f46e5',
                        primaryTextColor: '#fff',
                        primaryBorderColor: '#6366f1',
                        lineColor: '#94a3b8',
                        secondaryColor: '#1e293b',
                        tertiaryColor: '#0f172a',
                        background: '${bgColor}',
                        mainBkg: '#1e293b',
                        nodeBorder: '#6366f1',
                        clusterBkg: '#1e293b',
                        clusterBorder: '#4f46e5',
                        titleColor: '#f8fafc',
                        edgeLabelBackground: '#1e293b'
                    }
                });
            </script>
        </body>
        </html>
        `;

        await page.setContent(html, { waitUntil: 'networkidle0' });

        // Wait for Mermaid to render
        await page.waitForSelector('#diagram svg', { timeout: 10000 });

        // Get the SVG element and take a screenshot
        const element = await page.$('#diagram');
        if (!element) {
            console.error('❌ Could not find diagram element');
            await browser.close();
            return null;
        }

        const screenshot = await element.screenshot({ type: 'png' }) as Buffer;

        await browser.close();

        console.log(`✅ Mermaid diagram generated (${screenshot.length} bytes)`);
        return screenshot;

    } catch (error) {
        console.error('❌ Failed to generate Mermaid diagram:', error);
        return null;
    }
}

/**
 * Generates and saves a Mermaid diagram to a file
 */
export async function saveMermaidDiagram(
    definition: string,
    filename: string,
    theme: 'default' | 'dark' | 'forest' | 'neutral' = 'dark'
): Promise<string | null> {
    const buffer = await generateMermaidDiagram({ definition, theme });
    if (!buffer) return null;

    const diagramsDir = path.join(process.cwd(), 'public', 'diagrams');
    await fs.mkdir(diagramsDir, { recursive: true });

    const filepath = path.join(diagramsDir, filename);
    await fs.writeFile(filepath, buffer);

    console.log(`💾 Saved diagram to: ${filepath}`);
    return filepath;
}

/**
 * Generates a simple flowchart definition from a code feature
 */
export function generateFeatureFlowchart(
    featureName: string,
    description: string,
    files: string[]
): string {
    // Create a simple flowchart showing the feature's architecture
    const sanitize = (s: string) => s.replace(/["`]/g, "'").replace(/\n/g, ' ').substring(0, 40);
    const shortName = featureName.split(' ').slice(0, 3).join(' ');

    const fileNodes = files.slice(0, 3).map((f, i) => {
        const basename = f.split('/').pop() || f;
        return `    F${i}["📄 ${basename}"]`;
    }).join('\n');

    const fileLinks = files.slice(0, 3).map((_, i) => `    A --> F${i}`).join('\n');

    return `flowchart TD
    subgraph Feature["🚀 ${sanitize(shortName)}"]
        A["${sanitize(featureName)}"]
    end
    
    subgraph Files["📁 Implementation"]
${fileNodes}
    end
    
${fileLinks}
    
    style Feature fill:#1e293b,stroke:#6366f1,color:#f8fafc
    style Files fill:#0f172a,stroke:#4f46e5,color:#f8fafc
    style A fill:#4f46e5,stroke:#818cf8,color:#fff`;
}
