-- Insert CALOS Job Postings
-- Mission-focused roles for world-changers

-- 1. Senior Full-Stack Engineer
INSERT INTO job_postings (
  title,
  company,
  location,
  job_type,
  description,
  required_skills,
  preferred_skills,
  salary_range,
  is_active,
  raw_data
) VALUES (
  'Senior Full-Stack Engineer',
  'CALOS',
  'Remote (Worldwide)',
  'full-time',
  'Join us in building the future of AI routing and multi-model intelligence. You''ll architect and build scalable systems that power our AI routing platform, work with cutting-edge LLMs, and help democratize access to AI for developers worldwide.',
  ARRAY[
    'javascript',
    'typescript',
    'node.js',
    'react',
    'postgresql',
    'rest api',
    'docker',
    'git',
    'websockets'
  ]::TEXT[],
  ARRAY[
    'python',
    'aws',
    'kubernetes',
    'redis',
    'graphql',
    'llm integration',
    'prompt engineering'
  ]::TEXT[],
  '$120,000 - $180,000 + equity',
  true,
  jsonb_build_object(
    'responsibilities', jsonb_build_array(
      'Build and maintain core CALOS routing infrastructure',
      'Design APIs for multi-LLM integration (OpenAI, Anthropic, DeepSeek, Ollama)',
      'Create real-time collaboration features',
      'Implement caching and optimization strategies',
      'Write clean, tested, documented code',
      'Mentor junior engineers',
      'Contribute to technical decisions and architecture'
    ),
    'experience_years', '5+',
    'education', 'BS in Computer Science or equivalent experience',
    'work_environment', 'Remote-first, async communication, flexible hours',
    'perks', jsonb_build_array(
      'Work from anywhere',
      'Flexible schedule',
      'Equity package',
      'Learning & conference budget',
      'Latest hardware',
      'Health insurance',
      '4 weeks PTO'
    ),
    'mission', 'We''re democratizing AI access. Your code will help developers worldwide build better products faster.'
  )
);

-- 2. DevOps/Infrastructure Engineer
INSERT INTO job_postings (
  title,
  company,
  location,
  job_type,
  description,
  required_skills,
  preferred_skills,
  salary_range,
  is_active,
  raw_data
) VALUES (
  'DevOps/Infrastructure Engineer',
  'CALOS',
  'Remote (Worldwide)',
  'full-time',
  'We need someone who can scale our infrastructure to handle millions of AI requests per day. You''ll build deployment pipelines, monitoring systems, and ensure 99.9% uptime for our multi-LLM routing platform.',
  ARRAY[
    'docker',
    'kubernetes',
    'aws',
    'ci/cd',
    'linux',
    'terraform',
    'monitoring',
    'postgresql'
  ]::TEXT[],
  ARRAY[
    'python',
    'bash',
    'prometheus',
    'grafana',
    'elk stack',
    'nginx',
    'load balancing'
  ]::TEXT[],
  '$130,000 - $190,000 + equity',
  true,
  jsonb_build_object(
    'responsibilities', jsonb_build_array(
      'Design and maintain cloud infrastructure (AWS/GCP)',
      'Build CI/CD pipelines for rapid deployment',
      'Implement monitoring and alerting systems',
      'Optimize for performance and cost',
      'Ensure security best practices',
      'Handle scaling and reliability',
      'Automate everything'
    ),
    'experience_years', '4+',
    'education', 'BS in Computer Science or equivalent experience',
    'work_environment', 'Remote-first, on-call rotation, collaborative',
    'perks', jsonb_build_array(
      'Work from anywhere',
      'On-call bonus',
      'Equity package',
      'AWS/GCP certification budget',
      'Latest hardware',
      'Health insurance',
      '4 weeks PTO'
    ),
    'mission', 'You''ll ensure our platform is fast, reliable, and scales to serve the world.'
  )
);

-- 3. AI/ML Engineer
INSERT INTO job_postings (
  title,
  company,
  location,
  job_type,
  description,
  required_skills,
  preferred_skills,
  salary_range,
  is_active,
  raw_data
) VALUES (
  'AI/ML Engineer',
  'CALOS',
  'Remote (Worldwide)',
  'full-time',
  'Help us build the smartest AI routing system in the world. You''ll research and implement routing algorithms, fine-tune models, and create features that automatically select the best LLM for each task.',
  ARRAY[
    'python',
    'machine learning',
    'llm',
    'prompt engineering',
    'pytorch',
    'numpy',
    'pandas',
    'rest api'
  ]::TEXT[],
  ARRAY[
    'tensorflow',
    'transformers',
    'langchain',
    'vector databases',
    'fine-tuning',
    'rag',
    'embedding models'
  ]::TEXT[],
  '$140,000 - $200,000 + equity',
  true,
  jsonb_build_object(
    'responsibilities', jsonb_build_array(
      'Research and implement AI routing algorithms',
      'Fine-tune models for specific use cases',
      'Build prompt optimization systems',
      'Integrate new LLMs and APIs',
      'Analyze model performance and costs',
      'Create evaluation frameworks',
      'Stay current with AI research'
    ),
    'experience_years', '3+',
    'education', 'MS/PhD in ML/CS or equivalent experience',
    'work_environment', 'Remote-first, research-friendly, cutting-edge',
    'perks', jsonb_build_array(
      'Work from anywhere',
      'Conference & research budget',
      'Equity package',
      'Access to all major LLM APIs',
      'Latest hardware + GPU access',
      'Health insurance',
      '4 weeks PTO'
    ),
    'mission', 'You''ll help developers get the most out of AI by building the smartest routing system ever created.'
  )
);

-- 4. Community Manager / Developer Advocate
INSERT INTO job_postings (
  title,
  company,
  location,
  job_type,
  description,
  required_skills,
  preferred_skills,
  salary_range,
  is_active,
  raw_data
) VALUES (
  'Community Manager / Developer Advocate',
  'CALOS',
  'Remote (Worldwide)',
  'full-time',
  'Be the voice of CALOS. You''ll build and nurture our developer community, create content, speak at conferences, and help developers get the most out of our platform. You''re technical enough to code examples and passionate enough to inspire others.',
  ARRAY[
    'developer relations',
    'technical writing',
    'public speaking',
    'community building',
    'javascript',
    'social media',
    'content creation'
  ]::TEXT[],
  ARRAY[
    'python',
    'video editing',
    'streaming',
    'conference speaking',
    'open source',
    'teaching',
    'marketing'
  ]::TEXT[],
  '$90,000 - $140,000 + equity',
  true,
  jsonb_build_object(
    'responsibilities', jsonb_build_array(
      'Build and grow developer community (Discord, Twitter, etc)',
      'Create tutorials, docs, and example code',
      'Speak at conferences and meetups',
      'Write technical blog posts',
      'Support developers using CALOS',
      'Gather feedback and work with product team',
      'Create videos and livestreams',
      'Represent CALOS at events'
    ),
    'experience_years', '3+',
    'education', 'Any (technical background preferred)',
    'work_environment', 'Remote-first, travel for conferences, async',
    'perks', jsonb_build_array(
      'Work from anywhere',
      'Conference travel',
      'Equity package',
      'Content creation budget',
      'Latest hardware',
      'Health insurance',
      '4 weeks PTO'
    ),
    'mission', 'You''ll help thousands of developers discover and succeed with CALOS.'
  )
);

-- 5. Product Designer (UI/UX)
INSERT INTO job_postings (
  title,
  company,
  location,
  job_type,
  description,
  required_skills,
  preferred_skills,
  salary_range,
  is_active,
  raw_data
) VALUES (
  'Product Designer (UI/UX)',
  'CALOS',
  'Remote (Worldwide)',
  'full-time',
  'Design beautiful, intuitive interfaces for our AI routing platform. You''ll create dashboards, developer tools, and user experiences that make complex AI systems feel simple and powerful.',
  ARRAY[
    'ui design',
    'ux design',
    'figma',
    'prototyping',
    'user research',
    'html',
    'css',
    'responsive design'
  ]::TEXT[],
  ARRAY[
    'javascript',
    'react',
    'animation',
    'illustration',
    'design systems',
    'accessibility',
    'user testing'
  ]::TEXT[],
  '$100,000 - $160,000 + equity',
  true,
  jsonb_build_object(
    'responsibilities', jsonb_build_array(
      'Design user interfaces for web and mobile',
      'Create prototypes and mockups',
      'Conduct user research and testing',
      'Build design systems and component libraries',
      'Collaborate with engineers',
      'Create illustrations and graphics',
      'Ensure accessibility standards',
      'Ship pixel-perfect interfaces'
    ),
    'experience_years', '4+',
    'education', 'Design degree or equivalent portfolio',
    'work_environment', 'Remote-first, collaborative, user-focused',
    'perks', jsonb_build_array(
      'Work from anywhere',
      'Design tools budget',
      'Equity package',
      'Latest hardware',
      'Health insurance',
      '4 weeks PTO'
    ),
    'mission', 'You''ll make AI accessible through beautiful, intuitive design.'
  )
);

-- 6. Junior Full-Stack Engineer
INSERT INTO job_postings (
  title,
  company,
  location,
  job_type,
  description,
  required_skills,
  preferred_skills,
  salary_range,
  is_active,
  raw_data
) VALUES (
  'Junior Full-Stack Engineer',
  'CALOS',
  'Remote (Worldwide)',
  'full-time',
  'Start your career building the future of AI. You''ll work alongside senior engineers, learn cutting-edge technologies, and contribute to real features from day one. Perfect for new grads or career changers with strong fundamentals.',
  ARRAY[
    'javascript',
    'node.js',
    'react',
    'html',
    'css',
    'git',
    'rest api',
    'sql'
  ]::TEXT[],
  ARRAY[
    'typescript',
    'docker',
    'postgresql',
    'python',
    'aws',
    'testing',
    'open source'
  ]::TEXT[],
  '$70,000 - $100,000 + equity',
  true,
  jsonb_build_object(
    'responsibilities', jsonb_build_array(
      'Build features for CALOS platform',
      'Write tests and documentation',
      'Fix bugs and improve code quality',
      'Learn from senior engineers',
      'Participate in code reviews',
      'Contribute to technical discussions'
    ),
    'experience_years', '0-2',
    'education', 'BS in Computer Science or bootcamp/self-taught with portfolio',
    'work_environment', 'Remote-first, mentorship-focused, learning-oriented',
    'perks', jsonb_build_array(
      'Work from anywhere',
      'Mentorship program',
      'Equity package',
      'Learning budget',
      'Latest hardware',
      'Health insurance',
      '4 weeks PTO'
    ),
    'mission', 'You''ll grow into a world-class engineer while building technology that matters.'
  )
);

-- Verify inserts
SELECT
  job_id,
  title,
  company,
  location,
  salary_range,
  array_length(required_skills, 1) as skills_count,
  created_at
FROM job_postings
WHERE company = 'CALOS'
ORDER BY created_at DESC;
