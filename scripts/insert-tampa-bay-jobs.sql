-- Insert Tampa Bay Lightning Jobs
-- Scraped from teamworkonline.com

-- 1. Software Developer
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
  source_url,
  raw_data
) VALUES (
  'Software Developer',
  'Tampa Bay Lightning',
  'Tampa, FL',
  'full-time',
  'A DevOps-focused software developer role responsible for designing, developing, and deploying automated solutions for the hockey analytics platform, working closely with the DevOps & Data Engineering team.',
  ARRAY[
    'python',
    'sql',
    'nosql',
    'aws',
    'docker',
    'kubernetes',
    'ci/cd',
    'etl',
    'rest api',
    'linux',
    'database architecture'
  ]::TEXT[],
  ARRAY[
    'flask',
    'django',
    'airflow',
    'javascript',
    'html',
    'css'
  ]::TEXT[],
  NULL,
  true,
  'https://www.teamworkonline.com/hockey-jobs/tampanhl/tampa-bay-lightning-jobs/software-developer-2129566',
  jsonb_build_object(
    'responsibilities', jsonb_build_array(
      'Design and maintain core infrastructure for hockey analytics platform',
      'Develop internal tools and dashboards',
      'Monitor system performance',
      'Build and maintain CI/CD pipelines',
      'Collaborate with cross-functional teams',
      'Conduct code reviews',
      'Mentor junior developers',
      'Write automated tests'
    ),
    'education', 'Bachelor''s/Master''s in Computer Science or related field',
    'experience_years', '3+',
    'work_environment', 'Onsite with minimal remote flexibility',
    'conditions', jsonb_build_array(
      'Work in potentially loud/exciting arena environment',
      'Extended/flexible hours',
      'Physical requirements: sitting for long periods, lifting up to 10 lbs',
      'Varied temperatures and crowded spaces'
    )
  )
);

-- 2. VP Digital Brand
INSERT INTO job_postings (
  title,
  company,
  location,
  job_type,
  description,
  required_skills,
  salary_range,
  is_active,
  source_url,
  raw_data
) VALUES (
  'VP Digital Brand',
  'Tampa Bay Lightning',
  'Tampa, FL',
  'full-time',
  'Senior leadership role developing and implementing digital marketing strategies, overseeing campaigns across multiple platforms, and driving revenue growth through digital channels.',
  ARRAY[
    'digital marketing',
    'strategy',
    'social media',
    'seo',
    'algorithms',
    'analytics',
    'team leadership',
    'budget management',
    'kpi tracking',
    'audience growth'
  ]::TEXT[],
  NULL,
  true,
  'https://www.teamworkonline.com/hockey-jobs/tampanhl/tampa-bay-lightning-jobs/vp-digital-brand-2136492',
  jsonb_build_object(
    'responsibilities', jsonb_build_array(
      'Develop and implement digital marketing strategies',
      'Oversee digital campaigns across multiple platforms',
      'Guide digital marketing team',
      'Drive revenue growth through digital channels',
      'Create comprehensive digital marketing plans',
      'Identify target audiences',
      'Set measurable KPIs and objectives',
      'Build and lead high-performing digital marketing team',
      'Manage digital marketing budgets',
      'Analyze campaign performance'
    ),
    'education', 'Bachelor''s degree in marketing/digital marketing',
    'experience_years', '10+',
    'seniority', 'Senior Level',
    'work_environment', 'Onsite with minimal remote flexibility',
    'conditions', jsonb_build_array(
      'Extended hours including nights/weekends',
      'Travel within US and Canada required',
      'Work in office and arena environments'
    )
  )
);

-- 3. Data Scientist
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
  source_url,
  raw_data
) VALUES (
  'Data Scientist',
  'Tampa Bay Lightning',
  'Tampa, FL',
  'full-time',
  'Work with hockey data to fulfill given directives as well as the ability to create new projects and communicate results. Build and validate hockey metrics models, collaborate with data scientists and engineers, and communicate project results to coaches and management.',
  ARRAY[
    'python',
    'docker',
    'sql',
    'time series analysis',
    'geometry',
    'physics',
    'git',
    'problem solving',
    'data science',
    'research implementation'
  ]::TEXT[],
  ARRAY[
    'machine learning',
    'statistical modeling',
    'sports analytics',
    'graduate degree in physics/math/engineering'
  ]::TEXT[],
  NULL,
  true,
  'https://www.teamworkonline.com/hockey-jobs/tampanhl/tampa-bay-lightning-jobs/data-scientist-2132666',
  jsonb_build_object(
    'responsibilities', jsonb_build_array(
      'Build and validate hockey metrics models',
      'Create projects to advance hockey understanding',
      'Collaborate with data scientists and engineers',
      'Communicate project results to coaches and management',
      'Write geometric and physics analyses',
      'Implement sports/data science research'
    ),
    'education', 'Degree in Computer Science, Math, Engineering, or Physics',
    'experience_years', '3-5',
    'department', 'Hockey Analytics',
    'reports_to', 'Director and Associate Director of Hockey Analytics',
    'perks', jsonb_build_array(
      'Potential travel a few times per year',
      'Option to attend home games'
    ),
    'application_requirements', jsonb_build_object(
      'cover_letter', jsonb_build_array(
        'Discuss proud work/project',
        'Explain position interest',
        'Provide open-source/public work examples'
      )
    )
  )
);

-- Verify inserts
SELECT
  job_id,
  title,
  company,
  location,
  array_length(required_skills, 1) as skill_count,
  created_at
FROM job_postings
WHERE company = 'Tampa Bay Lightning'
ORDER BY created_at DESC;
