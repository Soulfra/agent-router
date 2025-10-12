/**
 * Hacker News Parser
 *
 * Parses different HN page types into normalized JSON format.
 * Handles:
 * - Story listings (front page, new, best, ask, show, jobs)
 * - Discussion threads (item pages with nested comments)
 * - Job postings (jobs page)
 * - User profiles
 */

const cheerio = require('cheerio');

class HNParser {
  /**
   * Parse HN page based on URL and HTML
   * @param {string} url - Page URL
   * @param {string} html - Page HTML
   * @returns {object} - Parsed data
   */
  parse(url, html) {
    const $ = cheerio.load(html);

    // Determine page type
    if (url.includes('/item?id=')) {
      return this.parseThread(url, $);
    } else if (url.includes('/user?id=')) {
      return this.parseUser(url, $);
    } else if (url.includes('/jobs') || url.match(/news\.ycombinator\.com\/?$/)) {
      return this.parseStoryList(url, $);
    } else {
      return this.parseStoryList(url, $); // Default to story list
    }
  }

  /**
   * Parse story listing (front page, new, best, etc.)
   */
  parseStoryList(url, $) {
    const stories = [];

    $('.athing').each((i, elem) => {
      const $elem = $(elem);
      const id = $elem.attr('id');
      const rank = $elem.find('.rank').text().replace('.', '');
      const $titleLine = $elem.find('.titleline');
      const title = $titleLine.find('a').first().text();
      const storyUrl = $titleLine.find('a').first().attr('href');
      const domain = $titleLine.find('.sitestr').text();

      // Get subtext from next row
      const $subtext = $elem.next('.subtext');
      const score = $subtext.find('.score').text().replace(' points', '');
      const author = $subtext.find('.hnuser').text();
      const time = $subtext.find('.age').attr('title') || $subtext.find('.age').text();
      const commentsLink = $subtext.find('a').last();
      const commentsText = commentsLink.text();
      const commentsCount = commentsText.match(/\d+/) ? parseInt(commentsText.match(/\d+/)[0]) : 0;
      const commentsUrl = commentsLink.attr('href');

      stories.push({
        type: 'story',
        id: id,
        rank: parseInt(rank) || null,
        title: title,
        url: storyUrl,
        domain: domain || null,
        score: parseInt(score) || 0,
        author: author || null,
        time: time || null,
        commentsCount: commentsCount,
        commentsUrl: commentsUrl ? `https://news.ycombinator.com/${commentsUrl}` : null
      });
    });

    return {
      type: 'story_list',
      url: url,
      stories: stories,
      count: stories.length
    };
  }

  /**
   * Parse discussion thread (item page)
   */
  parseThread(url, $) {
    // Extract story/post details
    const $story = $('.athing').first();
    const id = $story.attr('id');
    const $titleLine = $story.find('.titleline');
    const title = $titleLine.find('a').first().text();
    const storyUrl = $titleLine.find('a').first().attr('href');

    const $subtext = $story.next('.subtext');
    const score = $subtext.find('.score').text().replace(' points', '');
    const author = $subtext.find('.hnuser').text();
    const time = $subtext.find('.age').attr('title') || $subtext.find('.age').text();

    // Get story text (for Ask HN, Show HN, etc.)
    const $storyText = $('.toptext');
    const text = $storyText.length > 0 ? this._htmlToText($storyText.html()) : null;

    // Parse comments
    const comments = this.parseComments($);

    return {
      type: 'thread',
      id: id,
      title: title,
      url: storyUrl,
      score: parseInt(score) || 0,
      author: author || null,
      time: time || null,
      text: text,
      comments: comments,
      commentsCount: this._countComments(comments)
    };
  }

  /**
   * Parse nested comments
   */
  parseComments($) {
    const comments = [];
    const $comments = $('.athing.comtr');

    $comments.each((i, elem) => {
      const $elem = $(elem);
      const id = $elem.attr('id');
      const indent = parseInt($elem.find('.ind img').attr('width')) / 40 || 0;

      const $comment = $elem.find('.comment');
      const author = $elem.find('.hnuser').text();
      const time = $elem.find('.age').attr('title') || $elem.find('.age').text();
      const text = this._htmlToText($comment.html());

      // Check if comment is deleted/dead
      const isDead = $elem.hasClass('noshow');
      const isDeleted = $comment.find('.c00').length > 0;

      comments.push({
        type: 'comment',
        id: id,
        author: author || '[deleted]',
        time: time || null,
        text: text || '[deleted]',
        indent: indent,
        isDead: isDead,
        isDeleted: isDeleted
      });
    });

    // Build comment tree
    return this._buildCommentTree(comments);
  }

  /**
   * Parse user profile
   */
  parseUser(url, $) {
    const username = url.match(/user\?id=([^&]+)/)[1];

    const $rows = $('table table tr');
    const data = {};

    $rows.each((i, elem) => {
      const $elem = $(elem);
      const key = $elem.find('td').first().text().replace(':', '').trim();
      const value = $elem.find('td').eq(1).text().trim();

      if (key && value) {
        data[key.toLowerCase()] = value;
      }
    });

    return {
      type: 'user',
      username: username,
      karma: parseInt(data.karma) || 0,
      created: data.created || null,
      about: data.about || null,
      submissions: null, // Would need to scrape submissions page
      comments: null     // Would need to scrape threads page
    };
  }

  /**
   * Build nested comment tree from flat list
   */
  _buildCommentTree(flatComments) {
    const tree = [];
    const stack = [];

    for (const comment of flatComments) {
      // Remove children from previous processing
      comment.children = [];

      // Find parent based on indent
      while (stack.length > 0 && stack[stack.length - 1].indent >= comment.indent) {
        stack.pop();
      }

      if (stack.length === 0) {
        // Top-level comment
        tree.push(comment);
      } else {
        // Child comment
        const parent = stack[stack.length - 1];
        parent.children.push(comment);
      }

      stack.push(comment);
    }

    return tree;
  }

  /**
   * Count total comments in tree
   */
  _countComments(comments) {
    let count = comments.length;
    for (const comment of comments) {
      if (comment.children && comment.children.length > 0) {
        count += this._countComments(comment.children);
      }
    }
    return count;
  }

  /**
   * Convert HN HTML to plain text
   */
  _htmlToText(html) {
    if (!html) return '';

    // Load as cheerio object
    const $ = cheerio.load(html);

    // Convert <p> to newlines
    $('p').each((i, elem) => {
      $(elem).append('\n\n');
    });

    // Convert <i> to *italic*
    $('i').each((i, elem) => {
      const text = $(elem).text();
      $(elem).replaceWith(`*${text}*`);
    });

    // Get text
    let text = $.text();

    // Clean up
    text = text.replace(/\n{3,}/g, '\n\n'); // Max 2 newlines
    text = text.trim();

    return text;
  }

  /**
   * Parse HN search results
   */
  parseSearchResults(url, $) {
    // Similar to parseStoryList but for Algolia search
    // HN uses Algolia for search, different structure
    return {
      type: 'search_results',
      query: url.match(/q=([^&]+)/)?.[1] || '',
      results: []
    };
  }
}

module.exports = HNParser;
