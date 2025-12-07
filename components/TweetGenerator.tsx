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

export default function TweetGenerator() {
    // -------------------------------------------------------------
    // Core Workflow State
    // -------------------------------------------------------------
    // Step 1: Source
    const [sourceMode, setSourceMode] = useState<'manual' | 'github'>('manual');
    const [contextInput, setContextInput] = useState(''); // Textarea content
    const [repoUrl, setRepoUrl] = useState('');
    const [isFetchingRepo, setIsFetchingRepo] = useState(false);

    // Step 2: Inspiration
    const [viralTopic, setViralTopic] = useState('');
    const [viralTweets, setViralTweets] = useState<string[]>([]);
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
    const handleFetchRepo = async () => {
        if (!repoUrl) return;
        setIsFetchingRepo(true);
        try {
            const res = await fetchAndSummarizeRepo(repoUrl);
            if (res.success && res.summary) {
                setContextInput(res.summary);
                setSourceMode('github'); // Keep visually selected but result is in context

                // Pre-fill topic for step 2
                if (res.repoName) {
                    const topic = res.repoName.split('/')[1] || res.repoName;
                    setViralTopic(topic);
                    // Trigger fetch
                    handleFetchViral(topic);
                }
                toast.success("Repo summarized!");
            } else {
                toast.error(res.error || "Failed to fetch repo");
            }
        } catch (e) {
            toast.error("Error fetching repo");
        } finally {
            setIsFetchingRepo(false);
        }
    };

    const handleFetchViral = async (topicOverride?: string) => {
        const topic = topicOverride || viralTopic;
        if (!topic) return;

        setIsFetchingViral(true);
        try {
            const res = await fetchViralTweetsAction(topic);
            if (res.success && res.tweets) {
                setViralTweets(res.tweets);
                setSelectedViralTweets(res.tweets); // Select all by default
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

    const toggleViralSelection = (tweet: string) => {
        if (selectedViralTweets.includes(tweet)) {
            setSelectedViralTweets(prev => prev.filter(t => t !== tweet));
        } else {
            setSelectedViralTweets(prev => [...prev, tweet]);
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
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Choose Source</h2>
                    </div>

                    <div className="bg-white dark:bg-black/30 border border-gray-200 dark:border-gray-800 rounded-2xl p-1 overflow-hidden">
                        <div className="flex border-b border-gray-100 dark:border-gray-800">
                            <button
                                onClick={() => setSourceMode('manual')}
                                className={`flex-1 py-3 text-sm font-bold transition-all ${sourceMode === 'manual' ? 'bg-white dark:bg-gray-900 shadow-sm text-blue-600 rounded-xl' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                ✍️ Manual Input
                            </button>
                            <button
                                onClick={() => setSourceMode('github')}
                                className={`flex-1 py-3 text-sm font-bold transition-all ${sourceMode === 'github' ? 'bg-white dark:bg-gray-900 shadow-sm text-black dark:text-white rounded-xl' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                <span className="mr-2">GitHub</span> GitHub Repo
                            </button>
                        </div>

                        <div className="p-6">
                            {sourceMode === 'github' && (
                                <div className="flex gap-2 mb-4 animate-in fade-in slide-in-from-top-2">
                                    <input
                                        value={repoUrl}
                                        onChange={(e) => setRepoUrl(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleFetchRepo()}
                                        placeholder="owner/repo (e.g. vercel/ai)"
                                        className="flex-1 bg-gray-50 dark:bg-gray-800 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-black dark:focus:ring-white outline-none"
                                    />
                                    <button
                                        onClick={handleFetchRepo}
                                        disabled={isFetchingRepo}
                                        className="bg-black dark:bg-white text-white dark:text-black font-bold px-6 rounded-xl hover:opacity-80 transition-opacity disabled:opacity-50"
                                    >
                                        {isFetchingRepo ? 'Fetching...' : 'Fetch'}
                                    </button>
                                </div>
                            )}

                            <textarea
                                value={contextInput}
                                onChange={(e) => setContextInput(e.target.value)}
                                placeholder={sourceMode === 'manual' ? "What did you build today? Paste snippets, thoughts, or changelogs..." : "Repository summary will appear here..."}
                                className="w-full min-h-[150px] bg-transparent border-none resize-y outline-none text-lg text-gray-700 dark:text-gray-300 placeholder-gray-300"
                            />
                        </div>
                    </div>
                </section>

                {/* STEP 2: INSPIRATION */}
                <section className="space-y-4">
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
                                {viralTweets.map((t, i) => {
                                    const isSelected = selectedViralTweets.includes(t);
                                    return (
                                        <div
                                            key={i}
                                            onClick={() => toggleViralSelection(t)}
                                            className={`p-4 rounded-xl cursor-pointer transition-all border-2 relative overflow-hidden group ${isSelected
                                                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 shadow-md transform scale-[1.02]'
                                                    : 'border-transparent bg-gray-50 dark:bg-gray-900 hover:border-gray-200 dark:hover:border-gray-700'
                                                }`}
                                        >
                                            <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-4 leading-relaxed font-medium">
                                                "{t}"
                                            </p>
                                            {isSelected && (
                                                <div className="absolute top-2 right-2 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center">
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
