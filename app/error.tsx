'use client';

import { useEffect } from 'react';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log the error to an error reporting service
        console.error('Application Error:', error);
    }, [error]);

    return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 space-y-4">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                Something went wrong!
            </h2>
            <p className="text-gray-500 max-w-md text-center">
                {error.message || "An unexpected error occurred."}
            </p>
            <button
                onClick={
                    // Attempt to recover by trying to re-render the segment
                    () => reset()
                }
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors"
            >
                Try again
            </button>
        </div>
    );
}
