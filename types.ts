import React from 'react';

export type Theme = 'light' | 'dark';

export type ContentType = 'summary' | 'flashcard' | 'question' | 'mind_map' | 'question_notebook' | 'audio_summary';

export interface View {
  name: string;
  // Fix: Use React.ReactElement as JSX is not in scope in .ts files.
  icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactElement;
  adminOnly?: boolean;
}

export interface User {
  id: string;
  pseudonym: string;
  password: string;
  level: number;
  xp: number;
  achievements: string[];
  stats: {
    questionsAnswered: number;
    correctAnswers: number;
    topicPerformance: { [topic: string]: { correct: number; total: number } };
    streak?: number;
  };
}

export interface Comment {
    id: string;
    authorId: string;
    authorPseudonym: string;
    text: string;
    timestamp: string;
    hot_votes: number;
    cold_votes: number;
}

// Represents a file source processed by the AI
export interface Source {
  id: string;
  user_id: string;
  title: string;
  summary: string;
  original_filename: string[];
  storage_path: string[];
  drive_links?: string[];
  materia: string;
  topic: string;
  subtopic?: string;
  created_at: string;
  hot_votes: number;
  cold_votes: number;
  comments: Comment[];
  // Nested content for easier data access
  summaries: Omit<Summary, 'source'>[];
  flashcards: Omit<Flashcard, 'source'>[];
  questions: Omit<Question, 'source'>[];
  mind_maps: Omit<MindMap, 'source'>[];
  audio_summaries: Omit<AudioSummary, 'source'>[];
}


export interface Summary {
  id: string;
  source_id: string;
  source?: Source; // Optional full source object for context
  title: string;
  content: string;
  keyPoints: { term: string; description: string; }[];
  relatedTopics: string[];
  comments: Comment[];
  hot_votes: number;
  cold_votes: number;
}

export interface Flashcard {
  id:string;
  source_id: string;
  source?: Source;
  front: string;
  back: string;
  comments: Comment[];
  hot_votes: number;
  cold_votes: number;
}

export interface Question {
  id: string;
  source_id: string;
  source?: Source;
  difficulty: 'Fácil' | 'Médio' | 'Difícil';
  questionText: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  hints: string[];
  comments: Comment[];
  hot_votes: number;
  cold_votes: number;
}

export interface MindMap {
    id: string;
    source_id: string;
    source?: Source;
    title: string;
    imageUrl: string;
    comments: Comment[];
    hot_votes: number;
    cold_votes: number;
}

export interface AudioSummary {
    id: string;
    source_id: string;
    source?: Source;
    title: string;
    audioUrl: string;
    hot_votes: number;
    cold_votes: number;
    comments: Comment[];
}

export interface ChatMessage {
  id: string;
  author: 'user' | 'IA' | string;
  text: string;
  timestamp: string;
  hot_votes: number;
  cold_votes: number;
}

export interface QuestionNotebook {
    id: string;
    user_id: string;
    name: string;
    question_ids: string[];
    created_at: string;
    hot_votes: number;
    cold_votes: number;
    comments: Comment[];
}

export interface UserNotebookInteraction {
    id: string;
    user_id: string;
    notebook_id: string;
    is_read: boolean;
    is_favorite: boolean;
    hot_votes: number;
    cold_votes: number;
}

export interface UserQuestionAnswer {
    id: string;
    user_id: string;
    notebook_id: string;
    question_id: string;
    attempts: string[];
    is_correct_first_try: boolean;
    xp_awarded: number;
    timestamp: string;
}


// Fix: Add optional created_at and updated_at to align with database schema.
export interface UserMessageVote {
    id: string;
    user_id: string;
    message_id: string;
    hot_votes: number;
    cold_votes: number;
    created_at?: string;
    updated_at?: string;
}

// Fix: Add optional created_at and updated_at to align with database schema.
export interface UserSourceVote {
    id: string;
    user_id: string;
    source_id: string;
    hot_votes: number;
    cold_votes: number;
    created_at?: string;
    updated_at?: string;
}

export interface UserContentInteraction {
    id: string;
    user_id: string;
    content_id: string;
    content_type: ContentType;
    is_read: boolean;
    is_favorite: boolean;
    hot_votes: number;
    cold_votes: number;
}


export interface AppData {
  users: User[];
  sources: Source[];
  chatMessages: ChatMessage[];
  questionNotebooks: QuestionNotebook[];
  userMessageVotes: UserMessageVote[];
  userSourceVotes: UserSourceVote[];
  userContentInteractions: UserContentInteraction[];
  userNotebookInteractions: UserNotebookInteraction[];
  userQuestionAnswers: UserQuestionAnswer[];
}

export interface StarRating {
    contentId: string;
    rating: number; // 1-5
}