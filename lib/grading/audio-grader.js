/**
 * Audio Grader
 *
 * Evaluates audio synthesis and processing code
 * Focuses on sound generation, effects, and audio algorithms
 */

class AudioGrader {
  constructor() {
    // Scoring weights
    this.weights = {
      synthesis: 0.3,
      effects: 0.25,
      musicTheory: 0.2,
      audioAlgorithms: 0.15,
      quality: 0.1
    };

    // Audio API patterns
    this.audioAPIs = {
      webAudio: /AudioContext|createOscillator|createGain|createBiquadFilter|createBufferSource|createAnalyser/g,
      toneJs: /Tone\.|new\s+Tone\./g,
      howler: /Howl|Howler/g,
      p5Sound: /p5\.sound|loadSound|playSound/g
    };

    // Synthesis patterns
    this.synthesisPatterns = {
      oscillators: /oscillator|sine|square|sawtooth|triangle/gi,
      envelopes: /ADSR|attack|decay|sustain|release|envelope/gi,
      filters: /filter|lowpass|highpass|bandpass|notch/gi,
      modulation: /LFO|modulation|frequency\s*modulation|amplitude\s*modulation/gi
    };

    // Effects patterns
    this.effectsPatterns = {
      reverb: /reverb|convolver/gi,
      delay: /delay|echo/gi,
      distortion: /distortion|overdrive|waveshaper/gi,
      compression: /compressor|dynamics/gi,
      chorus: /chorus/gi,
      phaser: /phaser/gi,
      flanger: /flanger/gi
    };

    // Music theory patterns
    this.musicTheoryPatterns = {
      notes: /[A-G]#?[0-9]|frequency|pitch|note/gi,
      scales: /scale|major|minor|pentatonic|chromatic/gi,
      chords: /chord|triad|seventh|major|minor|diminished|augmented/gi,
      rhythm: /tempo|bpm|beat|rhythm|time\s*signature/gi,
      harmony: /harmony|interval|consonance|dissonance/gi
    };
  }

  /**
   * Main evaluation function
   */
  async evaluate(code, metadata = {}) {
    const scores = {
      synthesis: this.evaluateSynthesis(code),
      effects: this.evaluateEffects(code),
      musicTheory: this.evaluateMusicTheory(code),
      audioAlgorithms: this.evaluateAudioAlgorithms(code),
      quality: this.evaluateQuality(code)
    };

    // Calculate weighted overall score
    const overall = Object.entries(scores).reduce((total, [key, score]) => {
      return total + (score * this.weights[key]);
    }, 0);

    // Generate feedback
    const feedback = this.generateFeedback(scores, code);

    // Detect audio APIs and features
    const features = this.detectAudioFeatures(code);

    return {
      overall: Math.round(overall * 100) / 100,
      breakdown: scores,
      feedback,
      features,
      metadata: {
        ...metadata,
        lineCount: code.split('\n').length,
        characterCount: code.length,
        timestamp: new Date().toISOString(),
        grader: 'audio',
        version: '1.0'
      }
    };
  }

  /**
   * Evaluate sound synthesis
   */
  evaluateSynthesis(code) {
    let score = 50; // Base score

    // Check for Audio API usage
    const apis = this.detectAudioAPIs(code);
    if (apis.length > 0) {
      score += 15;
    }

    // Check for oscillator usage
    const oscillators = (code.match(this.synthesisPatterns.oscillators) || []).length;
    score += Math.min(15, oscillators * 5);

    // Check for envelope control (ADSR)
    const envelopes = (code.match(this.synthesisPatterns.envelopes) || []).length;
    if (envelopes > 0) {
      score += 15;
    }

    // Check for filters
    const filters = (code.match(this.synthesisPatterns.filters) || []).length;
    if (filters > 0) {
      score += 10;
    }

    // Check for modulation (advanced synthesis)
    const modulation = (code.match(this.synthesisPatterns.modulation) || []).length;
    if (modulation > 0) {
      score += 15;
    }

    return Math.min(100, score);
  }

  /**
   * Evaluate effects processing
   */
  evaluateEffects(code) {
    let score = 50; // Base score

    const effectsUsed = [];

    // Check for each effect type
    if (this.effectsPatterns.reverb.test(code)) {
      score += 12;
      effectsUsed.push('reverb');
    }

    if (this.effectsPatterns.delay.test(code)) {
      score += 10;
      effectsUsed.push('delay');
    }

    if (this.effectsPatterns.distortion.test(code)) {
      score += 10;
      effectsUsed.push('distortion');
    }

    if (this.effectsPatterns.compression.test(code)) {
      score += 8;
      effectsUsed.push('compression');
    }

    if (this.effectsPatterns.chorus.test(code)) {
      score += 8;
      effectsUsed.push('chorus');
    }

    if (this.effectsPatterns.phaser.test(code)) {
      score += 8;
      effectsUsed.push('phaser');
    }

    if (this.effectsPatterns.flanger.test(code)) {
      score += 8;
      effectsUsed.push('flanger');
    }

    // Bonus for using multiple effects (effect chain)
    if (effectsUsed.length >= 3) {
      score += 15;
    }

    return Math.min(100, score);
  }

  /**
   * Evaluate music theory application
   */
  evaluateMusicTheory(code) {
    let score = 50; // Base score

    // Check for note/pitch usage
    const notes = (code.match(this.musicTheoryPatterns.notes) || []).length;
    if (notes > 0) {
      score += 10;
    }

    // Check for scales
    const scales = (code.match(this.musicTheoryPatterns.scales) || []).length;
    if (scales > 0) {
      score += 15;
    }

    // Check for chords
    const chords = (code.match(this.musicTheoryPatterns.chords) || []).length;
    if (chords > 0) {
      score += 15;
    }

    // Check for rhythm/tempo
    const rhythm = (code.match(this.musicTheoryPatterns.rhythm) || []).length;
    if (rhythm > 0) {
      score += 10;
    }

    // Check for harmony concepts
    const harmony = (code.match(this.musicTheoryPatterns.harmony) || []).length;
    if (harmony > 0) {
      score += 15;
    }

    return Math.min(100, score);
  }

  /**
   * Evaluate audio algorithms
   */
  evaluateAudioAlgorithms(code) {
    let score = 60; // Base score

    // Check for FFT/frequency analysis
    if (/FFT|analyser|frequency\s*data|getByteFrequencyData/i.test(code)) {
      score += 15;
    }

    // Check for waveform generation
    if (/wave|buffer|sample|pcm/i.test(code)) {
      score += 10;
    }

    // Check for audio processing loops
    if (/for.*sample|process\s*audio|audio\s*buffer/i.test(code)) {
      score += 10;
    }

    // Check for real-time processing
    if (/audio\s*worklet|script\s*processor|process\s*callback/i.test(code)) {
      score += 15;
    }

    // Check for mathematical operations on audio
    if (/Math\.|sin|cos|tan|pow|sqrt|abs/.test(code)) {
      score += 10;
    }

    return Math.min(100, score);
  }

  /**
   * Evaluate overall audio quality considerations
   */
  evaluateQuality(code) {
    let score = 60; // Base score

    // Check for sample rate awareness
    if (/sample\s*rate|sampleRate|44100|48000/i.test(code)) {
      score += 10;
    }

    // Check for gain/volume control
    if (/gain|volume|createGain|amplitude/i.test(code)) {
      score += 10;
    }

    // Check for clipping prevention
    if (/clip|limit|normalize|compress/i.test(code)) {
      score += 10;
    }

    // Check for audio context management
    if (/audioContext|resume|suspend|close/i.test(code)) {
      score += 10;
    }

    // Check for error handling (audio loading, etc.)
    if (/try|catch|error|failed|load/i.test(code)) {
      score += 10;
    }

    return Math.min(100, score);
  }

  /**
   * Detect which audio APIs are used
   */
  detectAudioAPIs(code) {
    const apis = [];

    if (this.audioAPIs.webAudio.test(code)) {
      apis.push('Web Audio API');
    }

    if (this.audioAPIs.toneJs.test(code)) {
      apis.push('Tone.js');
    }

    if (this.audioAPIs.howler.test(code)) {
      apis.push('Howler.js');
    }

    if (this.audioAPIs.p5Sound.test(code)) {
      apis.push('p5.sound');
    }

    return apis;
  }

  /**
   * Detect audio features used
   */
  detectAudioFeatures(code) {
    const features = {
      apis: this.detectAudioAPIs(code),
      synthesis: {
        oscillators: (code.match(this.synthesisPatterns.oscillators) || []).length > 0,
        envelopes: (code.match(this.synthesisPatterns.envelopes) || []).length > 0,
        filters: (code.match(this.synthesisPatterns.filters) || []).length > 0,
        modulation: (code.match(this.synthesisPatterns.modulation) || []).length > 0
      },
      effects: {
        reverb: this.effectsPatterns.reverb.test(code),
        delay: this.effectsPatterns.delay.test(code),
        distortion: this.effectsPatterns.distortion.test(code),
        compression: this.effectsPatterns.compression.test(code),
        chorus: this.effectsPatterns.chorus.test(code),
        phaser: this.effectsPatterns.phaser.test(code),
        flanger: this.effectsPatterns.flanger.test(code)
      },
      musicTheory: {
        notes: (code.match(this.musicTheoryPatterns.notes) || []).length > 0,
        scales: (code.match(this.musicTheoryPatterns.scales) || []).length > 0,
        chords: (code.match(this.musicTheoryPatterns.chords) || []).length > 0,
        rhythm: (code.match(this.musicTheoryPatterns.rhythm) || []).length > 0,
        harmony: (code.match(this.musicTheoryPatterns.harmony) || []).length > 0
      },
      advanced: {
        fft: /FFT|analyser|frequency\s*data/i.test(code),
        audioWorklet: /audio\s*worklet/i.test(code),
        realTime: /script\s*processor|process\s*callback/i.test(code)
      }
    };

    return features;
  }

  /**
   * Generate human-readable feedback
   */
  generateFeedback(scores, code) {
    const feedback = {
      strengths: [],
      improvements: [],
      suggestions: []
    };

    // Synthesis feedback
    if (scores.synthesis >= 80) {
      feedback.strengths.push('Excellent sound synthesis with advanced techniques');
    } else if (scores.synthesis < 60) {
      feedback.improvements.push('Enhance synthesis with envelopes and modulation');
      feedback.suggestions.push('Implement ADSR envelopes for more expressive sounds');
    }

    // Effects feedback
    if (scores.effects >= 80) {
      feedback.strengths.push('Rich audio effects processing');
    } else if (scores.effects < 60) {
      feedback.improvements.push('Add audio effects like reverb, delay, or filters');
      feedback.suggestions.push('Create an effects chain for more complex sounds');
    }

    // Music theory feedback
    if (scores.musicTheory >= 80) {
      feedback.strengths.push('Strong application of music theory');
    } else if (scores.musicTheory < 60) {
      feedback.improvements.push('Incorporate music theory concepts (scales, chords, harmony)');
      feedback.suggestions.push('Use scales to generate melodic sequences');
    }

    // Audio algorithms feedback
    if (scores.audioAlgorithms >= 80) {
      feedback.strengths.push('Advanced audio processing algorithms');
    } else if (scores.audioAlgorithms < 60) {
      feedback.improvements.push('Implement audio analysis or processing algorithms');
      feedback.suggestions.push('Try FFT analysis or custom waveform generation');
    }

    // Quality feedback
    if (scores.quality >= 80) {
      feedback.strengths.push('Well-implemented audio quality controls');
    } else if (scores.quality < 60) {
      feedback.improvements.push('Add gain control and clipping prevention');
      feedback.suggestions.push('Implement proper audio context management');
    }

    return feedback;
  }

  /**
   * Get detailed analysis report
   */
  generateReport(evaluationResult, code) {
    const features = this.detectAudioFeatures(code);

    // Count synthesis elements
    const synthesisCount = Object.values(features.synthesis).filter(Boolean).length;

    // Count effects
    const effectsCount = Object.values(features.effects).filter(Boolean).length;

    // Count music theory elements
    const theoryCount = Object.values(features.musicTheory).filter(Boolean).length;

    return {
      ...evaluationResult,
      analysis: {
        apis: features.apis,
        synthesisElements: synthesisCount,
        effectsUsed: effectsCount,
        theoryElements: theoryCount,
        features,
        complexity: this.calculateAudioComplexity(synthesisCount, effectsCount, theoryCount)
      }
    };
  }

  /**
   * Calculate audio complexity level
   */
  calculateAudioComplexity(synthesisCount, effectsCount, theoryCount) {
    const total = synthesisCount + effectsCount + theoryCount;

    if (total >= 10) return 'advanced';
    if (total >= 6) return 'intermediate';
    if (total >= 3) return 'basic';
    return 'simple';
  }

  /**
   * Suggest improvements based on evaluation
   */
  suggestImprovements(evaluationResult) {
    const suggestions = [];

    if (evaluationResult.breakdown.synthesis < 70) {
      suggestions.push({
        area: 'synthesis',
        priority: 'high',
        suggestion: 'Add ADSR envelope control for more expressive sounds',
        example: 'envelope = { attack: 0.1, decay: 0.2, sustain: 0.7, release: 0.5 }'
      });
    }

    if (evaluationResult.breakdown.effects < 70) {
      suggestions.push({
        area: 'effects',
        priority: 'medium',
        suggestion: 'Create an effects chain with reverb and delay',
        example: 'oscillator -> filter -> reverb -> delay -> output'
      });
    }

    if (evaluationResult.breakdown.musicTheory < 70) {
      suggestions.push({
        area: 'music-theory',
        priority: 'medium',
        suggestion: 'Use scales to generate musical sequences',
        example: 'const cMajorScale = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88]'
      });
    }

    if (evaluationResult.breakdown.audioAlgorithms < 70) {
      suggestions.push({
        area: 'algorithms',
        priority: 'low',
        suggestion: 'Implement FFT analysis for frequency visualization',
        example: 'analyser.getByteFrequencyData(dataArray)'
      });
    }

    return suggestions;
  }
}

module.exports = AudioGrader;
