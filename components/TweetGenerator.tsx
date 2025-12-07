'use client';

import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { generateOptionsAction, postCreativeTweet, generateImagePreview } from '@/app/actions/thread';
import { fetchAndSummarizeRepo } from '@/app/actions/github';
import { fetchViralTweetsAction } from '@/app/actions/twitter-content';
import { checkAndRunAutoPilot, toggleAutoPilot, getAutoPilotState } from '@/app/actions/autopilot';

interface TweetOptions {
    hook: string;
    value: string;
    thread: string[];
    imagePrompts?: string[];
}

interface ViralTweet {
    id: string;
    text: string;
    author: {
        name: string;
        username: string;
    };
    metrics: {
        likes: number;
        retweets: number;
        replies: number;
    };
    url: string;
    createdAt: string;
}

export default function TweetGenerator() {
    // -------------------------------------------------------------
    // Core Workflow State
    // -------------------------------------------------------------
    // Step 1: Source
    const [contextInput, setContextInput] = useState(''); // Textarea content (User input or Repo URL)
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Step 2: Inspiration
    const [viralTopic, setViralTopic] = useState('');
    const [viralTweets, setViralTweets] = useState<ViralTweet[]>([]);
    const [selectedViralTweets, setSelectedViralTweets] = useState<string[]>([]);
    const [isFetchingViral, setIsFetchingViral] = useState(false);

    // Step 3: Creation
    const [generatedOptions, setGeneratedOptions] = useState<TweetOptions | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [previewImages, setPreviewImages] = useState<Record<number, string>>({});
    const [generatingImages, setGeneratingImages] = useState<Record<number, boolean>>({});
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [publishingType, setPublishingType] = useState<'hook' | 'value' | 'thread' | null>(null);

    // Auto Pilot (Separate Monitoring)
    const [isAutoPilotOn, setIsAutoPilotOn] = useState(false);
    const [autoPilotStatus, setAutoPilotStatus] = useState<string>("Idle");
    const [autoPilotRepo, setAutoPilotRepo] = useState('');

    // Ref to track if generation is active (avoids closure staleness)
    const isGeneratingRef = useRef(false);

    // Abort Controller for "Stop Dreaming"
    const stopGeneration = () => {
        isGeneratingRef.current = false;
        setIsGenerating(false);
        toast("Generation stopped.", { icon: '🛑' });
    };

    // -------------------------------------------------------------
    // Effects
    // -------------------------------------------------------------
    useEffect(() => {
        getAutoPilotState().then(state => {
            setIsAutoPilotOn(state.isActive);
            if (state.monitoredRepo) setAutoPilotRepo(state.monitoredRepo);
        });
    }, []);

    // Auto Pilot Scheduler
    useEffect(() => {
        if (!isAutoPilotOn) {
            setAutoPilotStatus("Disabled");
            return;
        }

        const runCheck = async () => {
            setAutoPilotStatus("Checking...");
            try {
                const res = await checkAndRunAutoPilot();
                if (res.success) {
                    setAutoPilotStatus(res.posted ? "Posted Update!" : "Checked - No Triggers");
                } else {
                    setAutoPilotStatus("Error: " + res.error);
                }
            } catch (e) {
                setAutoPilotStatus("Error");
            }
        };

        const interval = setInterval(runCheck, 300000); // 5 mins
        runCheck();

        return () => clearInterval(interval);
    }, [isAutoPilotOn]);


    // -------------------------------------------------------------
    // Actions
    // -------------------------------------------------------------
    const handleAnalyze = async () => {
        if (!contextInput.trim()) {
            toast.error("Please enter a URL or description");
            return;
        }

        setIsAnalyzing(true);
        try {
            // Smart Detection: Is it a GitHub URL?
            // Matches: github.com/owner/repo OR just owner/repo
            const githubRegex = /github\.com\/([^\/]+\/[^\/]+)|(^[\w-]+\/[\w-]+$)/;
            const match = contextInput.match(githubRegex);

            if (match) {
                // It's a Repo!
                const repoPath = match[1] || match[2] || contextInput; // Fallback
                toast.loading(`Analyzing repo: ${repoPath}...`, { id: 'analyze' });

                const res = await fetchAndSummarizeRepo(repoPath);

                if (res.success && res.summary) {
                    setContextInput(res.summary); // Replace URL with Summary

                    // Auto-extract topic
                    if (res.repoName) {
                        const topic = res.repoName.split('/')[1];
                        setViralTopic(topic);
                        handleFetchViral(topic);
                    }
                    toast.success("Repo analyzed!", { id: 'analyze' });
                } else {
                    toast.error(res.error || "Failed to analyze repo", { id: 'analyze' });
                }
            } else {
                // It's Manual Text!
                // Just keep the text as context.
                // Bonus: Try to find viral tweets if text is long enough
                if (contextInput.length > 20) {
                    // Simple heuristic: take first relevant word or just leave topic blank for user
                    // For now, we won't force a topic search to avoid noise, 
                    // unless user explicitly sets one in Step 2.
                    toast.success("Context set!", { id: 'analyze' });
                } else {
                    toast("Context set. Ready for Step 2.", { icon: '✍️' });
                }
            }
            // Scroll to next step (optional, but good UX)
            document.getElementById('step-2')?.scrollIntoView({ behavior: 'smooth' });

        } catch (e) {
            toast.error("Analysis failed", { id: 'analyze' });
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleFetchViral = async (topicOverride?: string) => {
        const topic = topicOverride || viralTopic;
        if (!topic) return;

        setIsFetchingViral(true);
        try {
            const res = await fetchViralTweetsAction(topic);
            if (res.success && res.tweets) {
                setViralTweets(res.tweets as ViralTweet[]);
                setSelectedViralTweets(res.tweets.map((t: any) => t.text)); // Select all text by default
            } else {
                toast.error("Could not find viral tweets");
            }
        } catch (e) {
            toast.error("Error searching viral tweets");
        } finally {
            setIsFetchingViral(false);
        }
    };

    const handleGenerate = async () => {
        if (!contextInput.trim()) {
            toast.error("Please provide some context (Step 1)");
            return;
        }

        setIsGenerating(true);
        isGeneratingRef.current = true; // Mark active
        setGeneratedOptions(null);
        setPreviewImages({});

        try {
            let finalPrompt = contextInput;

            if (selectedViralTweets.length > 0) {
                const styleSection = `\n\n**Viral Inspiration (Style References):**\nUse the tone and hook style of these high-performing tweets as a guide:\n${selectedViralTweets.map(t => `- "${t.replace(/\n/g, ' ')}"`).join('\n')}`;
                finalPrompt += styleSection;
            }

            const result = await generateOptionsAction(finalPrompt);

            // Critical Fix: Check the ref, NOT the state variable
            if (!isGeneratingRef.current) return;

            if (result.success && result.data) {
                const data = result.data as TweetOptions;
                setGeneratedOptions(data);
                toast.success("Generated!");

                // Start images
                if (data.imagePrompts) {
                    data.imagePrompts.forEach((p, i) => generatePreview(p, i));
                }
            } else {
                toast.error("Generation failed");
            }
        } catch (e) {
            console.error(e);
            toast.error("Generation error");
        } finally {
            setIsGenerating(false);
            isGeneratingRef.current = false;
        }
    };

    const generatePreview = async (prompt: string, index: number) => {
        setGeneratingImages(prev => ({ ...prev, [index]: true }));
        try {
            const res = await generateImagePreview(prompt);
            if (res.success && res.image) {
                setPreviewImages(prev => ({ ...prev, [index]: res.image }));
            }
        } catch (e) {
            console.error("Image preview failed", e);
        } finally {
            setGeneratingImages(prev => ({ ...prev, [index]: false }));
        }
    };

    const handlePublish = async (type: 'hook' | 'value' | 'thread') => {
        if (!generatedOptions) return;
        setPublishingType(type);
        toast.loading(`Publishing ${type}...`, { id: 'pub' });

        try {
            let content: string | string[];
            if (type === 'thread') content = generatedOptions.thread;
            else if (type === 'hook') content = generatedOptions.hook;
            else content = generatedOptions.value;

            const imagePrompts = type === 'thread' ? generatedOptions.imagePrompts : undefined;

            const res = await postCreativeTweet(content, type, imagePrompts);
            if (res.success) {
                toast.success("Published!", { id: 'pub' });
            } else {
                toast.error("Failed: " + res.error, { id: 'pub' });
            }
        } catch (_) {
            toast.error("Publish error", { id: 'pub' });
        } finally {
            setPublishingType(null);
        }
    };

    const toggleViralSelection = (text: string) => {
        if (selectedViralTweets.includes(text)) {
            setSelectedViralTweets(prev => prev.filter(t => t !== text));
        } else {
            setSelectedViralTweets(prev => [...prev, text]);
        }
    };

    // -------------------------------------------------------------
    // UI Render
    // -------------------------------------------------------------
    return (
        <div className="w-full max-w-5xl mx-auto p-6 md:p-12 space-y-12">

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-200 dark:border-gray-800 pb-6">
                <div>
                    <h1 className="text-4xl font-black bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 bg-clip-text text-transparent tracking-tight">
                        Ghost Trifid
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 font-medium mt-1">
                        High-Voltage Creative Engine
                    </p>
                </div>

                {/* Auto Pilot Mini-Dashboard */}
                <div className="flex items-center gap-4 bg-gray-50 dark:bg-gray-900 px-4 py-2 rounded-full border border-gray-200 dark:border-gray-800">
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase font-bold text-gray-400">Auto Pilot</span>
                        <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${isAutoPilotOn ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{autoPilotStatus}</span>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            const newState = !isAutoPilotOn;
                            setIsAutoPilotOn(newState);
                            toggleAutoPilot(newState, autoPilotRepo);
                            toast.success(`AutoPilot ${newState ? 'ON' : 'OFF'}`);
                        }}
                        className="text-xs bg-white dark:bg-black border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 px-2 py-1 rounded"
                    >
                        {isAutoPilotOn ? 'Turn Off' : 'Turn On'}
                    </button>
                </div>
            </div>

            <div className="flex flex-col gap-10">

                {/* STEP 1: SOURCE */}
                <section className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-lg">1</div>
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Smart Context</h2>
                    </div>

                    <div className="bg-white dark:bg-black/30 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
                        <label className="block text-sm font-bold text-gray-500 mb-2 uppercase tracking-wide">
                            What did you ship today?
                        </label>
                        <textarea
                            value={contextInput}
                            onChange={(e) => setContextInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && e.metaKey && handleAnalyze()}
                            placeholder="Paste a GitHub URL (e.g. vercel/ai) or describe your update..."
                            className="w-full min-h-[120px] bg-gray-50 dark:bg-gray-900 border-2 border-transparent focus:border-blue-500 rounded-xl p-4 text-lg text-gray-800 dark:text-gray-100 placeholder-gray-400 outline-none transition-all resize-y"
                        />

                        <div className="flex justify-end mt-4">
                            <button
                                onClick={handleAnalyze}
                                disabled={!contextInput.trim() || isAnalyzing}
                                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isAnalyzing ? (
                                    <><span>⚙️</span> Analyzing...</>
                                ) : (
                                    <><span>⚡</span> Analyze Context</>
                                )}
                            </button>
                        </div>
                    </div>
                </section>

                {/* STEP 2: INSPIRATION */}
                <section className="space-y-4" id="step-2">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-600 text-white font-bold text-lg">2</div>
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Refine Inspiration</h2>
                    </div>

                    <div className="bg-white dark:bg-black/30 border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
                        <div className="flex gap-4 mb-6">
                            <input
                                value={viralTopic}
                                onChange={(e) => setViralTopic(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleFetchViral()}
                                placeholder="Topic for viral tweets (e.g. 'Next.js', 'Bootstrap')"
                                className="flex-1 bg-gray-50 dark:bg-gray-800 border-none rounded-xl px-4 py-2 focus:ring-2 focus:ring-purple-500 outline-none"
                            />
                            <button
                                onClick={() => handleFetchViral()}
                                disabled={isFetchingViral || !viralTopic}
                                className="text-purple-600 font-bold text-sm hover:underline disabled:opacity-50"
                            >
                                {isFetchingViral ? 'Searching...' : 'Refresh Vibe ⚡'}
                            </button>
                        </div>

                        {viralTweets.length === 0 ? (
                            <div className="text-center py-8 text-gray-400 text-sm font-medium border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-xl">
                                Enter a topic above to find viral inspiration.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {viralTweets.map((t) => {
                                    const isSelected = selectedViralTweets.includes(t.text);
                                    return (
                                        <div
                                            key={t.id}
                                            onClick={() => toggleViralSelection(t.text)}
                                            className={`p-5 rounded-2xl cursor-pointer transition-all border relative overflow-hidden group flex flex-col justify-between h-full gap-4 ${isSelected
                                                ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 shadow-md transform scale-[1.02]'
                                                : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-purple-300 dark:hover:border-purple-700'
                                                }`}
                                        >
                                            {/* Author Header */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center font-bold text-xs text-gray-600 dark:text-gray-300 uppercase">
                                                        {t.author.name.substring(0, 2)}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-bold text-gray-900 dark:text-gray-100">{t.author.name}</span>
                                                        <span className="text-[10px] text-gray-500">@{t.author.username}</span>
                                                    </div>
                                                </div>
                                                <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full">
                                                    {new Date(t.createdAt).toLocaleDateString()}
                                                </span>
                                            </div>

                                            {/* Tweet Text */}
                                            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed font-medium">
                                                "{t.text}"
                                            </p>

                                            {/* Metrics Footer */}
                                            <div className="flex items-center gap-4 text-gray-400 text-xs border-t border-gray-100 dark:border-gray-800 pt-3 mt-auto">
                                                <span className="flex items-center gap-1"><span className="text-pink-500">♥</span> {t.metrics.likes.toLocaleString()}</span>
                                                <span className="flex items-center gap-1"><span>🔁</span> {t.metrics.retweets.toLocaleString()}</span>
                                                <span className="flex items-center gap-1"><span>💬</span> {t.metrics.replies.toLocaleString()}</span>
                                            </div>

                                            {isSelected && (
                                                <div className="absolute top-2 right-2 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center shadow-lg">
                                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                        <p className="text-right text-xs text-gray-400 mt-2 font-medium">
                            {selectedViralTweets.length} style(s) selected
                        </p>
                    </div>
                </section>

                {/* STEP 3: CREATE & PUBLISH */}
                <section className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-pink-500 text-white font-bold text-lg">3</div>
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Create & Publish</h2>
                    </div>

                    <div className="bg-gradient-to-br from-gray-900 to-black rounded-2xl p-1 shadow-xl">
                        {isGenerating ? (
                            <button
                                onClick={stopGeneration}
                                className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-black text-lg uppercase tracking-widest rounded-xl transition-all animate-pulse"
                            >
                                ⏹ Stop Dreaming
                            </button>
                        ) : (
                            <button
                                onClick={handleGenerate}
                                disabled={!contextInput.trim()}
                                className="w-full py-4 bg-white dark:bg-gray-100 text-black font-black text-lg uppercase tracking-widest rounded-xl hover:bg-gray-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                ✨ Generate Magic
                            </button>
                        )}
                    </div>

                    {/* RESULTS AREA */}
                    {generatedOptions && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-bottom-10 duration-700 mt-8">
                            {/* Hook Card */}
                            <div className="bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-800/30 rounded-2xl p-6 flex flex-col hover:border-orange-200 dark:hover:border-orange-800 transition-colors">
                                <div className="flex justify-between items-center mb-4">
                                    <span className="text-xs font-bold uppercase tracking-wider text-orange-600 bg-orange-100 dark:bg-orange-900/30 px-2 py-1 rounded">The Hook</span>
                                </div>
                                <p className="text-xl font-black text-gray-900 dark:text-gray-100 leading-tight mb-6">
                                    {generatedOptions.hook}
                                </p>
                                <div className="mt-auto">
                                    <button
                                        onClick={() => handlePublish('hook')}
                                        disabled={!!publishingType}
                                        className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-orange-500/20 transition-all disabled:opacity-50"
                                    >
                                        {publishingType === 'hook' ? 'Posting...' : 'Post Hook'}
                                    </button>
                                </div>
                            </div>

                            {/* Value Card */}
                            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30 rounded-2xl p-6 flex flex-col hover:border-blue-200 dark:hover:border-blue-800 transition-colors">
                                <div className="flex justify-between items-center mb-4">
                                    <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded">The Value</span>
                                </div>
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed mb-6">
                                    {generatedOptions.value}
                                </p>
                                <div className="mt-auto">
                                    <button
                                        onClick={() => handlePublish('value')}
                                        disabled={!!publishingType}
                                        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-600/20 transition-all disabled:opacity-50"
                                    >
                                        {publishingType === 'value' ? 'Posting...' : 'Post Value'}
                                    </button>
                                </div>
                            </div>

                            {/* Thread Card (Full Width) */}
                            <div className="bg-purple-50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-800/30 rounded-2xl p-6 md:col-span-2 hover:border-purple-200 dark:hover:border-purple-800 transition-colors">
                                <div className="flex justify-between items-center mb-6">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold uppercase tracking-wider text-purple-600 bg-purple-100 dark:bg-purple-900/30 px-2 py-1 rounded">The Thread</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                    {generatedOptions.thread.map((t, i) => (
                                        <div key={i} className="flex flex-col gap-3 group">
                                            <div className="bg-white dark:bg-black/20 p-4 rounded-xl border border-purple-100 dark:border-purple-800/20 h-full">
                                                <div className="flex gap-2 text-sm text-gray-700 dark:text-gray-300 mb-3">
                                                    <span className="text-purple-500 font-mono font-bold">{i + 1}/</span>
                                                    <p>{t}</p>
                                                </div>

                                                {/* Image Preview */}
                                                <div
                                                    className="w-full aspect-video bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden relative cursor-pointer group-hover:ring-2 ring-purple-500/50 transition-all pb-2/3"
                                                    onClick={() => previewImages[i] && setSelectedImage(previewImages[i])}
                                                >
                                                    {previewImages[i] ? (
                                                        <img src={previewImages[i]} alt={`Tweet ${i + 1}`} className="absolute w-full h-full object-cover" />
                                                    ) : generatingImages[i] ? (
                                                        <div className="absolute inset-0 flex items-center justify-center">
                                                            <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                                                        </div>
                                                    ) : (
                                                        <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400 font-medium">
                                                            Generating visual...
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <button
                                    onClick={() => handlePublish('thread')}
                                    disabled={!!publishingType}
                                    className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    <span>🧵</span> {publishingType === 'thread' ? 'Weaving Thread...' : 'Publish Thread Sequence'}
                                </button>
                            </div>
                        </div>
                    )}
                </section>
            </div>
            {/* Lightbox Modal */}
            {selectedImage && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200"
                    onClick={() => setSelectedImage(null)}
                >
                    <div className="relative max-w-5xl w-full" onClick={e => e.stopPropagation()}>
                        <img
                            src={selectedImage}
                            alt="Full size preview"
                            className="w-full h-auto max-h-[85vh] object-contain rounded-lg shadow-2xl"
                        />
                        <button
                            onClick={() => setSelectedImage(null)}
                            className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors bg-white/10 hover:bg-white/20 p-2 rounded-full backdrop-blur-sm"
                        >
                            <svg className="w-6 h-6 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
