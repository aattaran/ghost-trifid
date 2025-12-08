// Quick test to see what's wrong with GitHub API
const owner = 'aattaran';
const repo = 'tiktok';

async function test() {
    try {
        const url = `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`;
        console.log('Fetching:', url);

        const res = await fetch(url, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Antigravity-Agent'
            }
        });

        console.log('Status:', res.status, res.statusText);
        console.log('Rate limit remaining:', res.headers.get('x-ratelimit-remaining'));

        if (!res.ok) {
            const text = await res.text();
            console.log('Error response:', text);
            return;
        }

        const data = await res.json();
        console.log('Success! Latest commit:', data[0]?.sha);
        console.log('Commit message:', data[0]?.commit?.message);

    } catch (error) {
        console.error('Fetch error:', error);
    }
}

test();
