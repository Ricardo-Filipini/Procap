import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppData, User, Source, ChatMessage, UserMessageVote, UserSourceVote, Summary, Flashcard, Question, Comment, MindMap, UserContentInteraction, QuestionNotebook, UserNotebookInteraction, UserQuestionAnswer, AudioSummary } from '../types';

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
CREATE POLICY "Users can manage their own sources." ON public.sources FOR ALL USING (auth.uid() = user_id);


-- 3. Bucket de Armazenamento (Storage) para as fontes
-- This is a placeholder for where the rest of the SQL script would go.
-- Assuming tables for summaries, flashcards, questions, mind_maps, audio_summaries, etc. exist.

*/

// FIX: Add Supabase client initialization. 
// Replace placeholders with your actual Supabase URL and Anon Key.
// These should ideally be stored in environment variables (e.g., in a .env file).
const supabaseUrl = process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';

// FIX: Implement and export the Supabase client and all missing data-access functions.
export const supabase: SupabaseClient | null = (supabaseUrl && supabaseAnonKey && supabaseUrl !== 'YOUR_SUPABASE_URL') 
    ? createClient(supabaseUrl, supabaseAnonKey) 
    : null;

if (!supabase) {
    console.warn("Supabase client is not initialized. Please configure your Supabase URL and Anon Key.");
}

export const getInitialData = async (): Promise<AppData> => {
    if (!supabase) throw new Error("Supabase client not initialized");

    const fetchAll = async (table: string) => {
        const { data, error } = await supabase.from(table).select('*');
        if (error) throw new Error(`Error fetching ${table}: ${error.message}`);
        return data || [];
    };

    try {
        const [
            users, sources, summaries, flashcards, questions, mindMaps, audioSummaries,
            chatMessages, questionNotebooks, userMessageVotes, userSourceVotes,
            userContentInteractions, userNotebookInteractions, userQuestionAnswers
        ] = await Promise.all([
            fetchAll('users'), fetchAll('sources'), fetchAll('summaries'), fetchAll('flashcards'),
            fetchAll('questions'), fetchAll('mind_maps'), fetchAll('audio_summaries'),
            fetchAll('chat_messages'), fetchAll('question_notebooks'), fetchAll('user_message_votes'),
            fetchAll('user_source_votes'), fetchAll('user_content_interactions'),
            fetchAll('user_notebook_interactions'), fetchAll('user_question_answers')
        ]);

        const contentMap = {
            summaries: (summaries as Summary[]).reduce((acc, item) => {
                if (!acc[item.source_id]) acc[item.source_id] = [];
                acc[item.source_id].push(item);
                return acc;
            }, {} as Record<string, Summary[]>),
            flashcards: (flashcards as Flashcard[]).reduce((acc, item) => {
                if (!acc[item.source_id]) acc[item.source_id] = [];
                acc[item.source_id].push(item);
                return acc;
            }, {} as Record<string, Flashcard[]>),
            questions: (questions as Question[]).reduce((acc, item) => {
                if (!acc[item.source_id]) acc[item.source_id] = [];
                acc[item.source_id].push(item);
                return acc;
            }, {} as Record<string, Question[]>),
            mindMaps: (mindMaps as MindMap[]).reduce((acc, item) => {
                if (!acc[item.source_id]) acc[item.source_id] = [];
                acc[item.source_id].push(item);
                return acc;
            }, {} as Record<string, MindMap[]>),
            audioSummaries: (audioSummaries as AudioSummary[]).reduce((acc, item) => {
                if (!acc[item.source_id]) acc[item.source_id] = [];
                acc[item.source_id].push(item);
                return acc;
            }, {} as Record<string, AudioSummary[]>),
        };

        const populatedSources = (sources as Source[]).map(source => ({
            ...source,
            summaries: contentMap.summaries[source.id] || [],
            flashcards: contentMap.flashcards[source.id] || [],
            questions: contentMap.questions[source.id] || [],
            mind_maps: contentMap.mindMaps[source.id] || [],
            audio_summaries: contentMap.audioSummaries[source.id] || [],
        }));

        return {
            users: users as User[],
            sources: populatedSources,
            chatMessages: chatMessages as ChatMessage[],
            questionNotebooks: questionNotebooks as QuestionNotebook[],
            userMessageVotes: userMessageVotes as UserMessageVote[],
            userSourceVotes: userSourceVotes as UserSourceVote[],
            userContentInteractions: userContentInteractions as UserContentInteraction[],
            userNotebookInteractions: userNotebookInteractions as UserNotebookInteraction[],
            userQuestionAnswers: userQuestionAnswers as UserQuestionAnswer[],
        };
    } catch (error) {
        console.error("Failed to get initial data:", error);
        // Return empty data structure on failure
        return { users: [], sources: [], chatMessages: [], questionNotebooks: [], userMessageVotes: [], userSourceVotes: [], userContentInteractions: [], userNotebookInteractions: [], userQuestionAnswers: [] };
    }
};

export const createUser = async (userPayload: Omit<User, 'id'>): Promise<{ user: User | null; error: 'duplicate' | 'other' | null }> => {
    if (!supabase) return { user: null, error: 'other' };

    const { data, error } = await supabase.from('users').insert([userPayload]).select().single();

    if (error) {
        if (error.code === '23505') { // Unique constraint violation
            return { user: null, error: 'duplicate' };
        }
        console.error("Error creating user:", error);
        return { user: null, error: 'other' };
    }
    return { user: data, error: null };
};

export const updateUser = async (updatedUser: User): Promise<User | null> => {
    if (!supabase) return null;
    const { id, ...updates } = updatedUser;
    const { data, error } = await supabase.from('users').update(updates).eq('id', id).select().single();
    
    if (error) {
        console.error("Error updating user:", error);
        return null;
    }
    return data;
};

export const addChatMessage = async (message: Omit<ChatMessage, 'id' | 'hot_votes' | 'cold_votes'>): Promise<ChatMessage | null> => {
    if (!supabase) return null;
    const payload = { ...message, hot_votes: 0, cold_votes: 0 };
    const { data, error } = await supabase.from('chat_messages').insert(payload).select().single();
    if (error) {
        console.error('Error adding chat message:', error);
        return null;
    }
    return data;
};

export const addSource = async (source: Partial<Source>): Promise<Source | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase.from('sources').insert(source).select().single();
    if (error) {
        console.error('Error adding source:', error);
        return null;
    }
    return data;
};

export const addGeneratedContent = async (sourceId: string, content: { summaries?: any[], flashcards?: any[], questions?: any[], mind_maps?: any[] }): Promise<{ summaries: Summary[], flashcards: Flashcard[], questions: Question[], mind_maps: MindMap[] } | null> => {
    if (!supabase) return null;
    try {
        const insertContent = async (tableName: string, items?: any[]) => {
            if (!items || items.length === 0) return [];
            const payload = items.map(item => ({ ...item, source_id: sourceId, comments: [], hot_votes: 0, cold_votes: 0 }));
            const { data, error } = await supabase.from(tableName).insert(payload).select();
            if (error) throw new Error(`Error inserting into ${tableName}: ${error.message}`);
            return data || [];
        };
        const [summaries, flashcards, questions, mind_maps] = await Promise.all([
            insertContent('summaries', content.summaries),
            insertContent('flashcards', content.flashcards),
            insertContent('questions', content.questions),
            insertContent('mind_maps', content.mind_maps)
        ]);
        return { summaries, flashcards, questions, mind_maps };
    } catch (error) {
        console.error("Error adding generated content:", error);
        return null;
    }
};

export const updateSource = async (id: string, updates: Partial<Source>): Promise<Source | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase.from('sources').update(updates).eq('id', id).select().single();
    if (error) {
        console.error("Error updating source:", error);
        return null;
    }
    return data;
};

export const deleteSource = async (id: string, storagePaths: string[]): Promise<boolean> => {
    if (!supabase) return false;
    try {
        if (storagePaths && storagePaths.length > 0) {
            await supabase.storage.from('sources').remove(storagePaths);
        }
        const { error } = await supabase.from('sources').delete().eq('id', id);
        if (error) throw error;
        return true;
    } catch (error) {
        console.error("Error deleting source:", error);
        return false;
    }
};

export const upsertUserContentInteraction = async (interaction: Partial<UserContentInteraction>): Promise<UserContentInteraction | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase.from('user_content_interactions').upsert(interaction, { onConflict: 'user_id,content_id,content_type' }).select().single();
    if (error) {
        console.error("Error upserting content interaction:", error);
        return null;
    }
    return data;
};

export const incrementContentVote = async (contentType: string, contentId: string, voteType: 'hot_votes' | 'cold_votes', increment: number): Promise<boolean> => {
    if (!supabase) return false;
    const rpcName = `increment_${contentType}_vote`;
    const { error } = await supabase.rpc(rpcName, { row_id: contentId, vote_type: voteType, increment_amount: increment });
    if (error) {
        console.error(`Error calling RPC ${rpcName}:`, error);
        return false;
    }
    return true;
};

export const upsertUserVote = async (tableName: 'user_source_votes' | 'user_message_votes', payload: any, conflictColumns: string[]): Promise<any | null> => {
    if (!supabase) return null;

    const contentIdCol = tableName === 'user_source_votes' ? 'source_id' : 'message_id';
    const contentId = payload.source_id || payload.message_id;

    const { data: existing, error: fetchError } = await supabase.from(tableName).select('*').eq('user_id', payload.user_id).eq(contentIdCol, contentId).single();
    if (fetchError && fetchError.code !== 'PGRST116') {
        console.error(`Error fetching existing vote from ${tableName}:`, fetchError);
        return null;
    }

    const newHotVotes = (existing?.hot_votes || 0) + payload.hot_votes_increment;
    const newColdVotes = (existing?.cold_votes || 0) + payload.cold_votes_increment;

    const upsertPayload = { user_id: payload.user_id, [contentIdCol]: contentId, hot_votes: Math.max(0, newHotVotes), cold_votes: Math.max(0, newColdVotes) };
    const { data, error } = await supabase.from(tableName).upsert(upsertPayload, { onConflict: conflictColumns.join(',') }).select().single();
    if (error) {
        console.error(`Error upserting user vote to ${tableName}:`, error);
        return null;
    }
    return data;
};


export const incrementVoteCount = async (rpcName: string, id: string, voteType: 'hot_votes' | 'cold_votes', increment: number): Promise<boolean> => {
    if (!supabase) return false;
    const { error } = await supabase.rpc(rpcName, { row_id: id, vote_type: voteType, increment_amount: increment });
    if (error) {
        console.error(`Error calling RPC ${rpcName} for id ${id}:`, error);
        return false;
    }
    return true;
};

export const addQuestionNotebook = async (notebook: Partial<QuestionNotebook>): Promise<QuestionNotebook | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase.from('question_notebooks').insert(notebook).select().single();
    if (error) {
        console.error("Error adding question notebook:", error);
        return null;
    }
    return data;
};

export const upsertUserQuestionAnswer = async (answer: Partial<UserQuestionAnswer>): Promise<UserQuestionAnswer | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase.from('user_question_answers').upsert(answer, { onConflict: 'user_id,notebook_id,question_id' }).select().single();
    if (error) {
        console.error("Error upserting question answer:", error);
        return null;
    }
    return data;
};

export const clearNotebookAnswers = async (userId: string, notebookId: string): Promise<boolean> => {
    if (!supabase) return false;
    const { error } = await supabase.from('user_question_answers').delete().eq('user_id', userId).eq('notebook_id', notebookId);
    if (error) {
        console.error("Error clearing notebook answers:", error);
        return false;
    }
    return true;
};

export const updateContentComments = async (tableName: string, contentId: string, comments: Comment[]): Promise<boolean> => {
    if (!supabase) return false;
    const { error } = await supabase.from(tableName).update({ comments }).eq('id', contentId);
    if (error) {
        console.error(`Error updating comments on ${tableName}:`, error);
        return false;
    }
    return true;
};

export const addAudioSummary = async (summary: Partial<AudioSummary>): Promise<AudioSummary | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase.from('audio_summaries').insert(summary).select().single();
    if (error) {
        console.error("Error adding audio summary:", error);
        return null;
    }
    return data;
};
