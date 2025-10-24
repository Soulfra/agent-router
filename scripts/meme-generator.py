#!/usr/bin/env python3
"""
CALOS Meme Generator - Python SDK

Usage as CLI:
  python meme-generator.py list                    # List available templates
  python meme-generator.py generate npm-install    # Generate a meme
  python meme-generator.py stats                   # Check usage stats
  python meme-generator.py batch                   # Generate all templates

Usage as Library:
  from meme_generator import MemeGeneratorClient

  client = MemeGeneratorClient('http://localhost:5001')
  templates = client.list_templates()
  meme = client.generate('npm-install')
  client.save_meme(meme, 'output.gif')
"""

import requests
import json
import base64
import sys
import os
from typing import Dict, List, Optional
from pathlib import Path


class MemeGeneratorClient:
    """Python client for CALOS Meme Generator API"""

    def __init__(self, base_url: str = 'http://localhost:5001'):
        self.base_url = base_url.rstrip('/')
        self.api_url = f'{self.base_url}/api/public/memes'
        self.session = requests.Session()

    def _request(self, method: str, endpoint: str, **kwargs) -> Dict:
        """Make HTTP request to API"""
        url = f'{self.api_url}{endpoint}'
        response = self.session.request(method, url, **kwargs)

        # Check rate limits
        if 'X-RateLimit-Remaining' in response.headers:
            remaining = response.headers['X-RateLimit-Remaining']
            if int(remaining) < 10:
                print(f'⚠️  Warning: Only {remaining} requests remaining')

        if response.status_code == 429:
            raise Exception(f'Rate limit exceeded. Reset at: {response.json().get("resetInHours", "?")} hours')

        response.raise_for_status()
        return response.json()

    def list_templates(self) -> List[Dict]:
        """List all available meme templates"""
        data = self._request('GET', '/templates')
        return data['templates']

    def generate(self, template_id: str, format: str = 'both', quality: str = 'medium') -> Dict:
        """
        Generate a meme from template

        Args:
            template_id: Template ID (e.g., 'npm-install')
            format: 'both', 'gif', or 'mp4'
            quality: 'high', 'medium', or 'low'

        Returns:
            Meme data with base64-encoded GIF and MP4
        """
        data = self._request('POST', f'/generate/{template_id}', json={
            'format': format,
            'quality': quality
        })
        return data

    def get_stats(self) -> Dict:
        """Get API usage statistics"""
        return self._request('GET', '/stats')

    def health_check(self) -> bool:
        """Check if API is healthy"""
        try:
            data = self._request('GET', '/health')
            return data.get('success', False)
        except:
            return False

    def save_meme(self, meme_data: Dict, output_path: str, format: str = 'gif'):
        """
        Save meme to file

        Args:
            meme_data: Meme data from generate()
            output_path: Output file path
            format: 'gif' or 'mp4'
        """
        if format not in meme_data:
            raise ValueError(f'Format {format} not in meme data. Available: {list(meme_data.keys())}')

        # Extract base64 data
        data_url = meme_data[format]['dataUrl']

        # Remove data URL prefix (e.g., "data:image/gif;base64,")
        if ',' in data_url:
            base64_data = data_url.split(',', 1)[1]
        else:
            base64_data = data_url

        # Decode and save
        binary_data = base64.b64decode(base64_data)

        with open(output_path, 'wb') as f:
            f.write(binary_data)

        print(f'✅ Saved {format.upper()} to {output_path} ({meme_data[format]["sizeMB"]} MB)')


def cli_list_templates(client: MemeGeneratorClient):
    """CLI: List all templates"""
    templates = client.list_templates()

    print(f'\n🎨 Available Templates ({len(templates)} total):\n')

    for template in templates:
        print(f'  {template["id"]:20s}  {template["name"]}')
        print(f'  {"":20s}  {template["description"]}')
        print(f'  {"":20s}  Category: {template["category"]}, Frames: {template["frameCount"]}')
        print(f'  {"":20s}  {", ".join(template["hashtags"])}')
        print()


def cli_generate(client: MemeGeneratorClient, template_id: str, output_dir: str = './output'):
    """CLI: Generate a single meme"""
    print(f'\n🎨 Generating meme: {template_id}...')

    # Generate meme
    result = client.generate(template_id)

    if not result.get('success'):
        print(f'❌ Failed: {result.get("error", "Unknown error")}')
        return

    # Create output directory
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    # Save both formats
    gif_path = f'{output_dir}/{template_id}.gif'
    mp4_path = f'{output_dir}/{template_id}.mp4'

    client.save_meme(result, gif_path, 'gif')
    client.save_meme(result, mp4_path, 'mp4')

    print(f'\n📝 Caption: {result["caption"]}')
    print(f'🐦 Share: {result["shareText"]}')
    print(f'#️⃣  Tags: {", ".join(result["hashtags"])}')


def cli_batch(client: MemeGeneratorClient, output_dir: str = './output'):
    """CLI: Generate all templates"""
    templates = client.list_templates()

    print(f'\n🚀 Batch generating {len(templates)} memes...\n')

    for i, template in enumerate(templates, 1):
        template_id = template['id']
        print(f'[{i}/{len(templates)}] Generating {template_id}...')

        try:
            cli_generate(client, template_id, output_dir)
        except Exception as e:
            print(f'❌ Failed to generate {template_id}: {e}')

        print()

    print(f'✅ Batch generation complete! Output: {output_dir}/')


def cli_stats(client: MemeGeneratorClient):
    """CLI: Show usage statistics"""
    stats = client.get_stats()

    usage = stats['usage']

    print('\n📊 API Usage Statistics:\n')
    print(f'  Used:      {usage["used"]}/{usage["limit"]} requests')
    print(f'  Remaining: {usage["remaining"]} requests')
    print(f'  Resets:    {usage["resetAt"]}')

    if usage['remaining'] < 10:
        print(f'\n⚠️  Warning: Low on requests!')


def main():
    """CLI entry point"""
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1]

    # Check for custom base URL
    base_url = os.environ.get('CALOS_API_URL', 'http://localhost:5001')
    client = MemeGeneratorClient(base_url)

    # Check API health
    if not client.health_check():
        print(f'❌ API is not responding at {base_url}')
        print(f'   Make sure the server is running on port 5001')
        sys.exit(1)

    # Route commands
    if command == 'list':
        cli_list_templates(client)

    elif command == 'generate':
        if len(sys.argv) < 3:
            print('Usage: python meme-generator.py generate <template-id>')
            sys.exit(1)
        template_id = sys.argv[2]
        output_dir = sys.argv[3] if len(sys.argv) > 3 else './output'
        cli_generate(client, template_id, output_dir)

    elif command == 'batch':
        output_dir = sys.argv[2] if len(sys.argv) > 2 else './output'
        cli_batch(client, output_dir)

    elif command == 'stats':
        cli_stats(client)

    else:
        print(f'❌ Unknown command: {command}')
        print(__doc__)
        sys.exit(1)


if __name__ == '__main__':
    main()
