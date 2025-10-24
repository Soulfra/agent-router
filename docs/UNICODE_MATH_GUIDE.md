# Unicode & Mathematical Notation Guide

> Modern character input and mathematical notation rendering

## Overview

This system provides three key features:
1. **Mathematical notation rendering** (LaTeX/KaTeX)
2. **Unicode character picker** (visual palette + search)
3. **Symbol shortcuts** (modern replacement for Windows Alt+numpad codes)

---

## Part 1: Mathematical Notation

### LaTeX Rendering (KaTeX)

Add KaTeX to your HTML:

```html
<!-- In <head> -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
```

**Inline Math** (wrap in `$...$`):

```
The quadratic formula is $x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}$
```

Renders as: The quadratic formula is x = (−b ± √(b²−4ac))/2a

**Block Math** (wrap in `$$...$$`):

```
$$
\int_{0}^{\infty} e^{-x^2} dx = \frac{\sqrt{\pi}}{2}
$$
```

Renders as centered equation.

### Common LaTeX Symbols

```
Greek Letters:
\alpha → α   \beta → β   \gamma → γ   \delta → δ
\pi → π      \sigma → σ  \omega → ω   \Omega → Ω

Math Operators:
\sum → ∑     \prod → ∏   \int → ∫     \oint → ∮
\partial → ∂ \nabla → ∇  \infty → ∞   \pm → ±

Relations:
\leq → ≤     \geq → ≥    \neq → ≠     \approx → ≈
\equiv → ≡   \subset → ⊂ \supset → ⊃  \in → ∈

Arrows:
\rightarrow → →   \leftarrow → ←   \Rightarrow → ⇒
\Leftarrow → ⇐    \leftrightarrow → ↔

Fractions & Roots:
\frac{a}{b} → a/b
\sqrt{x} → √x
\sqrt[n]{x} → ⁿ√x
```

### Auto-Rendering

```javascript
// Auto-render LaTeX in all elements with class "math-content"
document.addEventListener("DOMContentLoaded", function() {
  renderMathInElement(document.body, {
    delimiters: [
      {left: "$$", right: "$$", display: true},   // Block math
      {left: "$", right: "$", display: false},    // Inline math
      {left: "\\[", right: "\\]", display: true}, // Alt block
      {left: "\\(", right: "\\)", display: false} // Alt inline
    ]
  });
});
```

---

## Part 2: Unicode Character Picker

### Using the Unicode Manager (Backend)

```javascript
const UnicodeManager = require('./lib/unicode-manager');

const unicode = new UnicodeManager();

// Initialize (loads Unicode data)
await unicode.initialize();

// Get character by hex code
const char = unicode.getCharacterByHex('1D461'); // U+1D461
console.log(char);
// {
//   codePoint: 119905,
//   hex: 'U+1D461',
//   character: '𝑡',  // Mathematical Italic Small T
//   name: 'MATHEMATICAL ITALIC SMALL T',
//   category: 'Ll'
// }

// Search by name
const results = unicode.searchByName('integral');
// [
//   { codePoint: 8747, hex: 'U+222B', character: '∫', name: 'INTEGRAL' },
//   { codePoint: 8748, hex: 'U+222C', character: '∬', name: 'DOUBLE INTEGRAL' },
//   ...
// ]

// Get all mathematical symbols
const mathSymbols = unicode.getMathSymbols();
// Returns 2000+ math symbols

// Get Greek letters
const greekLetters = unicode.getGreekLetters();
// Returns α, β, γ, etc.
```

### Unicode Character Ranges

**Mathematical Symbols**:
- **U+2200–U+22FF**: Mathematical Operators (∀, ∃, ∅, ∇, ∞, etc.)
- **U+2A00–U+2AFF**: Supplemental Mathematical Operators
- **U+1D400–U+1D7FF**: Mathematical Alphanumeric Symbols (𝒜, 𝒞, 𝒟, etc.)

**Greek & Coptic**:
- **U+0370–U+03FF**: Greek letters (α, β, γ, Ω, etc.)

**Arrows**:
- **U+2190–U+21FF**: Arrows (←, →, ↑, ↓, ⇒, etc.)

**Superscripts & Subscripts**:
- **U+2070–U+209F**: Superscripts/subscripts (⁰, ¹, ², ₀, ₁, etc.)

### Character Input Methods

**Method 1: Direct Unicode escape (JavaScript)**:
```javascript
// Unicode escape
const alpha = '\u03B1';  // α
const integral = '\u222B'; // ∫

// Code point
const mathT = String.fromCodePoint(0x1D461); // 𝑡
```

**Method 2: HTML entities**:
```html
&alpha; → α
&beta; → β
&sum; → ∑
&int; → ∫
&#x1D461; → 𝑡
```

**Method 3: Copy from Unicode picker** (UI component - see Part 3)

---

## Part 3: Symbol Shortcuts (Modern Alt+Codes)

### Old Windows Way (Deprecated)

On old Windows with numpad:
```
Alt+224 → α (alpha)
Alt+227 → π (pi)
Alt+228 → Σ (summation)
```

**Problem**: No numpad on modern laptops/tablets.

### New Way: Symbol Shortcuts

**LaTeX-style shortcuts**:
```
\alpha → α
\beta → β
\pi → π
\sum → ∑
\int → ∫
\infty → ∞
\pm → ±
\neq → ≠
\leq → ≤
\geq → ≥
```

**Emoji-style shortcuts**:
```
:alpha: → α
:beta: → β
:pi: → π
:sum: → ∑
:integral: → ∫
:infinity: → ∞
:plus-minus: → ±
:not-equal: → ≠
:less-equal: → ≤
:greater-equal: → ≥
```

### Implement Auto-Replace

```javascript
// Auto-replace shortcuts in text input
function replaceSymbolShortcuts(text) {
  const shortcuts = {
    // LaTeX-style
    '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ',
    '\\pi': 'π', '\\sigma': 'σ', '\\omega': 'ω', '\\Omega': 'Ω',
    '\\sum': '∑', '\\prod': '∏', '\\int': '∫', '\\partial': '∂',
    '\\infty': '∞', '\\pm': '±', '\\neq': '≠', '\\leq': '≤', '\\geq': '≥',

    // Emoji-style
    ':alpha:': 'α', ':beta:': 'β', ':gamma:': 'γ', ':delta:': 'δ',
    ':pi:': 'π', ':sigma:': 'σ', ':omega:': 'ω',
    ':sum:': '∑', ':integral:': '∫', ':infinity:': '∞',
    ':plus-minus:': '±', ':not-equal:': '≠'
  };

  let result = text;
  for (const [shortcut, symbol] of Object.entries(shortcuts)) {
    result = result.replace(new RegExp(shortcut.replace(/\\/g, '\\\\'), 'g'), symbol);
  }

  return result;
}

// Use in chat input
chatInput.addEventListener('input', (e) => {
  const replaced = replaceSymbolShortcuts(e.target.value);
  if (replaced !== e.target.value) {
    e.target.value = replaced;
  }
});
```

---

## Part 4: Accessing Unicode Reference Data

### Official Unicode Sources

**HTTPS (Recommended)**:
- https://www.unicode.org/Public/UNIDATA/UnicodeData.txt
- https://www.unicode.org/Public/UNIDATA/Scripts.txt
- https://www.unicode.org/Public/UNIDATA/Blocks.txt
- https://www.unicode.org/Public/UCD/latest/ucd/DerivedAge.txt

**FTP (Legacy)**:
- ftp://ftp.unicode.org/Public/UNIDATA/Scripts.txt

Note: FTP works but HTTPS is preferred (faster, more compatible).

### Using Unicode Manager

```javascript
const UnicodeManager = require('./lib/unicode-manager');
const unicode = new UnicodeManager();

// Initialize (fetches and caches Unicode data)
await unicode.initialize();

// Data is now available locally
// Cached for 30 days in .unicode-cache/

// Look up Unicode U+1D461
const char = unicode.getCharacterByHex('U+1D461');
console.log(char.name); // MATHEMATICAL ITALIC SMALL T

// Search for characters
const integrals = unicode.searchByName('integral');
console.log(integrals.length); // ~20 integral variants
```

---

## Part 5: Mathematical Notation in Chat

### Chat with Math Support

```javascript
// In chat message handler
function renderChatMessage(message) {
  // 1. Replace symbol shortcuts
  let text = replaceSymbolShortcuts(message.text);

  // 2. Render LaTeX math
  const messageDiv = document.createElement('div');
  messageDiv.className = 'chat-message';
  messageDiv.textContent = text;

  // 3. Auto-render LaTeX
  renderMathInElement(messageDiv, {
    delimiters: [
      {left: "$$", right: "$$", display: true},
      {left: "$", right: "$", display: false}
    ]
  });

  return messageDiv;
}
```

**Example chat messages**:

```
User: What's the area of a circle?
Bot: The area is $A = \pi r^2$

User: Can you explain integration?
Bot: Sure! The integral $\int_{a}^{b} f(x) dx$ represents the area under the curve $f(x)$ from $x=a$ to $x=b$.

User: Show me Euler's identity
Bot: Euler's identity is one of the most beautiful equations:
$$e^{i\pi} + 1 = 0$$
```

---

## Quick Reference: Common Math Symbols

### Greek Letters
```
α β γ δ ε ζ η θ ι κ λ μ ν ξ ο π ρ σ τ υ φ χ ψ ω
Α Β Γ Δ Ε Ζ Η Θ Ι Κ Λ Μ Ν Ξ Ο Π Ρ Σ Τ Υ Φ Χ Ψ Ω
```

### Math Operators
```
+ − × ÷ ± ∓ = ≠ ≈ ≡ < > ≤ ≥ ∝ ∞
∑ ∏ ∐ ∫ ∬ ∭ ∮ ∯ ∰ ∇ ∂ ∆ √ ∛ ∜
```

### Relations & Sets
```
∈ ∉ ∋ ∌ ⊂ ⊃ ⊆ ⊇ ∩ ∪ ∅ ℕ ℤ ℚ ℝ ℂ ℙ
```

### Logic & Quantifiers
```
∀ ∃ ∄ ∧ ∨ ¬ ⊕ ⊗ ⊥ ⊤ ⊢ ⊨ ⊻ ⟺ ⟹
```

### Arrows
```
← → ↑ ↓ ↔ ↕ ⇐ ⇒ ⇑ ⇓ ⇔ ⇕ ⟵ ⟶ ⟷
```

### Geometry
```
∠ ∟ ° ∆ ∇ ⊥ ∥ ⊿ ⌒ ⊙ ⊕ ⊗ ▲ ▼ ◀ ▶
```

---

## Browser Keyboard Shortcuts

### macOS
- **Character Viewer**: Control+Command+Space
- Shows emoji and symbols picker
- Can search by name ("alpha", "integral", etc.)

### Windows
- **Emoji Picker**: Win+. or Win+;
- Includes some math symbols
- Limited compared to full Unicode

### Linux
- **Compose Key**: Configure in settings
- e.g., Compose + * + p → π
- Highly customizable

---

## Summary

```
┌─────────────────────────────────────────────────────────┐
│  Unicode & Math Support Workflow                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. Mathematical Notation:                              │
│     • Add KaTeX library to HTML                         │
│     • Write LaTeX: $x^2 + y^2 = r^2$                   │
│     • Auto-renders on page load                         │
│                                                         │
│  2. Unicode Characters:                                 │
│     • Backend: UnicodeManager.initialize()              │
│     • Search: unicode.searchByName('integral')          │
│     • Lookup: unicode.getCharacterByHex('1D461')        │
│                                                         │
│  3. Symbol Shortcuts:                                   │
│     • Type: \alpha or :alpha:                           │
│     • Auto-replaces with: α                             │
│     • Works in chat, notes, documents                   │
│                                                         │
│  4. Reference Data:                                     │
│     • Fetched from unicode.org (HTTPS)                  │
│     • Cached locally for 30 days                        │
│     • Includes Scripts.txt, DerivedAge.txt, etc.        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Next Steps**:
1. Add KaTeX to your HTML pages
2. Test LaTeX rendering in chat
3. Initialize UnicodeManager on server startup
4. Add symbol shortcut auto-replace to text inputs

---

## Related Documentation

- [W3Schools C Math Reference](https://www.w3schools.com/c/c_ref_math.php)
- [Wikipedia Math Symbols](https://en.wikipedia.org/wiki/Glossary_of_mathematical_symbols)
- [Unicode.org Official Site](https://www.unicode.org/)
- [KaTeX Documentation](https://katex.org/docs/api.html)
- [Mathematical Unicode Blocks](https://www.compart.com/en/unicode/block/U+2200)
