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