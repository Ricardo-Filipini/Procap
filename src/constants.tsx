import React from 'react';
import { AppData, View } from './types';
import { BookOpenIcon, SparklesIcon, QuestionMarkCircleIcon, ShareIcon, UserCircleIcon, ShieldCheckIcon, CloudArrowUpIcon, UsersIcon, SpeakerWaveIcon } from './components/Icons';

export const VIEWS: View[] = [
    { name: 'Comunidade', icon: UsersIcon},
    { name: 'Fontes', icon: CloudArrowUpIcon },
    { name: 'Resumos', icon: BookOpenIcon },
    { name: 'Flash Cards', icon: SparklesIcon },
    { name: 'Questões', icon: QuestionMarkCircleIcon },
    { name: 'Mapas Mentais', icon: ShareIcon },
    { name: 'Resumos em Áudio', icon: SpeakerWaveIcon },
    { name: 'Perfil', icon: UserCircleIcon },
    { name: 'Admin', icon: ShieldCheckIcon, adminOnly: true },
];

export const INITIAL_APP_DATA: AppData = {
  users: [],
  sources: [],
  chatMessages: [],
  questionNotebooks: [],
  userMessageVotes: [],
  userSourceVotes: [],
  userContentInteractions: [],
  userNotebookInteractions: [],
  userQuestionAnswers: [],
};

export const ACHIEVEMENTS = {
  FLASHCARDS_FLIPPED: [
    { count: 10, title: "Aprendiz de Flashcards" },
    { count: 25, title: "Praticante de Flashcards" },
    { count: 50, title: "Adepto de Flashcards" },
    { count: 100, title: "Mestre de Flashcards" },
    { count: 150, title: "Sábio de Flashcards" },
    { count: 200, title: "Lenda dos Flashcards" },
  ],
  QUESTIONS_CORRECT: [
    { count: 10, title: "Primeiros Passos" },
    { count: 25, title: "Estudante Dedicado" },
    { count: 50, title: "Conhecedor" },
    { count: 100, title: "Especialista" },
    { count: 200, title: "Mestre das Questões" },
    { count: 300, title: "Doutrinador" },
    { count: 400, title: "Sábio das Questões" },
    { count: 500, title: "Oráculo" },
  ],
  STREAK: [
    { count: 5, title: "Embalado!" },
    { count: 10, title: "Imparável!" },
    { count: 15, title: "Invencível!" },
    { count: 20, title: "Dominante!" },
    { count: 25, title: "Lendário!" },
    { count: 50, title: "Divino!" },
  ],
  SUMMARIES_READ: [
    { count: 3, title: "Leitor Iniciante" },
    { count: 5, title: "Leitor Atento" },
    { count: 7, title: "Leitor Voraz" },
    { count: 10, title: "Devorador de Livros" },
    { count: 20, title: "Bibliotecário" },
    { count: 30, title: "Arquivista" },
    { count: 50, title: "Historiador" },
  ],
  MIND_MAPS_READ: [
    { count: 3, title: "Visualizador Curioso" },
    { count: 5, title: "Explorador Visual" },
    { count: 7, title: "Cartógrafo do Saber" },
    { count: 10, title: "Mapeador de Ideias" },
    { count: 20, title: "Estrategista Visual" },
    { count: 30, title: "Mestre dos Mapas" },
    { count: 50, title: "Iluminado" },
  ],
};