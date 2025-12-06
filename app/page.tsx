import { Toaster } from 'react-hot-toast';
import PromptCard from '@/components/PromptCard';
import TweetGenerator from '@/components/TweetGenerator';

export default function Home() {
  const examplePrompts = [
    {
      id: 'mock-id-1',
      title: 'The Creative Spark',
      content: 'Creativity is seeing what others see and thinking what no one else has thought. Unlock your potential by embracing the unknown.'
    },
    {
      id: 'mock-id-2',
      title: 'Code Poetry',
      content: 'Good code is like a poem: concise, expressive, and moving. Write code that future you will enjoy reading.'
    }
  ];

  return (
    <main className="flex min-h-screen flex-col items-center p-8 bg-gray-50 dark:bg-black gap-12">
      <div className="w-full max-w-5xl flex flex-col items-center gap-8">
        <h1 className="text-4xl font-extrabold tracking-tight text-center">Antigravity Prompts</h1>

        {/* New Feature */}
        <TweetGenerator />

        <div className="w-full h-px bg-gray-200 dark:bg-gray-800" />

        <h2 className="text-xl font-semibold text-gray-400">Library Prompts</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
          {examplePrompts.map(prompt => (
            <PromptCard key={prompt.id} prompt={prompt} />
          ))}
        </div>
      </div>

      <Toaster position="bottom-right" />
    </main>
  );
}
