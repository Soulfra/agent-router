-- Seed Data for Onboarding System
-- Archetypes and Survey Questions

-- Clear existing data (for re-seeding)
TRUNCATE archetypes, survey_questions RESTART IDENTITY CASCADE;

-- Seed Archetypes
INSERT INTO archetypes (name, slug, description, icon, traits, example_brands, color) VALUES
  ('The Creator', 'creator', 'Builders and makers who bring ideas to life through hands-on work', 'palette', '["innovative", "artistic", "hands-on", "expressive", "original"]', '{"Apple", "Adobe", "Lego"}', '#FF6B6B'),
  ('The Visionary', 'visionary', 'Big-picture thinkers who see possibilities others miss', 'telescope', '["strategic", "forward-thinking", "ambitious", "inspirational", "revolutionary"]', '{"Tesla", "SpaceX", "Virgin"}', '#4ECDC4'),
  ('The Analyst', 'analyst', 'Data-driven problem solvers who optimize and refine', 'chart-bar', '["logical", "detail-oriented", "systematic", "precise", "analytical"]', '{"Google", "McKinsey", "Bloomberg"}', '#45B7D1'),
  ('The Maverick', 'maverick', 'Rule-breakers who challenge the status quo', 'fire', '["rebellious", "bold", "unconventional", "disruptive", "fearless"]', '{"Harley Davidson", "Red Bull", "Supreme"}', '#F38181'),
  ('The Caregiver', 'caregiver', 'Nurturers focused on helping and serving others', 'heart', '["compassionate", "supportive", "empathetic", "protective", "generous"]', '{"Johnson & Johnson", "TOMS", "Dove"}', '#95E1D3'),
  ('The Connector', 'connector', 'Network builders who bring people together', 'users', '["social", "collaborative", "charismatic", "inclusive", "communicative"]', '{"LinkedIn", "Airbnb", "WeWork"}', '#AA96DA'),
  ('The Explorer', 'explorer', 'Adventurers seeking new experiences and frontiers', 'compass', '["curious", "adventurous", "independent", "authentic", "pioneering"]', '{"Patagonia", "The North Face", "National Geographic"}', '#FCBAD3'),
  ('The Sage', 'sage', 'Knowledge seekers and teachers who value wisdom', 'book-open', '["intelligent", "thoughtful", "educational", "trustworthy", "reflective"]', '{"Harvard", "TED", "BBC"}', '#A8D8EA');

-- Seed Survey Questions
-- Level 1: Basic Identity (Payment: $5 total)
INSERT INTO survey_questions (level, question_order, question_text, question_type, options, placeholder, help_text, base_reward, category, validation_rules) VALUES
  (1, 1, 'What is your full name?', 'text', NULL, 'John Smith', 'Your legal or preferred full name', 1.00, 'identity', '{"minLength": 2, "maxLength": 100}'),
  (1, 2, 'What do you want to be known as?', 'text', NULL, 'Johnny', 'This could be a nickname, your first name, or how you introduce yourself', 2.00, 'identity', '{"minLength": 1, "maxLength": 50}'),
  (1, 3, 'What is your email address?', 'text', NULL, 'your@email.com', 'We need this to send your payment', 2.00, 'identity', '{"pattern": "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"}');

-- Level 2: Domain Interest (Payment: +$5)
INSERT INTO survey_questions (level, question_order, question_text, question_type, options, placeholder, help_text, base_reward, category, validation_rules) VALUES
  (2, 1, 'What domain or industry interests you most?', 'choice',
   '["Technology", "Fashion & Beauty", "Health & Wellness", "Finance & Investing", "Food & Beverage", "Education", "Entertainment & Media", "Sports & Fitness", "Home & Lifestyle", "Other"]',
   NULL, 'Choose the area where you want to build something', 2.50, 'domain', NULL),
  (2, 2, 'Why does this domain excite you?', 'textarea', NULL, NULL, 'Tell us what draws you to this space', 2.50, 'domain', '{"minLength": 50, "maxLength": 500}');

-- Level 3: Archetype Selection (Payment: +$5)
INSERT INTO survey_questions (level, question_order, question_text, question_type, options, placeholder, help_text, base_reward, category, validation_rules) VALUES
  (3, 1, 'Which archetype resonates with you most?', 'archetype-select', NULL, NULL, 'Select the personality that best describes how you want to show up in the world', 3.00, 'archetype', NULL),
  (3, 2, 'How does this archetype show up in your daily life?', 'textarea', NULL, NULL, 'Give us a specific example of how these traits manifest in your work or hobbies', 2.00, 'archetype', '{"minLength": 100, "maxLength": 500}');

-- Level 4: Vision & Purpose (Payment: +$10)
INSERT INTO survey_questions (level, question_order, question_text, question_type, options, placeholder, help_text, base_reward, category, validation_rules) VALUES
  (4, 1, 'If you could solve one problem in your chosen domain, what would it be?', 'textarea', NULL, NULL, 'Be specific about the problem and who experiences it', 3.00, 'vision', '{"minLength": 100, "maxLength": 1000}'),
  (4, 2, 'Who would benefit most from solving this problem?', 'textarea', NULL, NULL, 'Describe your ideal target audience or customer', 3.00, 'vision', '{"minLength": 50, "maxLength": 500}'),
  (4, 3, 'What change do you want to see in the world?', 'textarea', NULL, NULL, 'Think beyond profit - what impact do you want to make?', 4.00, 'vision', '{"minLength": 100, "maxLength": 500}');

-- Level 5: Brand Values (Payment: +$10)
INSERT INTO survey_questions (level, question_order, question_text, question_type, options, placeholder, help_text, base_reward, category, validation_rules) VALUES
  (5, 1, 'Select 3-5 core values that would define your brand:', 'multi-choice',
   '["Authenticity", "Innovation", "Excellence", "Sustainability", "Community", "Empowerment", "Simplicity", "Adventure", "Trust", "Creativity", "Freedom", "Impact", "Quality", "Transparency", "Fun"]',
   NULL, 'Choose values that you would never compromise on', 3.00, 'values', NULL),
  (5, 2, 'Why are these values non-negotiable for you?', 'textarea', NULL, NULL, 'Connect these values to your personal story or beliefs', 4.00, 'values', '{"minLength": 150, "maxLength": 750}'),
  (5, 3, 'Give an example of how you live one of these values today:', 'textarea', NULL, NULL, 'Make it concrete and personal', 3.00, 'values', '{"minLength": 100, "maxLength": 500}');

-- Level 6: Target Audience Deep Dive (Payment: +$15)
INSERT INTO survey_questions (level, question_order, question_text, question_type, options, placeholder, help_text, base_reward, category, validation_rules) VALUES
  (6, 1, 'Describe your ideal customer in vivid detail:', 'textarea', NULL, NULL, 'Age, location, job, interests, pain points, aspirations - paint a picture of a real person', 5.00, 'audience', '{"minLength": 200, "maxLength": 1000}'),
  (6, 2, 'What does a typical day look like for them?', 'textarea', NULL, NULL, 'Walk us through their morning routine, work, evening - where does your product fit?', 5.00, 'audience', '{"minLength": 150, "maxLength": 750}'),
  (6, 3, 'What keeps them up at night?', 'textarea', NULL, NULL, 'What are their biggest fears, frustrations, or challenges?', 5.00, 'audience', '{"minLength": 100, "maxLength": 500}');

-- Level 7: Business Model (Payment: +$20)
INSERT INTO survey_questions (level, question_order, question_text, question_type, options, placeholder, help_text, base_reward, category, validation_rules) VALUES
  (7, 1, 'What business model makes most sense for your idea?', 'choice',
   '["Direct to Consumer (D2C)", "B2B/Enterprise", "Subscription/Membership", "Marketplace/Platform", "Freemium", "Advertising", "Licensing", "Not sure yet"]',
   NULL, 'How will you make money?', 5.00, 'business', NULL),
  (7, 2, 'Describe your primary revenue stream:', 'textarea', NULL, NULL, 'How exactly will customers pay you? What are they paying for?', 7.00, 'business', '{"minLength": 100, "maxLength": 750}'),
  (7, 3, 'What would you charge, and why?', 'textarea', NULL, NULL, 'Give a specific price point and justify it based on value delivered', 8.00, 'business', '{"minLength": 100, "maxLength": 500}');

-- Level 8: Competitive Positioning (Payment: +$25)
INSERT INTO survey_questions (level, question_order, question_text, question_type, options, placeholder, help_text, base_reward, category, validation_rules) VALUES
  (8, 1, 'Who are your top 3 competitors or alternatives?', 'textarea', NULL, NULL, 'Name them and briefly explain what they do', 7.00, 'positioning', '{"minLength": 100, "maxLength": 750}'),
  (8, 2, 'What makes you fundamentally different?', 'textarea', NULL, NULL, 'Not just features - what is your unique insight or approach?', 10.00, 'positioning', '{"minLength": 150, "maxLength": 1000}'),
  (8, 3, 'Why would someone choose you over the alternatives?', 'textarea', NULL, NULL, 'Be honest and specific about your unique value', 8.00, 'positioning', '{"minLength": 100, "maxLength": 750}');

-- Level 9: Brand Personality (Payment: +$30)
INSERT INTO survey_questions (level, question_order, question_text, question_type, options, placeholder, help_text, base_reward, category, validation_rules) VALUES
  (9, 1, 'If your brand was a person, how would you describe their personality?', 'textarea', NULL, NULL, 'Use adjectives - are they serious or playful? Formal or casual? Bold or subtle?', 10.00, 'personality', '{"minLength": 100, "maxLength": 500}'),
  (9, 2, 'What would your brand NEVER say or do?', 'textarea', NULL, NULL, 'Define boundaries - what is out of character for your brand?', 10.00, 'personality', '{"minLength": 100, "maxLength": 500}'),
  (9, 3, 'Create a tagline or mission statement:', 'text', NULL, NULL, 'Sum up your brand in one memorable sentence (5-15 words)', 10.00, 'personality', '{"minLength": 5, "maxLength": 100}');

-- Level 10: Full Brand Strategy (Payment: +$50)
INSERT INTO survey_questions (level, question_order, question_text, question_type, options, placeholder, help_text, base_reward, category, validation_rules) VALUES
  (10, 1, 'What would your first product or service be?', 'textarea', NULL, NULL, 'Be extremely specific - describe features, experience, pricing', 15.00, 'strategy', '{"minLength": 200, "maxLength": 1500}'),
  (10, 2, 'How would you acquire your first 100 customers?', 'textarea', NULL, NULL, 'Give us a realistic, tactical plan with channels and tactics', 15.00, 'strategy', '{"minLength": 200, "maxLength": 1000}'),
  (10, 3, 'What would success look like in 1 year? 5 years?', 'textarea', NULL, NULL, 'Set concrete goals - revenue, customers, impact metrics', 10.00, 'strategy', '{"minLength": 150, "maxLength": 1000}'),
  (10, 4, 'Why will this brand still matter in 10 years?', 'textarea', NULL, NULL, 'What is the timeless insight or need you are addressing?', 10.00, 'strategy', '{"minLength": 100, "maxLength": 750}');

SELECT 'Seed data loaded: ' ||
  (SELECT COUNT(*) FROM archetypes) || ' archetypes, ' ||
  (SELECT COUNT(*) FROM survey_questions) || ' questions' as status;
