import React, { useState, useMemo } from 'react';
import { Theme, View, AppData, User, Summary, Flashcard, Question, ChatMessage, Comment, Source, AudioSummary, MindMap, UserMessageVote, UserSourceVote, ContentType, UserContentInteraction, QuestionNotebook, UserNotebookInteraction, UserQuestionAnswer } from '../types';
import { VIEWS } from '../constants';
import { Header } from './shared/Header';

// Importando as novas views modularizadas
import { AdminView } from './views/AdminView';
import { SummariesView } from './views/SummariesView';
import { FlashcardsView } from './views/FlashcardsView';
import { QuestionsView } from './views/QuestionsView';
import { MindMapsView } from './views/MindMapsView';
import { AudioSummariesView } from './views/AudioSummariesView';
import { CommunityView } from './views/CommunityView';
import { ProfileView } from './views/ProfileView';
import { SourcesView } from './views/SourcesView';
// Fix: Correctly import CaseStudyView from its new file.
import { CaseStudyView } from './views/CaseStudyView';
import { CronogramaView } from './views/CronogramaView';

export interface MainContentProps {
  activeView: View;
  setActiveView: (view: View) => void;
  appData: AppData;
  setAppData: React.Dispatch<React.SetStateAction<AppData>>;
  currentUser: User;
  updateUser: (user: User) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  processingTasks: {id: string, name: string, message: string, status: 'processing' | 'success' | 'error'}[];
  setProcessingTasks: React.Dispatch<React.SetStateAction<{id: string, name: string, message: string, status: 'processing' | 'success' | 'error'}[]>>;
}

export const MainContent: React.FC<MainContentProps> = (props) => {
  const { activeView, setActiveView, appData, theme, setTheme } = props;
  const [chatFilter, setChatFilter] = useState<{viewName: string, term: string} | null>(null);

  const handleChatNavigation = (viewName: string, term: string) => {
    const targetView = VIEWS.find(v => v.name === viewName);
    if (targetView) {
      setChatFilter({ viewName, term });
      setActiveView(targetView);
    }
  };

  const allSummaries = useMemo(() => appData.sources.flatMap(s => (s.summaries || []).map(summary => ({ ...summary, source: s, user_id: s.user_id, created_at: s.created_at }))), [appData.sources]);
  const allFlashcards = useMemo(() => appData.sources.flatMap(s => (s.flashcards || []).map(fc => ({ ...fc, source: s, user_id: s.user_id, created_at: s.created_at }))), [appData.sources]);
  const allQuestions = useMemo(() => appData.sources.flatMap(s => (s.questions || []).map(q => ({ ...q, source: s, user_id: s.user_id, created_at: s.created_at }))), [appData.sources]);
  const allMindMaps = useMemo(() => appData.sources.flatMap(s => (s.mind_maps || []).map(mm => ({ ...mm, source: s, user_id: s.user_id, created_at: s.created_at }))), [appData.sources]);
  const allAudioSummaries = useMemo(() => appData.sources.flatMap(s => (s.audio_summaries || []).map(as => ({ ...as, source: s, user_id: s.user_id, created_at: s.created_at }))), [appData.sources]);

  const renderContent = () => {
    const currentFilter = chatFilter && chatFilter.viewName === activeView.name ? chatFilter.term : null;
    const clearFilter = () => setChatFilter(null);

    const viewProps = {
      ...props,
      filterTerm: currentFilter,
      clearFilter: clearFilter,
    };

    switch (activeView.name) {
      case 'Resumos':
        return <SummariesView {...viewProps} allItems={allSummaries} />;
      case 'Flashcards':
        return <FlashcardsView {...viewProps} allItems={allFlashcards} />;
      case 'Questões':
        return <QuestionsView {...viewProps} allItems={allQuestions} />;
      case 'Mapas Mentais':
          return <MindMapsView {...viewProps} allItems={allMindMaps} />;
      case 'Mídia':
          return <AudioSummariesView {...viewProps} allItems={allAudioSummaries} />;
      case 'Estudo de Caso':
          return <CaseStudyView {...props} />;
      case 'Cronograma':
          return <CronogramaView {...props} />;
      case 'Comunidade':
          return <CommunityView {...props} onNavigate={handleChatNavigation}/>;
      case 'Perfil':
          return <ProfileView {...props} onNavigate={handleChatNavigation} />;
      case 'Admin':
          return <AdminView {...props} />;
      case 'Fontes':
          return <SourcesView {...props} />;
      default:
        return <div className="text-center mt-10">Selecione uma opção no menu.</div>;
    }
  };

  return (
      <div>
          <Header title={activeView.name} theme={theme} setTheme={setTheme} />
          {renderContent()}
      </div>
  );
};
