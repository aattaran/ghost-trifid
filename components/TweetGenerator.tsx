'use client';

import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { generateOptionsAction, postCreativeTweet, generateImagePreview } from '@/app/actions/thread';
import { fetchAndSummarizeRepo } from '@/app/actions/github';
import { fetchViralTweetsAction } from '@/app/actions/twitter-content';
import { checkAndRunAutoPilot, toggleAutoPilot, getAutoPilotState } from '@/app/actions/autopilot';

// Shadcn UI Imports
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"; // Note: We might control open state programmatically

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
    // Core Workflow State - Creator Studio (Manual)
    // -------------------------------------------------------------
    const [manualInput, setManualInput] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [activePanel, setActivePanel] = useState<'creator' | 'autopilot'>('creator');

    // Inspiration State
    const [viralTopic, setViralTopic] = useState('');
    const [viralTweets, setViralTweets] = useState<ViralTweet[]>([]);
    const [selectedViralTweets, setSelectedViralTweets] = useState<string[]>([]);
    const [isFetchingViral, setIsFetchingViral] = useState(false);

    // Generation State
    const [generatedOptions, setGeneratedOptions] = useState<TweetOptions | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [previewImages, setPreviewImages] = useState<Record<number, string>>({});
    const [generatingImages, setGeneratingImages] = useState<Record<number, boolean>>({});
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [publishingType, setPublishingType] = useState<'hook' | 'value' | 'thread' | null>(null);

    // -------------------------------------------------------------
    // Auto Pilot State (Autonomous)
    // -------------------------------------------------------------
    const [isAutoPilotOn, setIsAutoPilotOn] = useState(false);
    const [autoPilotStatus, setAutoPilotStatus] = useState<string>("Idle");
    const [autoPilotRepo, setAutoPilotRepo] = useState('');
    const [lastChecked, setLastChecked] = useState<string>('-');
    const [logs, setLogs] = useState<string[]>([]);
    const [foundCommits, setFoundCommits] = useState<string[]>([]);

    // Ref to track if generation is active
    const isGeneratingRef = useRef(false);

    // Abort Controller
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
            if (state.lastRunTime) setLastChecked(new Date(state.lastRunTime).toLocaleTimeString());
        });
    }, []);

    // Auto Pilot Scheduler (Frontend Polling for Status Only)
    useEffect(() => {
        if (!isAutoPilotOn) {
            setAutoPilotStatus("Disabled");
            return;
        }

        // Pause monitoring if we are in Creator Mode
        if (activePanel === 'creator') {
            setAutoPilotStatus("Paused (Creator Mode)");
            return;
        }

        if (autoPilotStatus === "Idle" || autoPilotStatus === "Disabled" || autoPilotStatus === "Paused (Creator Mode)") {
            setAutoPilotStatus("Active (Monitoring)");
        }

        const runCheck = async () => {
            setAutoPilotStatus("Checking...");
            try {
                const res = await checkAndRunAutoPilot();
                setLastChecked(new Date().toLocaleTimeString());

                // Update logs and commits if available
                if (res.logs && Array.isArray(res.logs)) setLogs(res.logs);
                if (res.foundCommits && Array.isArray(res.foundCommits)) setFoundCommits(res.foundCommits);

                if (res.success) {
                    setAutoPilotStatus(res.posted ? "Posted Update!" : "Checked - No Triggers");
                } else {
                    setAutoPilotStatus("Error: " + res.error);
                }
            } catch (e) {
                setAutoPilotStatus("Error");
                setLogs(prev => [...prev, "Critical error during check cycle."]);
            }
        };

        const interval = setInterval(runCheck, 300000); // 5 mins

        // Immediate check if we just switched back
        // runCheck(); 

        return () => clearInterval(interval);
    }, [isAutoPilotOn, activePanel]);


    // -------------------------------------------------------------
    // Manual Actions
    // -------------------------------------------------------------
    const handleAnalyzeAndGenerate = async () => {
        if (!manualInput.trim()) {
            toast.error("Please enter a prompt or repo URL");
            return;
        }

        let context = manualInput;
        const isRepo = manualInput.includes('github.com') || (manualInput.split('/').length === 2 && !manualInput.includes(' '));

        if (isRepo) {
            setIsAnalyzing(true);
            toast.loading(`Analyzing repo...`, { id: 'analyze' });
            try {
                const match = manualInput.match(/github\.com\/([^\/]+\/[^\/\s]+)/);
                const repoPath = match ? match[1] : manualInput.trim();
                const res = await fetchAndSummarizeRepo(repoPath);

                if (res.success && res.summary) {
                    context = res.summary;
                    toast.success("Repo analyzed!", { id: 'analyze' });

                    if (res.repoName) {
                        const topic = res.repoName.split('/')[1];
                        setViralTopic(topic);
                        handleFetchViral(topic);
                    }

                } else {
                    toast.error(res.error || "Failed to fetch repo", { id: 'analyze' });
                    setIsAnalyzing(false);
                    return;
                }
            } catch (e) {
                toast.error("Repo fetch failed", { id: 'analyze' });
                setIsAnalyzing(false);
                return;
            } finally {
                setIsAnalyzing(false);
            }
        }

        handleGenerate(context);
    };


    const handleFetchViral = async (topicOverride?: string) => {
        const topic = topicOverride || viralTopic;
        if (!topic) return;

        setIsFetchingViral(true);
        try {
            const res = await fetchViralTweetsAction(topic);
            if (res.success && res.tweets) {
                setViralTweets(res.tweets as ViralTweet[]);
                setSelectedViralTweets(res.tweets.map((t: any) => t.text));
            } else {
                toast.error("Could not find viral tweets");
            }
        } catch (e) {
            toast.error("Error searching viral tweets");
        } finally {
            setIsFetchingViral(false);
        }
    };

    const handleGenerate = async (context: string) => {
        setIsGenerating(true);
        isGeneratingRef.current = true;
        setGeneratedOptions(null);
        setPreviewImages({});

        try {
            let finalPrompt = context;

            if (selectedViralTweets.length > 0) {
                const styleSection = `\n\n**Viral Inspiration (Style References):**\nUse the tone and hook style of these high-performing tweets as a guide:\n${selectedViralTweets.map(t => `- "${t.replace(/\n/g, ' ')}"`).join('\n')}`;
                finalPrompt += styleSection;
            }

            const result = await generateOptionsAction(finalPrompt);

            if (!isGeneratingRef.current) return;

            if (result.success && result.data) {
                const data = result.data as TweetOptions;
                setGeneratedOptions(data);
                toast.success("Generated!");
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
                setPreviewImages(prev => ({ ...prev, [index]: res.image! }));
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

    // -------------------------------------------------------------
    // Autopilot Actions
    // -------------------------------------------------------------
    const handleForceScan = async () => {
        if (!autoPilotRepo) {
            toast.error("Set a repo first");
            return;
        }
        toast.loading("Force scanning...", { id: 'scan' });
        try {
            const res = await checkAndRunAutoPilot();
            setLastChecked(new Date().toLocaleTimeString());
            if (res.success) {
                if (res.posted) {
                    toast.success("Found commits & posted!", { id: 'scan' });
                    setAutoPilotStatus("Posted Update!");
                } else {
                    toast.success("Checked - No new triggers", { id: 'scan' });
                    setAutoPilotStatus("Checked - No Triggers");
                }
            } else {
                toast.error("Scan failed: " + res.error, { id: 'scan' });
                setAutoPilotStatus("Error");
            }
        } catch (e) {
            toast.error("Scan failed", { id: 'scan' });
            setAutoPilotStatus("Error");
        }
    }

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
        <div className="w-full max-w-6xl mx-auto p-4 md:p-8 space-y-12">

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
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">

                {/* ------------------------------------------- */}
                {/* LEFT PANEL: CREATOR STUDIO (MANUAL)         */}
                {/* ------------------------------------------- */}
                <Card
                    className={`transition-all duration-300 cursor-pointer ${activePanel === 'creator' ? 'ring-4 ring-blue-500/10 border-blue-500 shadow-xl shadow-blue-900/10' : 'opacity-60 scale-95 hover:opacity-90 hover:scale-[0.98]'}`}
                    onClick={() => setActivePanel('creator')}
                >
                    <CardHeader className="flex flex-row items-center gap-4 pb-2">
                        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white text-lg">✨</div>
                        <div>
                            <CardTitle>Creator Studio</CardTitle>
                            <CardDescription>Draft a post or summarize a repo instantly.</CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Textarea
                            value={manualInput}
                            onChange={(e) => setManualInput(e.target.value)}
                            placeholder="Write a topic, paste a code snippet, or enter a GitHub URL..."
                            className="min-h-[140px] text-lg"
                        />
                        <div className="flex justify-end">
                            <Button
                                onClick={handleAnalyzeAndGenerate}
                                disabled={!manualInput.trim() || isAnalyzing || isGenerating}
                                className="bg-blue-600 hover:bg-blue-700 font-bold"
                            >
                                {isAnalyzing ? 'Analyzing Repo...' : isGenerating ? 'Dreaming...' : 'Analyze & Generate ⚡'}
                            </Button>
                        </div>
                    </CardContent>

                    {/* Optional: Inspiration Panel */}
                    {viralTopic && (
                        <CardFooter className="flex-col items-start pt-0">
                            <div className="w-full bg-purple-50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-800 rounded-xl p-4 animate-in fade-in">
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="font-bold text-purple-600 dark:text-purple-400 text-xs uppercase tracking-wide">Vibe Match: {viralTopic}</h3>
                                    <Button variant="ghost" size="sm" onClick={() => handleFetchViral()} disabled={isFetchingViral} className="h-6 text-xs text-purple-500">Refresh</Button>
                                </div>
                                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                    {viralTweets.map(t => (
                                        <div key={t.id}
                                            onClick={() => toggleViralSelection(t.text)}
                                            className={`min-w-[200px] p-3 rounded-lg border cursor-pointer transition-all text-xs bg-white dark:bg-black/50 ${selectedViralTweets.includes(t.text) ? 'border-purple-500 ring-1 ring-purple-500' : 'border-gray-200 dark:border-gray-700'}`}
                                        >
                                            <p className="line-clamp-3">"{t.text}"</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </CardFooter>
                    )}
                </Card>


                {/* ------------------------------------------- */}
                {/* RIGHT PANEL: AUTOPILOT CONTROL (BOT)        */}
                {/* ------------------------------------------- */}
                <Card
                    className={`transition-all duration-300 cursor-pointer relative overflow-hidden ${activePanel === 'autopilot' ? 'ring-4 ring-green-500/10 border-green-500 shadow-xl shadow-green-900/10' : 'opacity-60 scale-95 hover:opacity-90 hover:scale-[0.98]'}`}
                    onClick={() => setActivePanel('autopilot')}
                >
                    {isAutoPilotOn && (
                        <div className="absolute top-4 right-4">
                            <Badge variant="outline" className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800 animate-pulse gap-2">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                </span>
                                Live Monitoring
                            </Badge>
                        </div>
                    )}

                    <CardHeader className="flex flex-row items-center gap-4 pb-2">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-lg transition-colors ${isAutoPilotOn ? 'bg-green-600' : 'bg-gray-400'}`}>🤖</div>
                        <div>
                            <CardTitle>Autopilot Control</CardTitle>
                            <CardDescription>Automatically monitors a repo.</CardDescription>
                        </div>
                    </CardHeader>

                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <Label className="text-xs uppercase tracking-wide text-gray-500">Target Repository</Label>
                            <Input
                                value={autoPilotRepo}
                                onChange={(e) => setAutoPilotRepo(e.target.value)}
                                placeholder="owner/repo"
                                className="font-mono"
                            />
                        </div>

                        <div className="flex items-center justify-between bg-secondary/20 p-4 rounded-xl border border-secondary">
                            <div className="space-y-0.5">
                                <div className="text-sm font-bold">Master Switch</div>
                                <div className="text-xs text-muted-foreground">Enable background monitoring</div>
                            </div>
                            <Switch
                                checked={isAutoPilotOn}
                                onCheckedChange={(checked) => {
                                    setIsAutoPilotOn(checked);
                                    if (checked) setAutoPilotStatus("Active (Monitoring)");
                                    toggleAutoPilot(checked, autoPilotRepo);
                                    toast.success(`AutoPilot ${checked ? 'ON' : 'OFF'}`);
                                }}
                            />
                        </div>

                        <div className="bg-muted/50 rounded-xl p-4 space-y-3 border border-border/50">
                            <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Status</span>
                                <Badge variant={isAutoPilotOn ? 'default' : 'secondary'} className="font-mono">
                                    {autoPilotStatus}
                                </Badge>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Last Checked</span>
                                <span className="font-mono">{lastChecked}</span>
                            </div>
                            <div className="pt-2">
                                <Button
                                    variant="outline"
                                    className="w-full text-xs font-bold uppercase"
                                    onClick={handleForceScan}
                                >
                                    Force Scan Now
                                </Button>
                            </div>
                        </div>

                        {/* Live Activity Log */}
                        {(logs.length > 0 || foundCommits.length > 0) && (
                            <div className="space-y-3 pt-2 animate-in fade-in slide-in-from-top-2">
                                <Label className="text-xs uppercase tracking-wide text-gray-500 flex justify-between">
                                    <span>Live Activity</span>
                                    <span className="text-[10px] text-gray-400 font-mono">
                                        {foundCommits.length > 0 ? `${foundCommits.length} commits found` : 'Scanning...'}
                                    </span>
                                </Label>

                                <div className="bg-black/90 rounded-xl p-4 font-mono text-[10px] md:text-xs text-green-400/90 h-48 overflow-y-auto space-y-1 shadow-inner ring-1 ring-white/10 custom-scrollbar">
                                    {logs.length === 0 && <span className="opacity-50 italic">Waiting for next scheduled check...</span>}
                                    {logs.map((log, i) => (
                                        <div key={i} className="flex gap-2">
                                            <span className="opacity-50 select-none">{'>'}</span>
                                            <span>{log}</span>
                                        </div>
                                    ))}
                                    {foundCommits.length > 0 && (
                                        <div className="mt-4 pt-4 border-t border-white/10 space-y-1">
                                            <div className="text-white/60 mb-2 font-bold px-1 uppercase tracking-wider">New Commits Detected:</div>
                                            {foundCommits.map((commit, i) => (
                                                <div key={`c-${i}`} className="flex gap-2 text-blue-300">
                                                    <span className="opacity-50 select-none">•</span>
                                                    <span className="truncate">{commit}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                    </CardContent>
                </Card>

            </div>

            {/* ------------------------------------------- */}
            {/* OUTPUT AREA (GENERATED CARDS)               */}
            {/* ------------------------------------------- */}

            {generatedOptions && (
                <div className="animate-in slide-in-from-bottom-10 fade-in duration-700 pt-8 border-t border-gray-100 dark:border-gray-800/50">
                    <h3 className="text-2xl font-bold text-center mb-8 bg-gradient-to-r from-gray-900 to-gray-500 bg-clip-text text-transparent">Generated Drafts</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Hook Card */}
                        <Card className="bg-orange-50/50 dark:bg-orange-900/10 border-orange-100 dark:border-orange-900/20 hover:border-orange-300 transition-colors">
                            <CardHeader>
                                <Badge className="w-fit bg-orange-100 text-orange-700 hover:bg-orange-100 border-none">The Hook</Badge>
                            </CardHeader>
                            <CardContent>
                                <p className="text-xl font-black leading-tight">
                                    {generatedOptions.hook}
                                </p>
                            </CardContent>
                            <CardFooter>
                                <Button
                                    className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold"
                                    onClick={() => handlePublish('hook')}
                                    disabled={!!publishingType}
                                >
                                    {publishingType === 'hook' ? 'Posting...' : 'Post Hook'}
                                </Button>
                            </CardFooter>
                        </Card>

                        {/* Value Card */}
                        <Card className="bg-blue-50/50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/20 hover:border-blue-300 transition-colors">
                            <CardHeader>
                                <Badge className="w-fit bg-blue-100 text-blue-700 hover:bg-blue-100 border-none">The Value</Badge>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm font-medium whitespace-pre-line leading-relaxed">
                                    {generatedOptions.value}
                                </p>
                            </CardContent>
                            <CardFooter>
                                <Button
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold"
                                    onClick={() => handlePublish('value')}
                                    disabled={!!publishingType}
                                >
                                    {publishingType === 'value' ? 'Posting...' : 'Post Value'}
                                </Button>
                            </CardFooter>
                        </Card>

                        {/* Thread Card (Full Width) */}
                        <Card className="md:col-span-2 bg-purple-50/50 dark:bg-purple-900/10 border-purple-100 dark:border-purple-900/20 hover:border-purple-300 transition-colors">
                            <CardHeader>
                                <Badge className="w-fit bg-purple-100 text-purple-700 hover:bg-purple-100 border-none">The Thread</Badge>
                            </CardHeader>

                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {generatedOptions.thread.map((t, i) => (
                                        <div key={i} className="flex flex-col gap-3 group">
                                            <div className="bg-background/80 p-4 rounded-xl border h-full">
                                                <div className="flex gap-2 text-sm mb-3">
                                                    <span className="text-purple-500 font-mono font-bold">{i + 1}/</span>
                                                    <p>{t}</p>
                                                </div>

                                                {/* Image Preview */}
                                                <div
                                                    className="w-full aspect-video bg-muted rounded-lg overflow-hidden relative cursor-pointer group-hover:ring-2 ring-purple-500/50 transition-all pb-2/3"
                                                    onClick={() => previewImages[i] && setSelectedImage(previewImages[i])}
                                                >
                                                    {previewImages[i] ? (
                                                        <img src={previewImages[i]} alt={`Tweet ${i + 1}`} className="absolute w-full h-full object-cover" />
                                                    ) : generatingImages[i] ? (
                                                        <div className="absolute inset-0 flex items-center justify-center">
                                                            <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                                                        </div>
                                                    ) : (
                                                        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground font-medium">
                                                            Generating visual...
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>

                            <CardFooter>
                                <Button
                                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold"
                                    onClick={() => handlePublish('thread')}
                                    disabled={!!publishingType}
                                >
                                    <span>🧵</span> {publishingType === 'thread' ? 'Weaving Thread...' : 'Publish Thread Sequence'}
                                </Button>
                            </CardFooter>
                        </Card>
                    </div>
                </div>
            )}

            {/* Lightbox Modal (Using Dialog) */}
            <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
                <DialogContent className="max-w-5xl p-0 overflow-hidden bg-transparent border-none shadow-none">
                    {selectedImage && (
                        <div className="relative w-full h-full flex items-center justify-center" onClick={() => setSelectedImage(null)}>
                            <img
                                src={selectedImage}
                                alt="Full size preview"
                                className="w-full h-auto max-h-[85vh] object-contain rounded-lg shadow-2xl"
                            />
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
