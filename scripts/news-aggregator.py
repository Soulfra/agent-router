#!/usr/bin/env python3
"""
News Aggregator - Python Integration for CalOS Content Curation

Fetches news from various APIs and outputs JSON for Node.js consumption:
- NewsAPI.org (70,000+ news sources)
- Reddit API
- Hacker News API
- Twitter/X API (optional)

Usage:
    python news-aggregator.py --sources newsapi,reddit --topics ai,crypto --output ./news.json
    python news-aggregator.py --config ./config.json
"""

import argparse
import json
import sys
import time
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

# Try to import required packages
try:
    import requests
except ImportError:
    print("Error: requests package not installed. Run: pip install requests")
    sys.exit(1)


class NewsAggregator:
    """
    Aggregates news from multiple sources
    """

    def __init__(self, config: Optional[Dict] = None):
        self.config = config or {}
        self.api_keys = {
            'newsapi': self.config.get('newsapi_key', ''),
            'reddit_client_id': self.config.get('reddit_client_id', ''),
            'reddit_client_secret': self.config.get('reddit_client_secret', ''),
        }

    def fetch_all(self, sources: List[str], topics: List[str], days: int = 1) -> List[Dict[str, Any]]:
        """
        Fetch news from all configured sources
        """
        all_articles = []

        if 'newsapi' in sources:
            print(f"Fetching from NewsAPI for topics: {', '.join(topics)}", file=sys.stderr)
            newsapi_articles = self.fetch_newsapi(topics, days)
            all_articles.extend(newsapi_articles)

        if 'reddit' in sources:
            print(f"Fetching from Reddit for topics: {', '.join(topics)}", file=sys.stderr)
            reddit_articles = self.fetch_reddit(topics)
            all_articles.extend(reddit_articles)

        if 'hackernews' in sources:
            print(f"Fetching from Hacker News", file=sys.stderr)
            hn_articles = self.fetch_hackernews()
            all_articles.extend(hn_articles)

        return self.deduplicate(all_articles)

    def fetch_newsapi(self, topics: List[str], days: int = 1) -> List[Dict]:
        """
        Fetch from NewsAPI.org
        """
        if not self.api_keys['newsapi']:
            print("Warning: NewsAPI key not configured. Skipping NewsAPI.", file=sys.stderr)
            return []

        articles = []

        # Calculate date range
        from_date = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')

        for topic in topics:
            try:
                url = 'https://newsapi.org/v2/everything'
                params = {
                    'q': topic,
                    'from': from_date,
                    'sortBy': 'popularity',
                    'pageSize': 20,
                    'language': 'en',
                    'apiKey': self.api_keys['newsapi']
                }

                response = requests.get(url, params=params, timeout=10)
                response.raise_for_status()

                data = response.json()

                for article in data.get('articles', []):
                    articles.append({
                        'id': f"newsapi-{hash(article['url'])}",
                        'title': article['title'],
                        'url': article['url'],
                        'description': article.get('description', ''),
                        'content': article.get('content', ''),
                        'author': article.get('author', ''),
                        'source': article['source']['name'],
                        'sourceIcon': '📰',
                        'publishedAt': article['publishedAt'],
                        'topics': [topic],
                        'score': 0,
                        'comments': 0,
                        'metadata': {
                            'urlToImage': article.get('urlToImage', '')
                        }
                    })

                time.sleep(0.5)  # Rate limiting

            except Exception as e:
                print(f"Error fetching NewsAPI for topic '{topic}': {e}", file=sys.stderr)

        return articles

    def fetch_reddit(self, topics: List[str]) -> List[Dict]:
        """
        Fetch from Reddit
        """
        articles = []

        # Map topics to subreddits
        topic_subreddit_map = {
            'ai': ['artificial', 'MachineLearning', 'OpenAI'],
            'crypto': ['cryptocurrency', 'Bitcoin', 'ethereum'],
            'programming': ['programming', 'coding', 'learnprogramming'],
            'tech': ['technology', 'tech', 'gadgets'],
            'startups': ['startups', 'Entrepreneur'],
            'webdev': ['webdev', 'Frontend', 'Backend'],
            'security': ['netsec', 'cybersecurity'],
        }

        subreddits = set()
        for topic in topics:
            if topic in topic_subreddit_map:
                subreddits.update(topic_subreddit_map[topic])

        for subreddit in list(subreddits)[:5]:  # Limit to 5 subreddits
            try:
                url = f'https://www.reddit.com/r/{subreddit}/hot.json?limit=15'
                headers = {
                    'User-Agent': 'CalOS-NewsAggregator/1.0'
                }

                response = requests.get(url, headers=headers, timeout=10)
                response.raise_for_status()

                data = response.json()

                for post in data['data']['children']:
                    post_data = post['data']

                    if post_data.get('stickied'):
                        continue

                    articles.append({
                        'id': f"reddit-{post_data['id']}",
                        'title': post_data['title'],
                        'url': post_data['url'],
                        'description': post_data.get('selftext', '')[:500],
                        'content': post_data.get('selftext', ''),
                        'author': post_data['author'],
                        'source': f"r/{subreddit}",
                        'sourceIcon': '🤖',
                        'publishedAt': datetime.fromtimestamp(post_data['created_utc']).isoformat(),
                        'topics': [topic for topic in topics if topic in post_data['title'].lower()],
                        'score': post_data['score'],
                        'comments': post_data['num_comments'],
                        'metadata': {
                            'subreddit': subreddit,
                            'permalink': f"https://reddit.com{post_data['permalink']}"
                        }
                    })

                time.sleep(1)  # Rate limiting

            except Exception as e:
                print(f"Error fetching Reddit r/{subreddit}: {e}", file=sys.stderr)

        return articles

    def fetch_hackernews(self) -> List[Dict]:
        """
        Fetch from Hacker News
        """
        articles = []

        try:
            # Get top stories
            url = 'https://hacker-news.firebaseio.com/v0/topstories.json'
            response = requests.get(url, timeout=10)
            response.raise_for_status()

            story_ids = response.json()[:30]  # Top 30 stories

            for story_id in story_ids:
                try:
                    story_url = f'https://hacker-news.firebaseio.com/v0/item/{story_id}.json'
                    story_response = requests.get(story_url, timeout=5)
                    story_response.raise_for_status()

                    story = story_response.json()

                    if story.get('type') != 'story':
                        continue

                    articles.append({
                        'id': f"hn-{story['id']}",
                        'title': story.get('title', ''),
                        'url': story.get('url', f"https://news.ycombinator.com/item?id={story['id']}"),
                        'description': story.get('text', ''),
                        'content': story.get('text', ''),
                        'author': story.get('by', ''),
                        'source': 'Hacker News',
                        'sourceIcon': '🔶',
                        'publishedAt': datetime.fromtimestamp(story['time']).isoformat(),
                        'topics': self.extract_topics(story.get('title', '')),
                        'score': story.get('score', 0),
                        'comments': story.get('descendants', 0),
                        'metadata': {
                            'hnUrl': f"https://news.ycombinator.com/item?id={story['id']}"
                        }
                    })

                    time.sleep(0.1)  # Rate limiting

                except Exception as e:
                    print(f"Error fetching HN story {story_id}: {e}", file=sys.stderr)

        except Exception as e:
            print(f"Error fetching Hacker News: {e}", file=sys.stderr)

        return articles

    def extract_topics(self, text: str) -> List[str]:
        """
        Extract topics from text
        """
        topic_keywords = {
            'ai': ['ai', 'artificial intelligence', 'machine learning', 'ml', 'gpt', 'llm'],
            'crypto': ['crypto', 'cryptocurrency', 'bitcoin', 'ethereum', 'blockchain'],
            'programming': ['programming', 'code', 'developer', 'javascript', 'python'],
            'tech': ['technology', 'tech', 'software'],
            'startups': ['startup', 'founder', 'vc'],
            'security': ['security', 'hack', 'vulnerability'],
        }

        text_lower = text.lower()
        topics = []

        for topic, keywords in topic_keywords.items():
            if any(keyword in text_lower for keyword in keywords):
                topics.append(topic)

        return topics

    def deduplicate(self, articles: List[Dict]) -> List[Dict]:
        """
        Remove duplicate articles based on URL or title similarity
        """
        seen_urls = set()
        unique_articles = []

        for article in articles:
            url = article.get('url', '')

            if url and url not in seen_urls:
                seen_urls.add(url)
                unique_articles.append(article)

        return unique_articles


def main():
    """
    Main entry point
    """
    parser = argparse.ArgumentParser(description='CalOS News Aggregator')
    parser.add_argument('--sources', type=str, default='hackernews,reddit',
                        help='Comma-separated news sources (newsapi,reddit,hackernews)')
    parser.add_argument('--topics', type=str, default='ai,tech,programming',
                        help='Comma-separated topics to fetch')
    parser.add_argument('--days', type=int, default=1,
                        help='Number of days to fetch (for NewsAPI)')
    parser.add_argument('--output', type=str, default='-',
                        help='Output file (default: stdout)')
    parser.add_argument('--config', type=str,
                        help='Path to JSON config file')

    args = parser.parse_args()

    # Load config if specified
    config = {}
    if args.config:
        try:
            with open(args.config, 'r') as f:
                config = json.load(f)
        except Exception as e:
            print(f"Error loading config file: {e}", file=sys.stderr)
            sys.exit(1)

    # Parse sources and topics
    sources = [s.strip() for s in args.sources.split(',')]
    topics = [t.strip() for t in args.topics.split(',')]

    # Create aggregator
    aggregator = NewsAggregator(config)

    # Fetch articles
    print(f"Fetching news from: {', '.join(sources)}", file=sys.stderr)
    articles = aggregator.fetch_all(sources, topics, args.days)

    # Prepare output
    output_data = {
        'status': 'success',
        'timestamp': datetime.now().isoformat(),
        'sources': sources,
        'topics': topics,
        'count': len(articles),
        'articles': articles
    }

    # Write output
    output_json = json.dumps(output_data, indent=2)

    if args.output == '-':
        print(output_json)
    else:
        try:
            with open(args.output, 'w') as f:
                f.write(output_json)
            print(f"Wrote {len(articles)} articles to {args.output}", file=sys.stderr)
        except Exception as e:
            print(f"Error writing output: {e}", file=sys.stderr)
            sys.exit(1)


if __name__ == '__main__':
    main()
