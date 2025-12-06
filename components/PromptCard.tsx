'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { sharePromptOnTwitter } from '@/app/actions/twitter';

interface Prompt {
    id: string;
    title: string;
    content: string;
}

export default function PromptCard({ prompt }: { prompt: Prompt }) {
    const [isSharing, setIsSharing] = useState(false);
    const [isThreading, setIsThreading] = useState(false);

    const handleShare = async () => {
        setIsSharing(true);
        try {
            const result = await sharePromptOnTwitter(prompt.id);

            if (result.success) {
                toast.success('Tweet published successfully!');
            } else {
                toast.error('Failed to tweet: ' + (result.error || 'Unknown error'));
            }
        } catch (e) {
            toast.error('Something went wrong');
            console.error(e);
        } finally {
            setIsSharing(false);
        }
    };

    const handleThread = async () => {
        setIsThreading(true);
        toast.loading("Weaving thread & generating Imagen 4.0 images...", { id: 'thread-loading' });

        try {
            // Import new action
            const { postCreativeTweet } = await import('@/app/actions/thread');

            // Construct content for thread
            // We'll pass an array to simulate a thread structure from the single prompt content
            const threadContent = [
                `🚀 ${prompt.title}\n\n${prompt.content.slice(0, 50)}...\n\n#Antigravity`,
                `💡 Insight:\n\n${prompt.content}`,
                `🔗 Try it yourself: antigravity.dev`
            ];

            // Call new universal action
            const result = await postCreativeTweet(threadContent, 'thread', prompt.title);

            if (result.success) {
                toast.success('Thread published with Image!', { id: 'thread-loading' });
            } else {
                toast.error('Thread failed: ' + result.error, { id: 'thread-loading' });
            }
        } catch (e) {
            toast.error('Thread error', { id: 'thread-loading' });
            console.error(e);
        } finally {
            setIsThreading(false);
        }
    };

    return (
        <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow bg-white dark:bg-gray-900 max-w-md w-full">
            <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-gray-100">{prompt.title}</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                {prompt.content}
            </p>

            <div className="flex gap-3 mt-4 flex-wrap">
                {/* Mock Copy Button */}
                <button className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors">
                    Copy
                </button>

                {/* Share Button (Single Tweet) */}
                <button
                    onClick={handleShare}
                    disabled={isSharing}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-black rounded hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {isSharing ? 'Sharing...' : (
                        <>
                            <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4 fill-current">
                                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                            </svg>
                            Share
                        </>
                    )}
                </button>

                {/* Thread Button (With AI Images) */}
                <button
                    onClick={handleThread}
                    disabled={isThreading}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-pink-600 rounded hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {isThreading ? 'Weaving...' : (
                        <>
                            <span>✨</span> Thread
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
