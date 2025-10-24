--
-- PostgreSQL database dump
--

-- Dumped from database version 14.17 (Homebrew)
-- Dumped by pg_dump version 14.17 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: learning_paths; Type: TABLE DATA; Schema: public; Owner: matthewmauer
--

INSERT INTO public.learning_paths (path_id, domain_id, path_name, path_slug, tagline, description, difficulty, total_lessons, estimated_hours, skills_learned, xp_reward_per_lesson, completion_badge_url, status, published_at, created_at, updated_at, icon_emoji) VALUES ('95518df4-58ab-498f-ba4b-8a9344de3c76', '00000000-0000-0000-0000-000000000001', 'Debugging Mastery', 'debugging-mastery', 'Learn OSS diagnostic tools from grep to Guardian-level automation', 'Master the essential debugging tools used in professional software development. Progress from basic pattern matching with grep to building autonomous monitoring systems like Guardian Agent.', 'beginner', 10, 5.00, '{debugging,shell-scripting,grep,sed,jq,diagnostics,automation}', 200, NULL, 'active', NULL, '2025-10-22 09:04:11.428846', '2025-10-22 09:04:11.428846', '📚');


--
-- PostgreSQL database dump complete
--

