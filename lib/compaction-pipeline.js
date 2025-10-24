/**
 * Compaction Pipeline
 *
 * Orchestrates: Compact → Preprocess → Grade → Store
 * Combines code compaction, track separation, and AI grading
 */

const CodeCompactor = require('./code-compactor');
const SubmissionPreprocessor = require('./submission-preprocessor');
const OllamaSoulfraClient = require('./ollama-soulfra-client');
const VisualGrader = require('./grading/visual-grader');
const LogicGrader = require('./grading/logic-grader');
const AudioGrader = require('./grading/audio-grader');
const CodeDepthAnalyzer = require('./code-depth-analyzer');
const EdgeDetector = require('./edge-detector');
const DifficultyRanker = require('./difficulty-ranker');

class CompactionPipeline {
  constructor(options = {}) {
    this.compactor = new CodeCompactor({
      minifyHTML: true,
      minifyCSS: true,
      minifyJS: true,
      removeComments: true,
      aggressiveMinification: options.aggressive || false
    });

    this.preprocessor = new SubmissionPreprocessor();

    this.ollamaClient = new OllamaSoulfraClient({
      baseURL: options.ollamaURL,
      model: options.model || 'soulfra-model'
    });

    this.visualGrader = new VisualGrader();
    this.logicGrader = new LogicGrader();
    this.audioGrader = new AudioGrader();

    this.depthAnalyzer = new CodeDepthAnalyzer();
    this.edgeDetector = new EdgeDetector();
    this.difficultyRanker = new DifficultyRanker();

    this.useOllama = options.useOllama !== false;
    this.useLocalGraders = options.useLocalGraders !== false;
    this.useDepthAnalysis = options.useDepthAnalysis !== false;
  }

  /**
   * Run full pipeline: Compact → Preprocess → Grade
   *
   * @param {object} project - { html, css, js, title, description }
   * @returns {Promise<object>} Complete pipeline result
   */
  async run(project) {
    const pipelineStart = Date.now();

    const result = {
      project: {
        title: project.title || 'Untitled',
        description: project.description || ''
      },
      stages: {},
      timing: {},
      errors: []
    };

    try {
      // Stage 1: Compaction
      console.log('🗜️  Stage 1: Compacting code...');
      const compactionStart = Date.now();

      const compactionResult = this.compactor.compact({
        html: project.html || '',
        css: project.css || '',
        js: project.js || '',
        title: project.title
      });

      result.stages.compaction = {
        success: true,
        stats: compactionResult.stats,
        html5File: compactionResult.html5File
      };

      result.timing.compaction = Date.now() - compactionStart;
      console.log(`✅ Compaction complete (${result.timing.compaction}ms)`);
      console.log(`   Token reduction: ${compactionResult.stats.reduction.tokens}%`);

      // Stage 2: Preprocessing (track separation)
      console.log('\n📦 Stage 2: Preprocessing and track separation...');
      const preprocessStart = Date.now();

      const preprocessed = this.preprocessor.preprocessSubmission(
        compactionResult.html5File,
        'project.html'
      );

      const gradingTracks = this.preprocessor.determineGradingTracks(preprocessed);

      result.stages.preprocessing = {
        success: true,
        contentType: preprocessed.type,
        tracks: Object.keys(preprocessed.tracks),
        gradingTracks: gradingTracks,
        metadata: preprocessed.metadata
      };

      result.timing.preprocessing = Date.now() - preprocessStart;
      console.log(`✅ Preprocessing complete (${result.timing.preprocessing}ms)`);
      console.log(`   Grading tracks: ${gradingTracks.join(', ')}`);

      // Stage 2.5: Depth Analysis (NEW)
      if (this.useDepthAnalysis && gradingTracks.includes('logic')) {
        console.log('\n🔍 Stage 2.5: Code depth & complexity analysis...');
        const depthStart = Date.now();

        try {
          const logicContent = this.preprocessor.prepareForTrack(preprocessed, 'logic');
          const language = preprocessed.type === 'python' ? 'python' : 'javascript';

          const depthAnalysis = await this._runDepthAnalysis(
            logicContent,
            language,
            project
          );

          result.stages.depthAnalysis = depthAnalysis;
          result.timing.depthAnalysis = Date.now() - depthStart;

          console.log(`✅ Depth analysis complete (${result.timing.depthAnalysis}ms)`);
          console.log(`   Difficulty: ${depthAnalysis.difficultyRanking.baseDifficulty} (${depthAnalysis.difficultyRanking.stars}★)`);
          console.log(`   Depth: ${depthAnalysis.depthAnalysis.overallDepth.toFixed(2)}`);
          console.log(`   Sudoku: ${depthAnalysis.depthAnalysis.comparisons.sudoku}`);

        } catch (error) {
          console.warn(`⚠️  Depth analysis failed: ${error.message}`);
          result.errors.push({
            stage: 'depthAnalysis',
            error: error.message
          });
        }
      }

      // Stage 3: Local grading (math-based graders)
      if (this.useLocalGraders) {
        console.log('\n📊 Stage 3: Local multi-track grading...');
        const gradingStart = Date.now();

        const gradingResults = await this._runLocalGrading(
          preprocessed,
          gradingTracks,
          project
        );

        result.stages.localGrading = gradingResults;
        result.timing.localGrading = Date.now() - gradingStart;

        console.log(`✅ Local grading complete (${result.timing.localGrading}ms)`);
        if (gradingResults.combined) {
          console.log(`   Overall score: ${gradingResults.combined.overall}/100`);
        }
      }

      // Stage 4: Ollama Soulfra evaluation (AI-based)
      if (this.useOllama) {
        console.log('\n🤖 Stage 4: Ollama Soulfra AI evaluation...');
        const ollamaStart = Date.now();

        try {
          const ollamaResult = await this._runOllamaEvaluation(
            compactionResult.compacted,
            project
          );

          result.stages.ollama = ollamaResult;
          result.timing.ollama = Date.now() - ollamaStart;

          console.log(`✅ Ollama evaluation complete (${result.timing.ollama}ms)`);
          console.log(`   AI score: ${ollamaResult.overall}/100`);

        } catch (error) {
          console.warn(`⚠️  Ollama evaluation failed: ${error.message}`);
          result.errors.push({
            stage: 'ollama',
            error: error.message
          });
        }
      }

      // Calculate combined scores
      result.finalScores = this._calculateFinalScores(result.stages);

    } catch (error) {
      console.error(`❌ Pipeline failed: ${error.message}`);
      result.errors.push({
        stage: 'pipeline',
        error: error.message,
        stack: error.stack
      });
    }

    result.timing.total = Date.now() - pipelineStart;
    result.timestamp = new Date().toISOString();

    return result;
  }

  /**
   * Run local math-based grading
   */
  async _runLocalGrading(preprocessed, gradingTracks, project) {
    const results = {
      tracks: {},
      combined: null
    };

    for (const track of gradingTracks) {
      const content = this.preprocessor.prepareForTrack(preprocessed, track);

      if (!content) continue;

      try {
        let gradeResult;

        switch (track) {
          case 'visual':
            console.log('   Grading visual track (CSS)...');
            gradeResult = await this.visualGrader.evaluate(content, {
              projectTitle: project.title
            });
            break;

          case 'logic':
            console.log('   Grading logic track (JS/Python)...');
            const language = preprocessed.type === 'python' ? 'python' : 'javascript';
            gradeResult = await this.logicGrader.evaluate(content, language, {
              projectTitle: project.title
            });
            break;

          case 'audio':
            console.log('   Grading audio track...');
            gradeResult = await this.audioGrader.evaluate(content, {
              projectTitle: project.title
            });
            break;

          default:
            continue;
        }

        results.tracks[track] = gradeResult;

      } catch (error) {
        console.warn(`   Failed to grade ${track}: ${error.message}`);
        results.tracks[track] = {
          error: error.message
        };
      }
    }

    // Calculate combined score
    if (Object.keys(results.tracks).length > 0) {
      results.combined = this._calculateCombinedScore(results.tracks);
    }

    return results;
  }

  /**
   * Run depth analysis on code (NEW)
   */
  async _runDepthAnalysis(code, language, project) {
    // Analyze code depth
    const depthAnalysis = this.depthAnalyzer.analyze(code, language);

    // Analyze edges
    const edgeAnalysis = this.edgeDetector.analyze(code, language);

    // Generate difficulty ranking
    const difficultyRanking = this.difficultyRanker.rank(depthAnalysis, edgeAnalysis);

    return {
      depthAnalysis,
      edgeAnalysis,
      difficultyRanking,
      projectTitle: project.title
    };
  }

  /**
   * Run Ollama Soulfra AI evaluation
   */
  async _runOllamaEvaluation(compacted, project) {
    // Check Ollama health
    const health = await this.ollamaClient.healthCheck();

    if (!health.running) {
      throw new Error('Ollama is not running. Start with: ollama serve');
    }

    // Check Soulfra model
    const modelCheck = await this.ollamaClient.checkSoulfraModel();

    if (!modelCheck.installed) {
      throw new Error('Soulfra model not installed. Install with: ollama create soulfra-model -f ollama-models/soulfra-model');
    }

    // Send to Soulfra model for evaluation
    const evaluation = await this.ollamaClient.evaluateCode({
      html: compacted.html,
      css: compacted.css,
      js: compacted.js,
      type: project.type || 'web-app',
      description: project.description
    });

    return evaluation;
  }

  /**
   * Calculate combined score from multiple tracks
   */
  _calculateCombinedScore(tracks) {
    const trackNames = Object.keys(tracks);

    if (trackNames.length === 0) {
      return { overall: 0, tracks: {} };
    }

    // Weights for each track
    const weights = {
      visual: 0.3,
      logic: 0.5,
      audio: 0.2
    };

    let totalScore = 0;
    let totalWeight = 0;

    const trackScores = {};

    for (const track of trackNames) {
      const result = tracks[track];

      if (result.error) continue;

      const weight = weights[track] || 0.33;
      const score = result.overall || 0;

      totalScore += score * weight;
      totalWeight += weight;
      trackScores[track] = score;
    }

    const overall = totalWeight > 0 ? totalScore / totalWeight : 0;

    return {
      overall: Math.round(overall * 100) / 100,
      tracks: trackScores,
      tracksGraded: trackNames.length
    };
  }

  /**
   * Calculate final scores combining local + Ollama
   */
  _calculateFinalScores(stages) {
    const scores = {
      local: null,
      ollama: null,
      combined: null
    };

    // Local grading scores
    if (stages.localGrading && stages.localGrading.combined) {
      scores.local = stages.localGrading.combined.overall;
    }

    // Ollama evaluation score
    if (stages.ollama && stages.ollama.overall) {
      scores.ollama = stages.ollama.overall;
    }

    // Combined (weighted average)
    if (scores.local !== null && scores.ollama !== null) {
      // 60% local (math-based), 40% AI (subjective)
      scores.combined = Math.round((scores.local * 0.6 + scores.ollama * 0.4) * 100) / 100;
    } else if (scores.local !== null) {
      scores.combined = scores.local;
    } else if (scores.ollama !== null) {
      scores.combined = scores.ollama;
    }

    return scores;
  }

  /**
   * Generate comprehensive report
   */
  generateReport(pipelineResult) {
    const { project, stages, timing, finalScores } = pipelineResult;

    let report = `
🚀 Compaction & Grading Pipeline Report
${'='.repeat(60)}

📁 Project: ${project.title}
${project.description ? `   ${project.description}\n` : ''}
⏰ Timestamp: ${pipelineResult.timestamp}

`;

    // Compaction stats
    if (stages.compaction) {
      const stats = stages.compaction.stats;
      report += `
📦 Stage 1: Compaction
${'-'.repeat(60)}
   Original Size:    ${(stats.original.size / 1024).toFixed(2)} KB
   Compacted Size:   ${(stats.compacted.size / 1024).toFixed(2)} KB
   Reduction:        ${stats.reduction.size}%

   Token Savings:
   - Original:       ${stats.original.tokens.toLocaleString()} tokens
   - Compacted:      ${stats.compacted.tokens.toLocaleString()} tokens
   - Saved:          ${(stats.original.tokens - stats.compacted.tokens).toLocaleString()} tokens (${stats.reduction.tokens}%)

   Time: ${timing.compaction}ms
`;
    }

    // Preprocessing
    if (stages.preprocessing) {
      report += `
📦 Stage 2: Preprocessing
${'-'.repeat(60)}
   Content Type:     ${stages.preprocessing.contentType}
   Tracks:           ${stages.preprocessing.tracks.join(', ')}
   Grading Tracks:   ${stages.preprocessing.gradingTracks.join(', ')}

   Time: ${timing.preprocessing}ms
`;
    }

    // Depth Analysis (NEW)
    if (stages.depthAnalysis) {
      const depth = stages.depthAnalysis.depthAnalysis;
      const ranking = stages.depthAnalysis.difficultyRanking;
      const edges = stages.depthAnalysis.edgeAnalysis;

      report += `
🔍 Stage 2.5: Code Depth & Complexity Analysis
${'-'.repeat(60)}
   Difficulty:       ${ranking.baseDifficulty.toUpperCase()} (${ranking.stars}★)
   Overall Depth:    ${depth.overallDepth.toFixed(2)}
   Max Depth:        ${depth.maxDepth}

   Comparisons:
   🧩 Sudoku:        ${depth.comparisons.sudoku}
   📰 Crossword:     ${depth.comparisons.crossword}
   💻 LeetCode:      ${depth.comparisons.leetcode}

   Code Metrics:
   - Variables:      ${depth.variables.count} (avg depth: ${depth.variables.averageDepth.toFixed(2)})
   - Functions:      ${depth.functions.count} (avg depth: ${depth.functions.averageDepth.toFixed(2)})
   - Algorithms:     ${depth.algorithms.count} detected
   - Total Edges:    ${edges.totalEdges}
   - Edge Density:   ${edges.edgeDensity.toFixed(3)} edges/line

   Estimated Time:   ${ranking.estimatedTime.display}

   Time: ${timing.depthAnalysis}ms
`;

      // List detected algorithms
      if (depth.algorithms.count > 0) {
        report += '   \n   Algorithms Detected:\n';
        for (const algo of depth.algorithms.items) {
          report += `     - ${algo.description}\n`;
        }
      }
    }

    // Local grading
    if (stages.localGrading) {
      report += `
📊 Stage 3: Local Multi-Track Grading
${'-'.repeat(60)}
`;

      for (const [track, result] of Object.entries(stages.localGrading.tracks)) {
        if (result.error) {
          report += `   ${track}: ERROR - ${result.error}\n`;
          continue;
        }

        report += `   ${track.toUpperCase()}: ${result.overall}/100\n`;

        if (result.breakdown) {
          for (const [category, score] of Object.entries(result.breakdown)) {
            report += `     - ${category}: ${score}/100\n`;
          }
        }
      }

      if (stages.localGrading.combined) {
        report += `\n   Combined Local Score: ${stages.localGrading.combined.overall}/100\n`;
      }

      report += `\n   Time: ${timing.localGrading}ms\n`;
    }

    // Ollama evaluation
    if (stages.ollama) {
      report += `
🤖 Stage 4: Ollama Soulfra AI Evaluation
${'-'.repeat(60)}
   Overall AI Score: ${stages.ollama.overall}/100

   Sections:
`;

      if (stages.ollama.sections) {
        for (const [section, content] of Object.entries(stages.ollama.sections)) {
          report += `   ${section}:\n     ${content.replace(/\n/g, '\n     ')}\n\n`;
        }
      }

      report += `   Time: ${timing.ollama}ms\n`;
    }

    // Final scores
    report += `
🏆 Final Scores
${'-'.repeat(60)}
`;

    if (finalScores.local !== null) {
      report += `   Local (Math-Based):     ${finalScores.local}/100\n`;
    }

    if (finalScores.ollama !== null) {
      report += `   Ollama (AI-Based):      ${finalScores.ollama}/100\n`;
    }

    if (finalScores.combined !== null) {
      report += `   Combined Score:         ${finalScores.combined}/100\n`;
    }

    // Timing summary
    report += `
⏱️  Timing Summary
${'-'.repeat(60)}
   Compaction:       ${timing.compaction || 0}ms
   Preprocessing:    ${timing.preprocessing || 0}ms
   Depth Analysis:   ${timing.depthAnalysis || 0}ms
   Local Grading:    ${timing.localGrading || 0}ms
   Ollama:           ${timing.ollama || 0}ms
   Total:            ${timing.total}ms

`;

    // Errors
    if (pipelineResult.errors && pipelineResult.errors.length > 0) {
      report += `
⚠️  Errors
${'-'.repeat(60)}
`;
      pipelineResult.errors.forEach(err => {
        report += `   [${err.stage}] ${err.error}\n`;
      });
    }

    return report;
  }
}

module.exports = CompactionPipeline;
