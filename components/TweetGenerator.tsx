'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { generateOptionsAction, postCreativeTweet, generateImagePreview } from '@/app/actions/thread';
import { checkAndRunAutoPilot, toggleAutoPilot, getAutoPilotState } from '@/app/actions/autopilot';

interface TweetOptions {
    hook: string;
    value: string;
    thread: string[];
    imagePrompts?: string[];
}

export default function TweetGenerator() {
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [options, setOptions] = useState<TweetOptions | null>(null);
    const [publishingType, setPublishingType] = useState<'hook' | 'value' | 'thread' | null>(null);

    // Map of index -> base64 image
    const [previewImages, setPreviewImages] = useState<Record<number, string>>({});
    const [generatingImages, setGeneratingImages] = useState<Record<number, boolean>>({});

    // Modal State
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    // Auto Pilot State
    const [isAutoPilotOn, setIsAutoPilotOn] = useState(false);
    const [autoPilotStatus, setAutoPilotStatus] = useState<string>("Idle");
    const [lastAutoPilotCheck, setLastAutoPilotCheck] = useState<Date | null>(null);

    // Initialize Auto Pilot State
    useEffect(() => {
        getAutoPilotState().then(state => {
            setIsAutoPilotOn(state.isActive);
            if (state.lastRunTime) setLastAutoPilotCheck(new Date(state.lastRunTime));
        });
    }, []);

    // Auto Pilot Scheduler (Client-Side Driver)
    useEffect(() => {
        let interval: NodeJS.Timeout;

        if (isAutoPilotOn) {
            // Run immediately on enable (optional, maybe too aggressive? Let's wait for interval)
            // interval = setInterval(runCheck, 1000 * 60 * 60); // Every hour
            // For Demo/Testing: Every 60 seconds
            const runCheck = async () => {
                setAutoPilotStatus("Checking...");
                try {
                    const res = await checkAndRunAutoPilot();
                    setLastAutoPilotCheck(new Date());

                    if (res.success) {
                        if (res.posted) {
                            toast.success(`AutoPilot: Posted update! (${res.commits} commits)`);
                            setAutoPilotStatus(`Posted at ${new Date().toLocaleTimeString()}`);
                        } else {
                            setAutoPilotStatus(`Checked at ${new Date().toLocaleTimeString()} (No new changes)`);
                        }
                    } else {
                        setAutoPilotStatus(`Error: ${res.error || res.reason}`);
                    }
                } catch (e) {
                    setAutoPilotStatus("Error executing check");
                }
            };

            // Run one check nicely after 5s to verify functionality
            const initialTimeout = setTimeout(runCheck, 5000);

            interval = setInterval(runCheck, 60000); // Check every minute

            return () => {
                clearInterval(interval);
                clearTimeout(initialTimeout);
            };
        } else {
            setAutoPilotStatus("Disabled");
        }

        return () => clearInterval(interval);
    }, [isAutoPilotOn]);

    const toggleAutoPilotHandler = async () => {
        const newState = !isAutoPilotOn;
        setIsAutoPilotOn(newState);
        await toggleAutoPilot(newState);
        toast.success(newState ? "Auto Pilot Enabled" : "Auto Pilot Disabled");
    };

    const handleGenerate = async () => {
        if (!input.trim()) return;
        setIsLoading(true);
        setOptions(null);
        setPreviewImages({});
        setGeneratingImages({});

        try {
            const result = await generateOptionsAction(input);
            if (result.success && result.data) {
                const data = result.data as TweetOptions;
                setOptions(data);
                toast.success("Ideas generated!");

                // Trigger generation for ALL available prompts
                if (data.imagePrompts && Array.isArray(data.imagePrompts)) {
                    data.imagePrompts.forEach((prompt: string, index: number) => {
                        generatePreview(prompt, index);
                    });
                }
            } else {
                toast.error("Failed to generate ideas");
            }
        } catch (_) {
            toast.error("Error generating options");
        } finally {
            setIsLoading(false);
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
        if (!options) return;
        setPublishingType(type);
        toast.loading(`Publishing ${type}...`, { id: 'pub' });

        try {
            let content: string | string[];
            if (type === 'thread') content = options.thread;
            else if (type === 'hook') content = options.hook;
            else content = options.value;

            // Pass the full array of prompts if it's a thread
            const imagePrompts = type === 'thread' ? options.imagePrompts : undefined;

            const res = await postCreativeTweet(content, type, imagePrompts);
            if (res.success) {
                toast.success("Published successfully!", { id: 'pub' });
            } else {
                toast.error("Publish failed: " + res.error, { id: 'pub' });
            }
        } catch (_) {
            toast.error("Publish error", { id: 'pub' });
        } finally {
            setPublishingType(null);
        }
    };

    return (
        <div className="w-full max-w-5xl mx-auto p-6 bg-white dark:bg-black/20 rounded-2xl border border-gray-200 dark:border-gray-800">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
                    ✨ Creative Tweet Composer
                </h2>

                {/* Auto Pilot Control */}
                <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-full">
                    <div className="flex flex-col items-end mr-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Auto Pilot</span>
                        <span className="text-[10px] text-gray-400 whitespace-nowrap">{autoPilotStatus}</span>
                    </div>
                    <button
                        onClick={toggleAutoPilotHandler}
                        className={`w-10 h-6 rounded-full transition-colors relative ${isAutoPilotOn ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
                        <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${isAutoPilotOn ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                </div>
            </div>

            <div className="flex gap-4 items-start flex-col sm:flex-row">
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="What do you want to post about?"
                    className="flex-1 w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 min-h-[100px] focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                />
                <div className="flex flex-col gap-2 min-w-[140px]">
                    <button
                        onClick={handleGenerate}
                        disabled={isLoading || !input.trim()}
                        className="w-full px-6 py-4 bg-black dark:bg-white text-white dark:text-black font-bold rounded-xl hover:opacity-80 disabled:opacity-50 transition-all whitespace-nowrap"
                    >
                        {isLoading ? 'Thinking...' : 'Generate ➜'}
                    </button>
                    <button
                        onClick={async () => {
                            try {
                                setIsLoading(true);
                                const { analyzeProjectStatus } = await import('@/app/actions/git');
                                toast.loading("Scanning project...", { id: 'scan' });

                                // 1. Get Git Status
                                const res = await analyzeProjectStatus();
                                if (res.success && res.summary) {
                                    setInput(res.summary);
                                    toast.loading("Generating viral tweets...", { id: 'scan' });

                                    // 2. Auto-Generate Options
                                    const genRes = await generateOptionsAction(res.summary);
                                    if (genRes.success && genRes.data) {
                                        const data = genRes.data as TweetOptions;
                                        setOptions(data);
                                        // Auto-fetch images
                                        if (data.imagePrompts && Array.isArray(data.imagePrompts)) {
                                            data.imagePrompts.forEach((p, i) => generatePreview(p, i));
                                        }
                                        toast.success("Ready to publish!", { id: 'scan' });
                                    }
                                } else {
                                    toast.error("Scan failed", { id: 'scan' });
                                }
                            } catch (_) {
                                toast.error("Auto-gen failed", { id: 'scan' });
                            } finally {
                                setIsLoading(false);
                            }
                        }}
                        className="w-full px-4 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 font-semibold rounded-xl hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-all text-sm flex items-center justify-center gap-2"
                    >
                        <span>🔮</span> Auto-Scan & Generate
                    </button>
                </div>
            </div>

            {options && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
                    {/* Hook Card */}
                    <div className="bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-800/30 rounded-xl p-5 flex flex-col gap-4">
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-bold uppercase tracking-wider text-orange-600">The Hook</span>
                        </div>
                        <p className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-snug">
                            {options.hook}
                        </p>
                        <div className="pt-4 mt-auto border-t border-orange-200 dark:border-orange-800/30">
                            <button onClick={() => handlePublish('hook')} disabled={!!publishingType} className="w-full py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                                {publishingType === 'hook' ? 'Posting...' : 'Post Hook'}
                            </button>
                        </div>
                    </div>

                    {/* Value Card */}
                    <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30 rounded-xl p-5 flex flex-col gap-4">
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-bold uppercase tracking-wider text-blue-600">The Value</span>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">
                            {options.value}
                        </p>
                        <div className="pt-4 mt-auto border-t border-blue-200 dark:border-blue-800/30">
                            <button onClick={() => handlePublish('value')} disabled={!!publishingType} className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                                {publishingType === 'value' ? 'Posting...' : 'Post Value'}
                            </button>
                        </div>
                    </div>

                    {/* Thread Card */}
                    <div className="bg-purple-50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-800/30 rounded-xl p-5 flex flex-col gap-4 row-span-1 md:col-span-1">
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-bold uppercase tracking-wider text-purple-600">The Thread</span>
                            <span className="text-[10px] bg-purple-200 text-purple-700 px-2 py-0.5 rounded-full">Multi-Image</span>
                        </div>

                        <div className="space-y-6">
                            {options.thread.map((t, i) => (
                                <div key={i} className="flex flex-col gap-3">
                                    <div className="flex gap-2 text-sm text-gray-700 dark:text-gray-300">
                                        <span className="text-purple-400 font-mono select-none flex-shrink-0">{i + 1}.</span>
                                        <p>{t}</p>
                                    </div>

                                    {/* Per-Tweet Image Preview */}
                                    <div
                                        className="ml-6 w-32 aspect-square bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden flex items-center justify-center relative border border-gray-200 dark:border-gray-700 cursor-pointer hover:opacity-90 transition-opacity hover:ring-2 hover:ring-purple-500"
                                        onClick={() => previewImages[i] && setSelectedImage(previewImages[i])}
                                    >
                                        {previewImages[i] ? (
                                            <img src={previewImages[i]} alt={`Tweet ${i + 1}`} className="w-full h-full object-cover" />
                                        ) : generatingImages[i] ? (
                                            <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                                        ) : (
                                            <span className="text-[10px] text-gray-400">Wait...</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="pt-4 mt-auto border-t border-purple-200 dark:border-purple-800/30">
                            <button onClick={() => handlePublish('thread')} disabled={!!publishingType} className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                                {publishingType === 'thread' ? 'Weaving Thread...' : 'Post Thread'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Full Screen Image Modal */}
            {selectedImage && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setSelectedImage(null)}
                >
                    <div className="relative max-w-4xl w-full max-h-[90vh] flex items-center justify-center" onClick={e => e.stopPropagation()}>
                        <img
                            src={selectedImage}
                            alt="Full size preview"
                            className="max-w-full max-h-[90vh] rounded-xl shadow-2xl object-contain border border-white/10"
                        />
                        <button
                            onClick={() => setSelectedImage(null)}
                            className="absolute -top-12 right-0 text-white hover:text-gray-300 p-2 bg-black/50 rounded-full transition-colors"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
