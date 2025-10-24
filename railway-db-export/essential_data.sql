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
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: matthewmauer
--

INSERT INTO public.users (id, email, username, created_at, handle, handle_lowercase, handle_set_at, handle_changes_remaining) VALUES (1, 'test@example.com', 'testuser', '2025-10-22 17:28:05.229592', NULL, NULL, NULL, 1);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: matthewmauer
--

SELECT pg_catalog.setval('public.users_id_seq', 1, true);


--
-- PostgreSQL database dump complete
--

