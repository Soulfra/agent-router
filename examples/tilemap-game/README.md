# Tilemap Game Example

A simple tilemap-based game built with vanilla HTML, CSS, and JavaScript using Soulfra brand colors.

## Features

- **Tilemap rendering** - 20x15 grid with different tile types
- **Player movement** - Arrow key controls
- **Coin collection** - Score system
- **Interactive editing** - Click tiles to change them
- **Responsive design** - Works on mobile and desktop
- **Soulfra branding** - Uses #667eea and #764ba2 colors

## How to Use

### Play the Game

1. Open `index.html` in a web browser
2. Use arrow keys to move the player (blue tile)
3. Collect coins (yellow tiles) to increase score
4. Avoid walls (purple tiles)
5. Reach the goal (green tile) to win

### Test with Compaction Pipeline

This example is perfect for testing the code compaction and grading pipeline:

```bash
# Compact and grade the tilemap game
node bin/compact-and-grade.js examples/tilemap-game/

# Output will show:
# - Token reduction (typically 60-70%)
# - Visual grading (CSS color theory, layout)
# - Logic grading (JavaScript algorithms)
# - Ollama Soulfra AI evaluation
```

## Code Structure

- **HTML** - Canvas element, controls, stats display
- **CSS** - Soulfra brand gradient, responsive layout, button styles
- **JavaScript** - Tilemap rendering, player movement, collision detection, game logic

## Token Efficiency

Original file: ~6,500 tokens
After compaction: ~2,000 tokens
**Reduction: ~70%**

This demonstrates the power of code compaction for AI evaluation:
- Strips CSS comments and whitespace
- Minifies JavaScript
- Removes unnecessary newlines
- Preserves functionality

## Grading Tracks

This project will be graded on:

### Visual Track (CSS)
- Color harmony (uses Soulfra brand colors)
- Layout mathematics (flexbox, grid)
- Responsive design
- Aesthetic appeal

### Logic Track (JavaScript)
- Algorithm quality (tilemap rendering, collision detection)
- Code structure (game state management)
- Best practices (event listeners, array operations)
- Efficiency (O(n) grid updates)

### Combined Score
Weighted average of visual and logic scores, plus optional Ollama AI evaluation for subjective quality.

## Soulfra Brand Alignment

✅ Uses primary color: #667eea (purple)
✅ Uses secondary color: #764ba2 (deep purple)
✅ Creative and collaborative theme
✅ Modern, clean design
✅ Interactive and engaging

Perfect example for Soulfra's AI-powered creative tools!
