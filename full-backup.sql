--
-- PostgreSQL database dump
--

-- Dumped from database version 15.12
-- Dumped by pg_dump version 17.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: admin
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO admin;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.chat_messages (
    id integer NOT NULL,
    game_id integer,
    sender_id integer NOT NULL,
    message text NOT NULL,
    "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.chat_messages OWNER TO admin;

--
-- Name: chat_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: admin
--

CREATE SEQUENCE public.chat_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.chat_messages_id_seq OWNER TO admin;

--
-- Name: chat_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: admin
--

ALTER SEQUENCE public.chat_messages_id_seq OWNED BY public.chat_messages.id;


--
-- Name: game_settings; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.game_settings (
    id integer NOT NULL,
    use_purple_cards boolean DEFAULT false,
    other_variants text
);


ALTER TABLE public.game_settings OWNER TO admin;

--
-- Name: game_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: admin
--

CREATE SEQUENCE public.game_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.game_settings_id_seq OWNER TO admin;

--
-- Name: game_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: admin
--

ALTER SEQUENCE public.game_settings_id_seq OWNED BY public.game_settings.id;


--
-- Name: games; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.games (
    id integer NOT NULL,
    player1_id integer NOT NULL,
    player2_id integer NOT NULL,
    status text NOT NULL,
    winner_id integer,
    score_player1 integer DEFAULT 0,
    score_player2 integer DEFAULT 0,
    started_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    ended_at timestamp without time zone,
    settings_id integer,
    CONSTRAINT games_status_check CHECK ((status = ANY (ARRAY['waiting'::text, 'in_progress'::text, 'finished'::text])))
);


ALTER TABLE public.games OWNER TO admin;

--
-- Name: games_id_seq; Type: SEQUENCE; Schema: public; Owner: admin
--

CREATE SEQUENCE public.games_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.games_id_seq OWNER TO admin;

--
-- Name: games_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: admin
--

ALTER SEQUENCE public.games_id_seq OWNED BY public.games.id;


--
-- Name: leaderboard; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.leaderboard (
    id integer NOT NULL,
    user_id integer NOT NULL,
    score integer NOT NULL,
    month integer NOT NULL,
    year integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT leaderboard_month_check CHECK (((month >= 1) AND (month <= 12)))
);


ALTER TABLE public.leaderboard OWNER TO admin;

--
-- Name: leaderboard_id_seq; Type: SEQUENCE; Schema: public; Owner: admin
--

CREATE SEQUENCE public.leaderboard_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.leaderboard_id_seq OWNER TO admin;

--
-- Name: leaderboard_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: admin
--

ALTER SEQUENCE public.leaderboard_id_seq OWNED BY public.leaderboard.id;


--
-- Name: moves; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.moves (
    id integer NOT NULL,
    game_id integer NOT NULL,
    player_id integer NOT NULL,
    turn_number integer NOT NULL,
    action text NOT NULL,
    card_played text,
    pile_color text,
    "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.moves OWNER TO admin;

--
-- Name: moves_id_seq; Type: SEQUENCE; Schema: public; Owner: admin
--

CREATE SEQUENCE public.moves_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.moves_id_seq OWNER TO admin;

--
-- Name: moves_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: admin
--

ALTER SEQUENCE public.moves_id_seq OWNED BY public.moves.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username text NOT NULL,
    email text NOT NULL,
    password text NOT NULL,
    avatar_url text,
    bio text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.users OWNER TO admin;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: admin
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO admin;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: admin
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: chat_messages id; Type: DEFAULT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.chat_messages ALTER COLUMN id SET DEFAULT nextval('public.chat_messages_id_seq'::regclass);


--
-- Name: game_settings id; Type: DEFAULT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.game_settings ALTER COLUMN id SET DEFAULT nextval('public.game_settings_id_seq'::regclass);


--
-- Name: games id; Type: DEFAULT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.games ALTER COLUMN id SET DEFAULT nextval('public.games_id_seq'::regclass);


--
-- Name: leaderboard id; Type: DEFAULT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.leaderboard ALTER COLUMN id SET DEFAULT nextval('public.leaderboard_id_seq'::regclass);


--
-- Name: moves id; Type: DEFAULT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.moves ALTER COLUMN id SET DEFAULT nextval('public.moves_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: chat_messages; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.chat_messages (id, game_id, sender_id, message, "timestamp") FROM stdin;
\.


--
-- Data for Name: game_settings; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.game_settings (id, use_purple_cards, other_variants) FROM stdin;
\.


--
-- Data for Name: games; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.games (id, player1_id, player2_id, status, winner_id, score_player1, score_player2, started_at, ended_at, settings_id) FROM stdin;
\.


--
-- Data for Name: leaderboard; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.leaderboard (id, user_id, score, month, year, created_at) FROM stdin;
\.


--
-- Data for Name: moves; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.moves (id, game_id, player_id, turn_number, action, card_played, pile_color, "timestamp") FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.users (id, username, email, password, avatar_url, bio, created_at) FROM stdin;
1	tom	tom@example.com	$2a$10$45exHZM9P9A34pfhEYebJ.Fom0QjUXq3dVLVllYu3BXOXo0nB93mW	\N	\N	2025-04-20 23:55:26.877472
3	mathilde	mathilde.duhommet@gmail.com	$2a$10$45exHZM9P9A34pfhEYebJ.Fom0QjUXq3dVLVllYu3BXOXo0nB93mW	\N	\N	2025-04-21 00:38:19.755881
\.


--
-- Name: chat_messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: admin
--

SELECT pg_catalog.setval('public.chat_messages_id_seq', 1, false);


--
-- Name: game_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: admin
--

SELECT pg_catalog.setval('public.game_settings_id_seq', 1, false);


--
-- Name: games_id_seq; Type: SEQUENCE SET; Schema: public; Owner: admin
--

SELECT pg_catalog.setval('public.games_id_seq', 1, false);


--
-- Name: leaderboard_id_seq; Type: SEQUENCE SET; Schema: public; Owner: admin
--

SELECT pg_catalog.setval('public.leaderboard_id_seq', 1, false);


--
-- Name: moves_id_seq; Type: SEQUENCE SET; Schema: public; Owner: admin
--

SELECT pg_catalog.setval('public.moves_id_seq', 1, false);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: admin
--

SELECT pg_catalog.setval('public.users_id_seq', 3, true);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: game_settings game_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.game_settings
    ADD CONSTRAINT game_settings_pkey PRIMARY KEY (id);


--
-- Name: games games_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT games_pkey PRIMARY KEY (id);


--
-- Name: leaderboard leaderboard_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.leaderboard
    ADD CONSTRAINT leaderboard_pkey PRIMARY KEY (id);


--
-- Name: moves moves_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.moves
    ADD CONSTRAINT moves_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: games games_player1_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT games_player1_id_fkey FOREIGN KEY (player1_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: games games_player2_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT games_player2_id_fkey FOREIGN KEY (player2_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: games games_settings_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT games_settings_id_fkey FOREIGN KEY (settings_id) REFERENCES public.game_settings(id) ON DELETE CASCADE;


--
-- Name: games games_winner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT games_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: leaderboard leaderboard_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.leaderboard
    ADD CONSTRAINT leaderboard_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: moves moves_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.moves
    ADD CONSTRAINT moves_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;


--
-- Name: moves moves_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.moves
    ADD CONSTRAINT moves_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: -; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT ALL ON SEQUENCES TO admin;


--
-- Name: DEFAULT PRIVILEGES FOR TYPES; Type: DEFAULT ACL; Schema: -; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT ALL ON TYPES TO admin;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: -; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT ALL ON FUNCTIONS TO admin;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: -; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLES TO admin;


--
-- PostgreSQL database dump complete
--

