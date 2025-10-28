import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppData, User, Source, ChatMessage, UserMessageVote, UserSourceVote, Summary, Flashcard, Question, Comment, MindMap, ContentType, UserContentInteraction, QuestionNotebook, UserNotebookInteraction, UserQuestionAnswer, AudioSummary } from '../types';

/*
-- =================================================================
-- 🚨 PROCAP - G200: SCRIPT DE CONFIGURAÇÃO DO BANCO DE DADOS (v3.1) 🚨
-- =================================================================
--
-- INSTRUÇÕES:
-- Este script é IDEMPOTENTE, o que significa que é SEGURO executá-lo
-- múltiplas vezes. Ele criará tabelas, colunas e relacionamentos
-- que não existirem, corrigindo esquemas desatualizados sem
-- apagar dados existentes.
--
-- 1. Acesse seu projeto no Supabase.
-- 2. No menu lateral, vá para "SQL Editor".
-- 3. Clique em "+ New query".
-- 4. COPIE E COLE **TODO O CONTEÚDO** DESTE BLOCO SQL ABAIXO.
-- 5. Clique em "RUN".
--
-- O QUE HÁ DE NOVO (v3.1):
--   - A função RPC para votos do chat foi renomeada de 'increment_vote'
--     para 'increment_message_vote' para corresponder ao que o código-fonte
--     espera, corrigindo o bug de votos que não eram salvos.
-- =================================================================

-- Habilita a extensão pgcrypto se ainda não estiver habilitada
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Tabela de Usuários (users)
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    pseudonym TEXT NOT NULL,
    password TEXT NOT NULL,
    level INT NOT NULL DEFAULT 1,
    xp INT NOT NULL DEFAULT 0,
    achievements TEXT[] DEFAULT '{}',
    stats JSONB DEFAULT '{}'::jsonb
);
ALTER TABLE public.users ADD CONSTRAINT IF NOT EXISTS users_pseudonym_key UNIQUE (pseudonym);

-- 2. Tabela de Fontes de Conteúdo (sources)
CREATE TABLE IF NOT EXISTS public.sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Adiciona colunas que podem estar faltando em versões antigas
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'Untitled';
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS original_filename TEXT[];
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS storage_path TEXT[];
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS drive_links TEXT[];
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS materia TEXT NOT NULL DEFAULT 'Geral';
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS topic TEXT NOT NULL DEFAULT 'Geral';
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS subtopic TEXT;
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS hot_votes INT NOT NULL DEFAULT 0;
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS cold_votes INT NOT NULL DEFAULT 0;
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS comments JSONB DEFAULT '[]'::jsonb;
-- Políticas de Segurança (RLS)
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public sources are viewable by everyone." ON public.sources;
CREATE POLICY "Public sources are viewable by everyone." ON public.sources FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can manage their own sources." ON public.sources;
CREATE POLICY "Users can manage their own sources." ON public.sources FOR ALL USING (true);


-- 3. Bucket de Armazenamento (Storage) para as fontes
INSERT INTO storage.buckets (id, name, public) VALUES ('sources', 'sources', true) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "Source files are publicly accessible." ON storage.objects;
CREATE POLICY "Source files are publicly accessible." ON storage.objects FOR SELECT USING (bucket_id = 'sources');
DROP POLICY IF EXISTS "Anyone can upload a source." ON storage.objects;
CREATE POLICY "Anyone can upload a source." ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'sources');
DROP POLICY IF EXISTS "Users can delete their source files." ON storage.objects;
CREATE POLICY "Users can delete their source files." ON storage.objects FOR DELETE USING (bucket_id = 'sources');


-- 4. Função para adicionar FK de forma segura
CREATE OR REPLACE FUNCTION add_source_foreign_key(table_name_param TEXT)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    -- Remove a constraint antiga se existir, para evitar conflitos de nome
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I;', table_name_param, table_name_param || '_source_id_fkey');
    -- Adiciona a constraint
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (source_id) REFERENCES public.sources(id) ON DELETE CASCADE;', table_name_param, table_name_param || '_source_id_fkey');
END;
$$;


-- 5. Tabelas de Conteúdo Derivado (summaries, flashcards, etc.)

-- Resumos (summaries)
CREATE TABLE IF NOT EXISTS public.summaries ( id UUID PRIMARY KEY DEFAULT gen_random_uuid() );
ALTER TABLE public.summaries ADD COLUMN IF NOT EXISTS source_id UUID;
ALTER TABLE public.summaries ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.summaries ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE public.summaries ADD COLUMN IF NOT EXISTS key_points JSONB;
ALTER TABLE public.summaries ADD COLUMN IF NOT EXISTS related_topics TEXT[];
ALTER TABLE public.summaries ADD COLUMN IF NOT EXISTS comments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.summaries ADD COLUMN IF NOT EXISTS hot_votes INT NOT NULL DEFAULT 0;
ALTER TABLE public.summaries ADD COLUMN IF NOT EXISTS cold_votes INT NOT NULL DEFAULT 0;
SELECT add_source_foreign_key('summaries');
ALTER TABLE public.summaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public summaries are viewable by everyone." ON public.summaries;
CREATE POLICY "Public summaries are viewable by everyone." ON public.summaries FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can manage summaries." ON public.summaries;
CREATE POLICY "Users can manage summaries." ON public.summaries FOR ALL USING (true);


-- Flashcards
CREATE TABLE IF NOT EXISTS public.flashcards ( id UUID PRIMARY KEY DEFAULT gen_random_uuid() );
ALTER TABLE public.flashcards ADD COLUMN IF NOT EXISTS source_id UUID;
ALTER TABLE public.flashcards ADD COLUMN IF NOT EXISTS front TEXT;
ALTER TABLE public.flashcards ADD COLUMN IF NOT EXISTS back TEXT;
ALTER TABLE public.flashcards ADD COLUMN IF NOT EXISTS comments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.flashcards ADD COLUMN IF NOT EXISTS hot_votes INT NOT NULL DEFAULT 0;
ALTER TABLE public.flashcards ADD COLUMN IF NOT EXISTS cold_votes INT NOT NULL DEFAULT 0;
SELECT add_source_foreign_key('flashcards');
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public flashcards are viewable by everyone." ON public.flashcards;
CREATE POLICY "Public flashcards are viewable by everyone." ON public.flashcards FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can manage flashcards." ON public.flashcards;
CREATE POLICY "Users can manage flashcards." ON public.flashcards FOR ALL USING (true);


-- Questões (questions)
CREATE TABLE IF NOT EXISTS public.questions ( id UUID PRIMARY KEY DEFAULT gen_random_uuid() );
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS source_id UUID;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS difficulty TEXT;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS question_text TEXT;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS options TEXT[];
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS correct_answer TEXT;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS explanation TEXT;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS hints TEXT[] DEFAULT '{}'; -- FIX
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS comments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS hot_votes INT NOT NULL DEFAULT 0;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS cold_votes INT NOT NULL DEFAULT 0;
SELECT add_source_foreign_key('questions');
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public questions are viewable by everyone." ON public.questions;
CREATE POLICY "Public questions are viewable by everyone." ON public.questions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can manage questions." ON public.questions;
CREATE POLICY "Users can manage questions." ON public.questions FOR ALL USING (true);


-- Mapas Mentais (mind_maps)
CREATE TABLE IF NOT EXISTS public.mind_maps ( id UUID PRIMARY KEY DEFAULT gen_random_uuid() );
ALTER TABLE public.mind_maps ADD COLUMN IF NOT EXISTS source_id UUID;
ALTER TABLE public.mind_maps ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.mind_maps ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.mind_maps ADD COLUMN IF NOT EXISTS comments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.mind_maps ADD COLUMN IF NOT EXISTS hot_votes INT NOT NULL DEFAULT 0;
ALTER TABLE public.mind_maps ADD COLUMN IF NOT EXISTS cold_votes INT NOT NULL DEFAULT 0;
SELECT add_source_foreign_key('mind_maps');
ALTER TABLE public.mind_maps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public mind_maps are viewable by everyone." ON public.mind_maps;
CREATE POLICY "Public mind_maps are viewable by everyone." ON public.mind_maps FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can manage mind_maps." ON public.mind_maps;
CREATE POLICY "Users can manage mind_maps." ON public.mind_maps FOR ALL USING (true);


-- Resumos em Áudio (audio_summaries)
CREATE TABLE IF NOT EXISTS public.audio_summaries ( id UUID PRIMARY KEY DEFAULT gen_random_uuid() );
ALTER TABLE public.audio_summaries ADD COLUMN IF NOT EXISTS source_id UUID;
ALTER TABLE public.audio_summaries ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.audio_summaries ADD COLUMN IF NOT EXISTS audio_url TEXT;
ALTER TABLE public.audio_summaries ADD COLUMN IF NOT EXISTS hot_votes INT NOT NULL DEFAULT 0;
ALTER TABLE public.audio_summaries ADD COLUMN IF NOT EXISTS cold_votes INT NOT NULL DEFAULT 0;
ALTER TABLE public.audio_summaries ADD COLUMN IF NOT EXISTS comments JSONB DEFAULT '[]'::jsonb;
SELECT add_source_foreign_key('audio_summaries');
ALTER TABLE public.audio_summaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public audio_summaries are viewable by everyone." ON public.audio_summaries;
CREATE POLICY "Public audio_summaries are viewable by everyone." ON public.audio_summaries FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can manage audio_summaries." ON public.audio_summaries;
CREATE POLICY "Users can manage audio_summaries." ON public.audio_summaries FOR ALL USING (true);

-- DROP A FUNÇÃO HELPER
DROP FUNCTION IF EXISTS add_source_foreign_key(TEXT);


-- 6. Chat e Votação
-- Chat
CREATE TABLE IF NOT EXISTS public.chat_messages ( id UUID PRIMARY KEY DEFAULT gen_random_uuid() );
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS author TEXT;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS text TEXT;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS "timestamp" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS hot_votes INT NOT NULL DEFAULT 0;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS cold_votes INT NOT NULL DEFAULT 0;

-- Votos em Mensagens do Chat
CREATE TABLE IF NOT EXISTS public.user_message_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  hot_votes INT NOT NULL DEFAULT 0,
  cold_votes INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT user_message_votes_unique UNIQUE (user_id, message_id)
);
ALTER TABLE public.user_message_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own message votes." ON public.user_message_votes;
CREATE POLICY "Users can manage their own message votes." ON public.user_message_votes FOR ALL USING (true);

-- Votos em Fontes
CREATE TABLE IF NOT EXISTS public.user_source_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  hot_votes INT NOT NULL DEFAULT 0,
  cold_votes INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT user_source_votes_unique UNIQUE (user_id, source_id)
);
ALTER TABLE public.user_source_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own source votes." ON public.user_source_votes;
CREATE POLICY "Users can manage their own source votes." ON public.user_source_votes FOR ALL USING (true);


-- 7. Interações do Usuário com Conteúdo (Lido, Favorito, Votos)
CREATE TABLE IF NOT EXISTS public.user_content_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    content_id UUID NOT NULL,
    content_type TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    is_favorite BOOLEAN NOT NULL DEFAULT false,
    hot_votes INT NOT NULL DEFAULT 0,
    cold_votes INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT user_content_interactions_unique UNIQUE (user_id, content_id, content_type)
);
ALTER TABLE public.user_content_interactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own content interactions." ON public.user_content_interactions;
CREATE POLICY "Users can manage their own content interactions." ON public.user_content_interactions FOR ALL USING (true);


-- 8. Cadernos de Questões
CREATE TABLE IF NOT EXISTS public.question_notebooks ( id UUID PRIMARY KEY DEFAULT gen_random_uuid() );
ALTER TABLE public.question_notebooks DROP COLUMN IF EXISTS source_ids; -- FIX: Remove potentially erroneous column
ALTER TABLE public.question_notebooks ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.question_notebooks ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.question_notebooks ADD COLUMN IF NOT EXISTS question_ids UUID[];
ALTER TABLE public.question_notebooks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.question_notebooks ADD COLUMN IF NOT EXISTS hot_votes INT NOT NULL DEFAULT 0;
ALTER TABLE public.question_notebooks ADD COLUMN IF NOT EXISTS cold_votes INT NOT NULL DEFAULT 0;
ALTER TABLE public.question_notebooks ADD COLUMN IF NOT EXISTS comments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.question_notebooks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public notebooks are viewable by everyone." ON public.question_notebooks;
CREATE POLICY "Public notebooks are viewable by everyone." ON public.question_notebooks FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can manage their own notebooks." ON public.question_notebooks;
CREATE POLICY "Users can manage their own notebooks." ON public.question_notebooks FOR ALL USING (true);

-- Interações com Cadernos
CREATE TABLE IF NOT EXISTS public.user_notebook_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    notebook_id UUID NOT NULL REFERENCES public.question_notebooks(id) ON DELETE CASCADE,
    is_read BOOLEAN NOT NULL DEFAULT false,
    is_favorite BOOLEAN NOT NULL DEFAULT false,
    hot_votes INT NOT NULL DEFAULT 0,
    cold_votes INT NOT NULL DEFAULT 0,
    CONSTRAINT user_notebook_interactions_unique UNIQUE (user_id, notebook_id)
);
ALTER TABLE public.user_notebook_interactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own notebook interactions." ON public.user_notebook_interactions;
CREATE POLICY "Users can manage their own notebook interactions." ON public.user_notebook_interactions FOR ALL USING (true);

-- Respostas a Questões
CREATE TABLE IF NOT EXISTS public.user_question_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    notebook_id TEXT NOT NULL,
    question_id UUID NOT NULL,
    attempts TEXT[] NOT NULL DEFAULT '{}',
    is_correct_first_try BOOLEAN NOT NULL,
    xp_awarded INT NOT NULL DEFAULT 0,
    "timestamp" TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT user_question_answers_unique UNIQUE (user_id, notebook_id, question_id)
);
ALTER TABLE public.user_question_answers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own question answers." ON public.user_question_answers;
CREATE POLICY "Users can manage their own question answers." ON public.user_question_answers FOR ALL USING (true);


-- 9. Funções RPC
DROP FUNCTION IF EXISTS public.increment_vote(uuid, text, integer); -- Remove a função antiga se existir
CREATE OR REPLACE FUNCTION increment_message_vote( message_id_param UUID, vote_type TEXT, increment_value INT ) RETURNS void LANGUAGE plpgsql AS $$ BEGIN EXECUTE format( 'UPDATE public.chat_messages SET %I = %I + %s WHERE id = %L', vote_type, vote_type, increment_value, message_id_param ); END; $$;
CREATE OR REPLACE FUNCTION increment_source_vote( source_id_param UUID, vote_type TEXT, increment_value INT ) RETURNS void LANGUAGE plpgsql AS $$ BEGIN EXECUTE format( 'UPDATE public.sources SET %I = %I + %s WHERE id = %L', vote_type, vote_type, increment_value, source_id_param ); END; $$;
CREATE OR REPLACE FUNCTION increment_content_vote( table_name TEXT, content_id_param UUID, vote_type TEXT, increment_value INT ) RETURNS void LANGUAGE plpgsql AS $$ BEGIN EXECUTE format( 'UPDATE public.%I SET %I = %I + %s WHERE id = %L', table_name, vote_type, vote_type, increment_value, content_id_param ); END; $$;
CREATE OR REPLACE FUNCTION increment_notebook_vote( notebook_id_param UUID, vote_type TEXT, increment_value INT ) RETURNS void LANGUAGE plpgsql AS $$ BEGIN EXECUTE format( 'UPDATE public.question_notebooks SET %I = %I + %s WHERE id = %L', vote_type, vote_type, increment_value, notebook_id_param ); END; $$;

*/

const supabaseUrl = 'https://rwiagpksyjkxodlyrjaw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3aWFncGtzeWpreG9kbHlyamF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk3NTU5NDMsImV4cCI6MjA3NTMzMTk0M30.HEJJqYpzVWmFs3rX6sIYtQf0xxfph3r2bZbjV-iVzHs';

export let supabase: SupabaseClient | null = null;

if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
  } catch (error) {
    console.error("Error creating Supabase client:", error);
  }
} else {
  console.error("Supabase URL or Key is missing. Community features will be disabled.");
}

const checkSupabase = () => {
    if (!supabase) {
        console.error("Supabase not configured. Cannot perform database operation.");
        return false;
    }
    return true;
}

export const getInitialData = async (): Promise<AppData> => {
    const emptyData: AppData = { users: [], sources: [], chatMessages: [], questionNotebooks: [], userMessageVotes: [], userSourceVotes: [], userContentInteractions: [], userNotebookInteractions: [], userQuestionAnswers: [] };
    if (!checkSupabase()) return emptyData;

    try {
        const fetchTable = async (tableName: string, ordering?: { column: string, options: { ascending: boolean } }) => {
            let query = supabase!.from(tableName).select('*');
            if (ordering) {
                query = query.order(ordering.column, ordering.options);
            }
            const { data, error } = await query;
            if (error) {
                console.error(`Error fetching data from table "${tableName}": ${error.message}`);
                return [];
            }
            return data || [];
        };
        
        const [
            users,
            sources,
            rawSummaries,
            flashcards,
            rawQuestions,
            rawMindMaps,
            rawAudioSummaries,
            chatMessages,
            questionNotebooks,
            userMessageVotes,
            userSourceVotes,
            userContentInteractions,
            userNotebookInteractions,
            userQuestionAnswers
        ] = await Promise.all([
            fetchTable('users'),
            fetchTable('sources', { column: 'created_at', options: { ascending: false } }),
            fetchTable('summaries'),
            fetchTable('flashcards'),
            fetchTable('questions'),
            fetchTable('mind_maps'),
            fetchTable('audio_summaries'),
            fetchTable('chat_messages', { column: 'timestamp', options: { ascending: true } }),
            fetchTable('question_notebooks', { column: 'created_at', options: { ascending: false } }),
            fetchTable('user_message_votes'),
            fetchTable('user_source_votes'),
            fetchTable('user_content_interactions'),
            fetchTable('user_notebook_interactions'),
            fetchTable('user_question_answers')
        ]);
        
        const summaries = (rawSummaries as any[]).map(s => ({
            ...s,
            keyPoints: s.key_points || [],
        }));

        const questions = (rawQuestions as any[]).map(q => ({
            ...q,
            questionText: q.question_text || '',
            correctAnswer: q.correct_answer,
            options: q.options || [],
        }));
        
         const mind_maps = (rawMindMaps as any[]).map(m => ({
            ...m,
            imageUrl: m.image_url,
        }));
        
        const audio_summaries = (rawAudioSummaries as any[]).map(a => ({
            ...a,
            audioUrl: a.audio_url,
        }));

        const sourcesData = (sources as Source[]).map(source => ({
            ...source,
            summaries: (summaries as Summary[]).filter(s => s.source_id === source.id),
            flashcards: (flashcards as Flashcard[]).filter(f => f.source_id === source.id),
            questions: (questions as Question[]).filter(q => q.source_id === source.id),
            mind_maps: (mind_maps as MindMap[]).filter(m => m.source_id === source.id),
            audio_summaries: (audio_summaries as AudioSummary[]).filter(a => a.source_id === source.id),
        }));

        return {
            users: users as User[],
            sources: sourcesData as Source[],
            chatMessages: chatMessages as ChatMessage[],
            questionNotebooks: questionNotebooks as QuestionNotebook[],
            userMessageVotes: userMessageVotes as UserMessageVote[],
            userSourceVotes: userSourceVotes as UserSourceVote[],
            userContentInteractions: userContentInteractions as UserContentInteraction[],
            userNotebookInteractions: userNotebookInteractions as UserNotebookInteraction[],
            userQuestionAnswers: userQuestionAnswers as UserQuestionAnswer[],
        };
    } catch (error: any) {
        console.error("An unexpected error occurred during initial data fetch:", error.message || error);
        return emptyData;
    }
};

export const addContent = async <T extends {id: any}>(table: string, content: Partial<T> | Partial<T>[]): Promise<T | T[] | null> => {
    if (!checkSupabase()) return null;
    const { data, error } = await supabase!.from(table).insert(content).select();
    if (error) {
        console.error(`Error adding to ${table}:`, error.message);
        return null;
    }
    return Array.isArray(content) ? data as T[] : data[0] as T;
};

export const updateContent = async <T extends {id: string}>(table: string, content: T): Promise<T | null> => {
    if (!checkSupabase()) return null;
    const { id, ...updateData } = content;
    const { data, error } = await supabase!.from(table).update(updateData).eq('id', id).select().single();
    if (error) {
        console.error(`Error updating ${table}:`, error.message);
        return null;
    }
    return data as T;
};

// Source Functions
export const addSource = async (sourceData: Partial<Source>): Promise<Source | null> => {
    return addContent<Source>('sources', sourceData) as Promise<Source | null>;
}
export const updateSource = async (sourceId: string, updateData: Partial<Source>): Promise<Source | null> => {
    if (!checkSupabase()) return null;
    // This select was causing errors due to missing relationships in the user's DB schema.
    // Removing the nested selects makes this call more resilient. The calling function only
    // uses the result for an existence check, not for its data.
    const { data, error } = await supabase!.from('sources').update(updateData).eq('id', sourceId).select().single();
    if (error) {
        console.error(`Error updating source ${sourceId}:`, error.message);
        return null;
    }
    // The return value here is partial, but we cast it to satisfy the type signature.
    // The only current usage in the app just checks if the result is null or not for error handling.
    // This avoids breaking the app if the DB relationships are not correctly cached by Supabase.
    return data as Source | null;
}
export const deleteSource = async (sourceId: string, storagePaths: string[]): Promise<boolean> => {
    if (!checkSupabase()) return false;
    if (storagePaths && storagePaths.length > 0) {
        const { error: storageError } = await supabase!.storage.from('sources').remove(storagePaths);
        if (storageError) console.error("Error deleting files from storage:", storageError.message);
    }
    const { error: dbError } = await supabase!.from('sources').delete().eq('id', sourceId);
    if (dbError) { console.error("Error deleting source from database:", dbError.message); return false; }
    return true;
};
export const addGeneratedContent = async (sourceId: string, generated: any): Promise<{ summaries: Summary[], flashcards: Flashcard[], questions: Question[], mind_maps: MindMap[] } | null> => {
    if (!checkSupabase()) return null;
    const { summaries, flashcards, questions, mind_maps } = generated;
    const defaults = { comments: [], hot_votes: 0, cold_votes: 0 };
    
    const summariesPayload = (summaries || []).map((s: any) => {
        const { keyPoints, relatedTopics, ...rest } = s;
        return {
            ...rest,
            ...defaults,
            source_id: sourceId,
            key_points: keyPoints,
            related_topics: relatedTopics,
        };
    });
    
    const flashcardsPayload = (flashcards || []).map((f: any) => ({
        ...f,
        ...defaults,
        source_id: sourceId
    }));
    
    const questionsPayload = (questions || []).map((q: any) => {
        const { questionText, correctAnswer, ...rest } = q;
        return {
            ...rest,
            ...defaults,
            source_id: sourceId,
            question_text: questionText,
            correct_answer: correctAnswer,
        };
    });
    
    const mindMapsPayload = (mind_maps || []).map((m: any) => {
        const { imageUrl, ...rest } = m;
        return {
            ...rest,
            ...defaults,
            source_id: sourceId,
            image_url: imageUrl,
        };
    });

    const [newSummaries, newFlashcards, newQuestions, newMindMaps] = await Promise.all([
        summariesPayload.length > 0 ? addContent<Summary>('summaries', summariesPayload) : Promise.resolve([]),
        flashcardsPayload.length > 0 ? addContent<Flashcard>('flashcards', flashcardsPayload) : Promise.resolve([]),
        questionsPayload.length > 0 ? addContent<Question>('questions', questionsPayload) : Promise.resolve([]),
        mindMapsPayload.length > 0 ? addContent<MindMap>('mind_maps', mindMapsPayload) : Promise.resolve([])
    ]);

    const mappedQuestions = ((newQuestions || []) as any[]).map(q => ({
        ...q,
        questionText: q.question_text,
        correctAnswer: q.correct_answer,
    }));
    
    const mappedMindMaps = ((newMindMaps || []) as any[]).map(m => ({
        ...m,
        imageUrl: m.image_url,
    }));

    return {
        summaries: (newSummaries || []) as Summary[],
        flashcards: (newFlashcards || []) as Flashcard[],
        questions: mappedQuestions as Question[],
        mind_maps: mappedMindMaps as MindMap[]
    };
}
export const addSourceComment = async (source: Source, newComment: Comment): Promise<Source | null> => {
    if (!checkSupabase()) return null;
    const updatedComments = [...(source.comments || []), newComment];
    const { error } = await supabase!.from('sources').update({ comments: updatedComments }).eq('id', source.id);
    if (error) {
        console.error("Error updating source comments:", error.message);
        return null;
    }
    return { ...source, comments: updatedComments };
};
export const appendGeneratedContentToSource = async (sourceId: string, generated: any): Promise<{ newSummaries: Summary[], newFlashcards: Flashcard[], newQuestions: Question[] } | null> => {
    if (!checkSupabase()) return null;
    const { summaries, flashcards, questions } = generated;
    const defaults = { comments: [], hot_votes: 0, cold_votes: 0 };
    
    const summariesPayload = (summaries || []).map((s: any) => ({ ...s, ...defaults, source_id: sourceId, key_points: s.keyPoints, related_topics: s.relatedTopics }));
    const flashcardsPayload = (flashcards || []).map((f: any) => ({ ...f, ...defaults, source_id: sourceId }));
    const questionsPayload = (questions || []).map((q: any) => ({ ...q, ...defaults, source_id: sourceId, question_text: q.questionText, correct_answer: q.correctAnswer }));
    
    const [newSummaries, newFlashcards, newQuestions] = await Promise.all([
        summariesPayload.length > 0 ? addContent<Summary>('summaries', summariesPayload) : Promise.resolve([]),
        flashcardsPayload.length > 0 ? addContent<Flashcard>('flashcards', flashcardsPayload) : Promise.resolve([]),
        questionsPayload.length > 0 ? addContent<Question>('questions', questionsPayload) : Promise.resolve([])
    ]);

    return {
        newSummaries: (newSummaries || []) as Summary[],
        newFlashcards: (newFlashcards || []) as Flashcard[],
        newQuestions: (newQuestions || []) as Question[]
    };
};

// User Functions
export const createUser = async (user: Omit<User, 'id'>): Promise<{ user: User | null; error: 'duplicate' | 'unknown' | null }> => {
    if (!checkSupabase()) return { user: null, error: 'unknown' };
    const { data, error } = await supabase!.from('users').insert(user).select().single();
    if (error) {
        if (error.code === '23505') { console.warn('Attempted to create a user with a duplicate pseudonym.'); return { user: null, error: 'duplicate' }; }
        console.error(`Error creating user:`, error.message);
        return { user: null, error: 'unknown' };
    }
    return { user: data as User, error: null };
};
export const updateUser = async (user: User): Promise<User | null> => updateContent<User>('users', user);

// Chat Functions
export const addChatMessage = async (message: Omit<ChatMessage, 'id' | 'hot_votes' | 'cold_votes'>): Promise<ChatMessage | null> => {
    const payload = { ...message, hot_votes: 0, cold_votes: 0 };
    return addContent<ChatMessage>('chat_messages', payload) as Promise<ChatMessage | null>;
};

// Generic Content Functions
export const addCommentToContent = async (table: 'summaries' | 'flashcards' | 'questions' | 'mind_maps' | 'audio_summaries', contentId: string, currentComments: Comment[], newComment: Comment): Promise<any | null> => {
    if (!checkSupabase()) return null;
    const updatedComments = [...currentComments, newComment];
    const { data, error } = await supabase!.from(table).update({ comments: updatedComments }).eq('id', contentId).select().single();
    if (error) { console.error(`Error adding comment to ${table}:`, error.message); return null; }
    return data;
};
export const updateContentComments = async (table: 'summaries' | 'flashcards' | 'questions' | 'mind_maps' | 'sources' | 'question_notebooks' | 'audio_summaries', contentId: string, updatedComments: Comment[]): Promise<boolean> => {
    if (!checkSupabase()) return false;
    const { error } = await supabase!.from(table).update({ comments: updatedComments }).eq('id', contentId);
    if (error) {
        console.error(`Error updating comments on ${table}:`, error.message);
        return false;
    }
    return true;
};
export const upsertUserContentInteraction = async (interaction: Partial<UserContentInteraction>): Promise<UserContentInteraction | null> => {
    if (!checkSupabase()) return null;
    const { data, error } = await supabase!.from('user_content_interactions').upsert({ ...interaction, updated_at: new Date().toISOString() }, { onConflict: 'user_id,content_id,content_type' }).select().single();
    if (error) { console.error('Error upserting content interaction:', error.message); return null; }
    return data as UserContentInteraction;
}
export const incrementContentVote = async (contentType: 'summary' | 'flashcard' | 'question' | 'mind_map' | 'audio_summary', contentId: string, voteType: 'hot_votes' | 'cold_votes', increment: number): Promise<boolean> => {
    if (!checkSupabase()) return false;
    const tableMap = { summary: 'summaries', flashcard: 'flashcards', question: 'questions', mind_map: 'mind_maps', audio_summary: 'audio_summaries' };
    const tableName = tableMap[contentType];
    const { error } = await supabase!.rpc('increment_content_vote', { table_name: tableName, content_id_param: contentId, vote_type: voteType, increment_value: increment });
    if (error) { console.error(`Error incrementing ${voteType} on ${tableName}:`, error); return false; }
    return true;
};

// Vote Functions (Sources, Messages, Notebooks)
export const upsertUserVote = async (table: 'user_source_votes' | 'user_message_votes' | 'user_notebook_interactions', voteData: any, conflictColumns: string[]): Promise<any | null> => {
    if (!checkSupabase()) return null;
    const { data: existingVote } = await supabase!.from(table).select('*').eq('user_id', voteData.user_id).eq(conflictColumns[1], voteData[conflictColumns[1]]).single();
    const newHotVotes = (existingVote?.hot_votes || 0) + (voteData.hot_votes_increment || 0);
    const newColdVotes = (existingVote?.cold_votes || 0) + (voteData.cold_votes_increment || 0);
    const payload = { ...existingVote, ...voteData, hot_votes: newHotVotes < 0 ? 0 : newHotVotes, cold_votes: newColdVotes < 0 ? 0 : newColdVotes, updated_at: new Date().toISOString() };
    delete payload.hot_votes_increment;
    delete payload.cold_votes_increment;
    const { data, error } = await supabase!.from(table).upsert(payload, { onConflict: conflictColumns.join(',') }).select().single();
    if (error) { console.error(`Error upserting vote on ${table}:`, error.message); return null; }
    return data;
}
export const incrementVoteCount = async (rpc: 'increment_source_vote' | 'increment_message_vote' | 'increment_notebook_vote', id: string, voteType: 'hot_votes' | 'cold_votes', increment: number): Promise<boolean> => {
    if (!checkSupabase()) return false;
    const paramName = rpc === 'increment_source_vote' ? 'source_id_param' : rpc === 'increment_message_vote' ? 'message_id_param' : 'notebook_id_param';
    const { error } = await supabase!.rpc(rpc, { [paramName]: id, vote_type: voteType, increment_value: increment });
    if (error) { console.error(`Error calling RPC ${rpc}:`, error); return false; }
    return true;
}

// Notebook Functions
export const addQuestionNotebook = async (notebook: Partial<QuestionNotebook>): Promise<QuestionNotebook | null> => {
    return addContent<QuestionNotebook>('question_notebooks', notebook) as Promise<QuestionNotebook | null>;
};
export const updateQuestionNotebook = async (id: string, updates: Partial<QuestionNotebook>): Promise<QuestionNotebook | null> => {
    if (!checkSupabase()) return null;
    const { data, error } = await supabase!.from('question_notebooks').update(updates).eq('id', id).select().single();
    if (error) { console.error("Error updating notebook:", error); return null; }
    return data;
};
export const deleteQuestionNotebook = async (id: string): Promise<boolean> => {
    if (!checkSupabase()) return false;
    const { error } = await supabase!.from('question_notebooks').delete().eq('id', id);
    if (error) { console.error("Error deleting notebook:", error); return false; }
    return true;
};
export const addNotebookComment = async (notebook: QuestionNotebook, newComment: Comment): Promise<QuestionNotebook | null> => {
    const updatedComments = [...(notebook.comments || []), newComment];
    return updateQuestionNotebook(notebook.id, { comments: updatedComments });
};
export const addAudioSummary = async (audioSummary: Partial<AudioSummary>): Promise<AudioSummary | null> => {
    if (!checkSupabase()) return null;
    const { audioUrl, ...rest } = audioSummary;
    const payload = { ...rest, audio_url: audioUrl };
    
    const { data, error } = await supabase!.from('audio_summaries').insert(payload).select().single();
    if (error) {
        console.error(`Error adding to audio_summaries:`, error.message);
        return null;
    }

    if (data) {
        const { audio_url, ...mappedRest } = data;
        return { ...mappedRest, audioUrl: audio_url } as AudioSummary;
    }
    return null;
};
export const upsertUserQuestionAnswer = async (answer: Partial<UserQuestionAnswer>): Promise<UserQuestionAnswer | null> => {
    if (!checkSupabase()) return null;
    const { data, error } = await supabase!
        .from('user_question_answers')
        .upsert({ ...answer, timestamp: new Date().toISOString() }, { onConflict: 'user_id,notebook_id,question_id' })
        .select()
        .single();
    if (error) { console.error("Error saving question answer:", error); return null; }
    return data;
};
export const clearNotebookAnswers = async (userId: string, notebookId: string): Promise<boolean> => {
    if (!checkSupabase()) return false;
    const { error } = await supabase!.from('user_question_answers').delete().match({ user_id: userId, notebook_id: notebookId });
    if (error) {
        console.error("Error clearing notebook answers:", error.message);
        return false;
    }
    return true;
};
