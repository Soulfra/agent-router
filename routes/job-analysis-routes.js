/**
 * Job Analysis Routes
 *
 * API routes for job posting scraping, analysis, and lesson plan generation.
 *
 * Endpoints:
 * - GET /api/jobs - List all jobs
 * - GET /api/jobs/public - List active jobs (public)
 * - GET /api/jobs/:id - Get job details
 * - POST /api/jobs - Create new job posting
 * - POST /api/jobs/:id/analyze - Analyze job requirements
 * - POST /api/jobs/:id/lesson-plan - Generate learning roadmap
 * - POST /api/jobs/:id/pr - Generate PR and social media content
 */

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const PRGenerator = require('../lib/pr-generator');
const BadgeGenerator = require('../lib/badge-generator');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const prGenerator = new PRGenerator();
const badgeGenerator = new BadgeGenerator();

/**
 * GET /api/jobs/public
 * Get all active job postings (public endpoint)
 * MUST be before /jobs/:id to avoid route conflict
 */
router.get('/jobs/public', async (req, res) => {
  try {
    const { company, location, skills } = req.query;

    let query = 'SELECT * FROM job_postings_with_stats WHERE is_active = true';
    const params = [];

    if (company) {
      params.push(company);
      query += ` AND company ILIKE $${params.length}`;
    }

    if (location) {
      params.push(`%${location}%`);
      query += ` AND location ILIKE $${params.length}`;
    }

    if (skills) {
      // Search for any of the specified skills
      const skillArray = skills.split(',').map(s => s.trim());
      params.push(skillArray);
      query += ` AND required_skills && $${params.length}::text[]`;
    }

    query += ' ORDER BY urgency_level DESC, published_at DESC';

    const result = await pool.query(query, params);

    res.json({
      count: result.rows.length,
      jobs: result.rows.map(job => {
        const badges = badgeGenerator.generateAllBadges(job);

        return {
          job_id: job.job_id,
          title: job.title,
          company: job.company,
          location: job.location,
          job_type: job.job_type,
          description: job.description.slice(0, 200) + '...',
          required_skills: job.required_skills,
          salary_range: job.salary_range,
          created_at: job.created_at,
          views_count: job.views_count,
          applications_count: job.applications_count,
          published_at: job.published_at,
          expires_at: job.expires_at,
          urgency_level: job.urgency_level,
          interview_status: job.interview_status,
          badges: badges
        };
      })
    });

  } catch (error) {
    console.error('[JobAnalysis] Public list error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/jobs
 * List all job postings
 */
router.get('/jobs', async (req, res) => {
  try {
    const { company, location, active } = req.query;

    let query = 'SELECT * FROM job_postings WHERE 1=1';
    const params = [];

    if (company) {
      params.push(company);
      query += ` AND company ILIKE $${params.length}`;
    }

    if (location) {
      params.push(`%${location}%`);
      query += ` AND location ILIKE $${params.length}`;
    }

    if (active !== undefined) {
      params.push(active === 'true');
      query += ` AND is_active = $${params.length}`;
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);

    res.json({
      count: result.rows.length,
      jobs: result.rows
    });

  } catch (error) {
    console.error('[JobAnalysis] List error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/jobs/:id
 * Get single job posting with full details
 * Automatically increments view count
 */
router.get('/jobs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { track_view = 'true' } = req.query;

    // Get job with stats
    const result = await pool.query(
      'SELECT * FROM job_postings_with_stats WHERE job_id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = result.rows[0];

    // Increment view count (unless explicitly disabled)
    if (track_view === 'true') {
      await pool.query('SELECT increment_job_views($1)', [id]);
      job.views_count = (job.views_count || 0) + 1;
    }

    // Generate badges
    const badges = badgeGenerator.generateAllBadges(job);

    res.json({
      ...job,
      badges
    });

  } catch (error) {
    console.error('[JobAnalysis] Get error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/jobs/:id/analyze
 * Analyze job requirements and generate skill breakdown
 */
router.post('/jobs/:id/analyze', async (req, res) => {
  try {
    const { id } = req.params;

    // Get job details
    const result = await pool.query(
      'SELECT * FROM job_postings WHERE job_id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = result.rows[0];

    // Analyze requirements
    const analysis = {
      job_id: job.job_id,
      title: job.title,
      company: job.company,
      skill_categories: categorizeSkills(job.required_skills, job.preferred_skills),
      difficulty_estimate: estimateDifficulty(job),
      learning_time_estimate: estimateLearningTime(job),
      ideal_candidate_profile: buildCandidateProfile(job)
    };

    res.json(analysis);

  } catch (error) {
    console.error('[JobAnalysis] Analyze error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/jobs/:id/lesson-plan
 * Generate comprehensive learning roadmap for job
 */
router.post('/jobs/:id/lesson-plan', async (req, res) => {
  try {
    const { id } = req.params;
    const { current_skills = [] } = req.body;

    // Get job details
    const result = await pool.query(
      'SELECT * FROM job_postings WHERE job_id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = result.rows[0];

    // Generate lesson plan
    const lessonPlan = generateLessonPlan(job, current_skills);

    res.json(lessonPlan);

  } catch (error) {
    console.error('[JobAnalysis] Lesson plan error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/jobs/:id/pr
 * Generate PR and social media content for job posting
 */
router.post('/jobs/:id/pr', async (req, res) => {
  try {
    const { id } = req.params;
    const { templates = ['announcement', 'mission', 'impact', 'skillFocus'], baseUrl } = req.body;

    // Get job details
    const result = await pool.query(
      'SELECT * FROM job_postings WHERE job_id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = result.rows[0];

    // Generate PR content
    const prContent = prGenerator.generateAll(job, {
      includeTemplates: templates,
      baseUrl: baseUrl || 'https://calos.ai'
    });

    res.json(prContent);

  } catch (error) {
    console.error('[JobAnalysis] PR generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/jobs
 * Create a new job posting
 */
router.post('/jobs', async (req, res) => {
  try {
    const {
      title,
      company,
      location,
      job_type = 'full-time',
      description,
      required_skills = [],
      preferred_skills = [],
      salary_range,
      is_active = true,
      source_url,
      raw_data = {}
    } = req.body;

    // Validation
    if (!title || !company || !description) {
      return res.status(400).json({ error: 'Missing required fields: title, company, description' });
    }

    // Insert job
    const result = await pool.query(
      `INSERT INTO job_postings (
        title, company, location, job_type, description,
        required_skills, preferred_skills, salary_range,
        is_active, source_url, raw_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        title,
        company,
        location,
        job_type,
        description,
        required_skills,
        preferred_skills,
        salary_range,
        is_active,
        source_url,
        raw_data
      ]
    );

    res.status(201).json({
      message: 'Job created successfully',
      job: result.rows[0]
    });

  } catch (error) {
    console.error('[JobAnalysis] Create error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Categorize skills into groups
 */
function categorizeSkills(required, preferred = []) {
  const categories = {
    languages: [],
    frameworks: [],
    databases: [],
    cloud: [],
    devops: [],
    soft_skills: [],
    other: []
  };

  const allSkills = [...(required || []), ...(preferred || [])];

  allSkills.forEach(skill => {
    const lower = skill.toLowerCase();

    if (['python', 'javascript', 'typescript', 'java', 'go', 'rust', 'php'].some(lang => lower.includes(lang))) {
      categories.languages.push(skill);
    } else if (['react', 'vue', 'angular', 'django', 'flask', 'express', 'nest'].some(fw => lower.includes(fw))) {
      categories.frameworks.push(skill);
    } else if (['sql', 'postgres', 'mysql', 'mongo', 'redis', 'database'].some(db => lower.includes(db))) {
      categories.databases.push(skill);
    } else if (['aws', 'azure', 'gcp', 'cloud'].some(cloud => lower.includes(cloud))) {
      categories.cloud.push(skill);
    } else if (['docker', 'kubernetes', 'ci/cd', 'jenkins', 'github actions', 'terraform'].some(devops => lower.includes(devops))) {
      categories.devops.push(skill);
    } else if (['communication', 'leadership', 'teamwork', 'problem solving', 'analytics'].some(soft => lower.includes(soft))) {
      categories.soft_skills.push(skill);
    } else {
      categories.other.push(skill);
    }
  });

  return categories;
}

/**
 * Estimate difficulty level
 */
function estimateDifficulty(job) {
  const experienceYears = job.raw_data?.experience_years || '0';
  const skillCount = (job.required_skills || []).length;
  const hasAdvanced = (job.required_skills || []).some(skill =>
    ['kubernetes', 'ml', 'machine learning', 'distributed systems'].includes(skill.toLowerCase())
  );

  if (parseInt(experienceYears) >= 8 || skillCount > 15 || hasAdvanced) {
    return 'senior';
  } else if (parseInt(experienceYears) >= 3 || skillCount > 8) {
    return 'mid-level';
  } else {
    return 'entry-level';
  }
}

/**
 * Estimate learning time
 */
function estimateLearningTime(job) {
  const skillCount = (job.required_skills || []).length;
  const difficulty = estimateDifficulty(job);

  const baseHours = skillCount * 40; // 40 hours per skill

  const multiplier = {
    'entry-level': 1.0,
    'mid-level': 1.5,
    'senior': 2.0
  }[difficulty] || 1.0;

  const totalHours = Math.floor(baseHours * multiplier);
  const weeks = Math.ceil(totalHours / 40); // Full-time equivalent

  return {
    total_hours: totalHours,
    weeks_full_time: weeks,
    months_part_time: Math.ceil(weeks / 2)
  };
}

/**
 * Build ideal candidate profile
 */
function buildCandidateProfile(job) {
  return {
    experience: job.raw_data?.experience_years || 'Not specified',
    education: job.raw_data?.education || 'Not specified',
    must_have_skills: job.required_skills || [],
    nice_to_have_skills: job.preferred_skills || [],
    key_responsibilities: job.raw_data?.responsibilities || [],
    work_environment: job.raw_data?.work_environment || 'Not specified'
  };
}

/**
 * Generate comprehensive lesson plan
 */
function generateLessonPlan(job, currentSkills) {
  const allRequired = job.required_skills || [];
  const allPreferred = job.preferred_skills || [];

  // Calculate skill gaps
  const missingRequired = allRequired.filter(skill =>
    !currentSkills.some(current => current.toLowerCase() === skill.toLowerCase())
  );

  const missingPreferred = allPreferred.filter(skill =>
    !currentSkills.some(current => current.toLowerCase() === skill.toLowerCase())
  );

  // Build learning modules
  const modules = [];
  let weekCounter = 1;

  // Phase 1: Core Required Skills
  if (missingRequired.length > 0) {
    missingRequired.forEach(skill => {
      modules.push({
        week: weekCounter++,
        phase: 'core_requirements',
        skill: skill,
        estimated_hours: 40,
        learning_path: generateSkillPath(skill),
        projects: generateProjects(skill),
        resources: generateResources(skill)
      });
    });
  }

  // Phase 2: Preferred Skills
  if (missingPreferred.length > 0) {
    missingPreferred.slice(0, 3).forEach(skill => {
      modules.push({
        week: weekCounter++,
        phase: 'nice_to_have',
        skill: skill,
        estimated_hours: 20,
        learning_path: generateSkillPath(skill),
        projects: generateProjects(skill),
        resources: generateResources(skill)
      });
    });
  }

  // Phase 3: Integration & Portfolio
  modules.push({
    week: weekCounter++,
    phase: 'integration',
    skill: 'Final Project',
    estimated_hours: 80,
    description: `Build a portfolio project that demonstrates all required skills for ${job.title}`,
    projects: [
      `Create a project similar to ${job.company}'s core business`,
      'Document architecture decisions',
      'Write comprehensive tests',
      'Deploy to production'
    ]
  });

  return {
    job_id: job.job_id,
    title: job.title,
    company: job.company,
    summary: {
      total_skills_needed: allRequired.length,
      skills_you_have: currentSkills.length,
      skills_to_learn: missingRequired.length,
      total_weeks: weekCounter - 1,
      estimated_hours: modules.reduce((sum, m) => sum + m.estimated_hours, 0)
    },
    skill_gaps: {
      missing_required: missingRequired,
      missing_preferred: missingPreferred
    },
    learning_modules: modules,
    final_advice: generateFinalAdvice(job, missingRequired)
  };
}

/**
 * Generate learning path for a skill
 */
function generateSkillPath(skill) {
  const lower = skill.toLowerCase();

  const paths = {
    python: ['Python basics', 'Data structures', 'OOP', 'Async/await', 'Testing'],
    javascript: ['JS fundamentals', 'ES6+', 'Promises', 'Node.js', 'Testing'],
    docker: ['Containers 101', 'Dockerfile', 'Docker Compose', 'Networking', 'Production best practices'],
    kubernetes: ['Pods & Services', 'Deployments', 'ConfigMaps', 'Helm', 'Monitoring'],
    aws: ['EC2', 'S3', 'RDS', 'Lambda', 'CloudFormation'],
    sql: ['Basic queries', 'Joins', 'Indexes', 'Transactions', 'Optimization']
  };

  for (const [key, path] of Object.entries(paths)) {
    if (lower.includes(key)) {
      return path;
    }
  }

  return ['Fundamentals', 'Intermediate concepts', 'Advanced topics', 'Best practices', 'Real-world projects'];
}

/**
 * Generate practice projects
 */
function generateProjects(skill) {
  const lower = skill.toLowerCase();

  if (lower.includes('python')) {
    return ['Build a CLI tool', 'Create a REST API', 'Data analysis project'];
  } else if (lower.includes('docker')) {
    return ['Containerize an app', 'Multi-container setup', 'Production deployment'];
  } else if (lower.includes('aws')) {
    return ['Deploy static site', 'Serverless API', 'Auto-scaling web app'];
  } else {
    return ['Tutorial project', 'Personal project', 'Open-source contribution'];
  }
}

/**
 * Generate learning resources
 */
function generateResources(skill) {
  return [
    'Official documentation',
    'Interactive tutorials',
    'YouTube courses',
    'Practice exercises',
    'Community forums'
  ];
}

/**
 * Generate final advice
 */
function generateFinalAdvice(job, missingSkills) {
  if (missingSkills.length === 0) {
    return `You already have all required skills for ${job.title}! Focus on building a portfolio project and preparing for interviews.`;
  } else if (missingSkills.length <= 3) {
    return `You're close! Focus on ${missingSkills.join(', ')} and you'll be ready to apply for ${job.title} at ${job.company}.`;
  } else {
    return `This is a stretch role. Consider applying to junior positions first to build experience, then work towards ${job.title} in 1-2 years.`;
  }
}

module.exports = router;
