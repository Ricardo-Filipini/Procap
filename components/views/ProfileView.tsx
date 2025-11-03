import React, { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { MainContentProps } from '../MainContent';
import { User, QuestionNotebook, UserNotebookInteraction } from '../../types';
import { UserCircleIcon, SparklesIcon } from '../Icons';
import { getPersonalizedStudyPlan } from '../../services/geminiService';
import { FontSizeControl, FONT_SIZE_CLASSES } from '../shared/FontSizeControl';
import { ContentActions } from '../shared/ContentActions';
import { CommentsModal } from '../shared/CommentsModal';
import { upsertUserVote, incrementVoteCount, updateContentComments, updateUser as supabaseUpdateUser } from '../../services/supabaseClient';

type SortOption = 'temp' | 'time' | 'subject' | 'user' | 'source';

// Fix: Changed 'user' to 'currentUser' to match MainContentProps.
interface ProfileViewProps extends Pick<MainContentProps, 'currentUser' | 'appData' | 'setAppData' | 'updateUser'> {
  onNavigate: (viewName: string, term: string) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ currentUser: user, appData, setAppData, updateUser, onNavigate }) => {
    const { correctAnswers, questionsAnswered, topicPerformance } = user.stats;
    const overallAccuracy = questionsAnswered > 0 ? (correctAnswers / questionsAnswered) * 100 : 0;
    const pieData = [ { name: 'Corretas', value: correctAnswers }, { name: 'Incorretas', value: questionsAnswered - correctAnswers } ];
    const COLORS = ['#10b981', '#ef4444'];
    const barData = Object.entries(topicPerformance).map(([topic, data]: [string, { correct: number; total: number }]) => ({
        name: topic,
        Acerto: data.total > 0 ? (data.correct / data.total) * 100 : 0,
    }));
    
    const [studyPlan, setStudyPlan] = useState("");
    const [loadingPlan, setLoadingPlan] = useState(false);
    const [commentingOnNotebook, setCommentingOnNotebook] = useState<QuestionNotebook | null>(null);
    const [fontSize, setFontSize] = useState(2);
    
    const [notebookSort, setNotebookSort] = useState<SortOption>('time');

    const handleGeneratePlan = async () => {
        setLoadingPlan(true);
        const allSummaries = appData.sources.flatMap(s => s.summaries);
        const allFlashcards = appData.sources.flatMap(s => s.flashcards);
        
        const content = {
            summaries: allSummaries,
            flashcards: allFlashcards,
            notebooks: appData.questionNotebooks
        };

        const plan = await getPersonalizedStudyPlan(user.stats, appData.userContentInteractions, content);
        setStudyPlan(plan);
        setLoadingPlan(false);
    }
    
    const parseAndRenderMessage = (text: string) => {
        const parts: (string | React.ReactElement)[] = [];
        let lastIndex = 0;
        const regex = /(\#\[[^\]]+\])|(\!\[[^\]]+\])|(\?\[[^\]]+\])/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                parts.push(text.substring(lastIndex, match.index));
            }

            const fullMatch = match[0];
            const term = fullMatch.substring(2, fullMatch.length - 1);
            let viewName = '';

            if (fullMatch.startsWith('#[')) viewName = 'Resumos';
            else if (fullMatch.startsWith('![')) viewName = 'Flash Cards';
            else if (fullMatch.startsWith('?[')) viewName = 'Questões';
            
            parts.push(
                <span
                    key={match.index}
                    className="text-blue-500 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
                    onClick={() => onNavigate(viewName, term)}
                >
                    {fullMatch}
                </span>
            );
            
            lastIndex = regex.lastIndex;
        }

        if (lastIndex < text.length) {
            parts.push(text.substring(lastIndex));
        }

        return <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">{parts}</div>;
    };

    const userNotebooks = useMemo(() => {
        const notebooks = appData.questionNotebooks.filter(n => n.user_id === user.id);
        switch (notebookSort) {
            case 'time':
                return notebooks.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            case 'temp':
                return notebooks.sort((a, b) => (b.hot_votes - b.cold_votes) - (a.hot_votes - a.cold_votes));
            default:
                return notebooks;
        }
    }, [appData.questionNotebooks, user.id, notebookSort]);

    const handleNotebookInteractionUpdate = async (notebookId: string, update: Partial<UserNotebookInteraction>) => {
        let newInteractions = [...appData.userNotebookInteractions];
        const existingIndex = newInteractions.findIndex(i => i.user_id === user.id && i.notebook_id === notebookId);
        if (existingIndex > -1) {
            newInteractions[existingIndex] = { ...newInteractions[existingIndex], ...update };
        } else {
            newInteractions.push({ id: `temp-nb-${Date.now()}`, user_id: user.id, notebook_id: notebookId, is_read: false, is_favorite: false, hot_votes: 0, cold_votes: 0, ...update });
        }
        setAppData(prev => ({...prev, userNotebookInteractions: newInteractions }));

        const result = await upsertUserVote('user_notebook_interactions', { user_id: user.id, notebook_id: notebookId, ...update }, ['user_id', 'notebook_id']);
        if (!result) {
            console.error("Failed to update notebook interaction.");
            setAppData(appData);
        }
    };
    
    const handleNotebookVote = async (notebookId: string, type: 'hot' | 'cold', increment: 1 | -1) => {
        const interaction = appData.userNotebookInteractions.find(i => i.user_id === user.id && i.notebook_id === notebookId);
        const currentVoteCount = (type === 'hot' ? interaction?.hot_votes : interaction?.cold_votes) || 0;
        if (increment === -1 && currentVoteCount <= 0) return;

        handleNotebookInteractionUpdate(notebookId, { [`${type}_votes`]: currentVoteCount + increment });
        
        setAppData(prev => ({ ...prev, questionNotebooks: prev.questionNotebooks.map(n => n.id === notebookId ? { ...n, [`${type}_votes`]: n[`${type}_votes`] + increment } : n) }));
        
        await incrementVoteCount('increment_notebook_vote', notebookId, `${type}_votes`, increment);
    };

     const handleNotebookCommentAction = async (action: 'add' | 'vote', payload: any) => {
        if (!commentingOnNotebook) return;
        let updatedComments = [...commentingOnNotebook.comments];
        if (action === 'add') {
            updatedComments.push({ id: `c_${Date.now()}`, authorId: user.id, authorPseudonym: user.pseudonym, text: payload.text, timestamp: new Date().toISOString(), hot_votes: 0, cold_votes: 0 });
        } else {
             const commentIndex = updatedComments.findIndex(c => c.id === payload.commentId);
            if (commentIndex > -1) updatedComments[commentIndex][`${payload.voteType}_votes`] += 1;
        }
        
        const success = await updateContentComments('question_notebooks', commentingOnNotebook.id, updatedComments);
        if (success) {
            const updatedItem = {...commentingOnNotebook, comments: updatedComments };
            setAppData(prev => ({ ...prev, questionNotebooks: prev.questionNotebooks.map(n => n.id === updatedItem.id ? updatedItem : n) }));
            setCommentingOnNotebook(updatedItem);
        }
    };

    return (
        <div className={FONT_SIZE_CLASSES[fontSize]}>
            <FontSizeControl fontSize={fontSize} setFontSize={setFontSize} className="mb-4" />
            <div className="space-y-8">
                <CommentsModal 
                    isOpen={!!commentingOnNotebook}
                    onClose={() => setCommentingOnNotebook(null)}
                    comments={commentingOnNotebook?.comments || []}
                    onAddComment={(text) => handleNotebookCommentAction('add', { text })}
                    onVoteComment={(id, type) => handleNotebookCommentAction('vote', { commentId: id, voteType: type })}
                    contentTitle={commentingOnNotebook?.name || ''}
                />

                <div className="bg-card-light dark:bg-card-dark p-6 rounded-lg shadow-md border border-border-light dark:border-border-dark">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold">Plano de Estudos Personalizado (IA)</h3>
                        <button onClick={handleGeneratePlan} disabled={loadingPlan} className="bg-secondary-light hover:bg-emerald-600 dark:bg-secondary-dark dark:hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-md transition duration-300 disabled:opacity-50 flex items-center gap-2">
                        <SparklesIcon className="w-5 h-5"/> {loadingPlan ? 'Gerando...' : 'Gerar/Atualizar Plano'}
                        </button>
                    </div>
                    {studyPlan ? parseAndRenderMessage(studyPlan) : <p className="text-gray-500 dark:text-gray-400">Clique no botão para que a IA gere um plano de estudos com base em seu desempenho e interações.</p>}
                </div>

                <div className="bg-card-light dark:bg-card-dark p-8 rounded-lg shadow-md border border-border-light dark:border-border-dark">
                    <div className="flex items-center space-x-6 mb-6">
                        <div className="w-24 h-24 bg-primary-light/20 rounded-full flex items-center justify-center">
                            <UserCircleIcon className="w-20 h-20 text-primary-light dark:text-primary-dark" />
                        </div>
                        <div>
                            <h2 className="text-3xl font-bold">{user.pseudonym}</h2>
                            <p className="text-lg text-gray-600 dark:text-gray-300">Continue de onde parou e avance em seus estudos.</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-background-light dark:bg-background-dark p-4 rounded-lg text-center">
                            <p className="text-lg font-semibold">Nível</p>
                            <p className="text-3xl font-bold text-primary-light dark:text-primary-dark">{user.level}</p>
                        </div>
                        <div className="bg-background-light dark:bg-background-dark p-4 rounded-lg text-center">
                            <p className="text-lg font-semibold">XP</p>
                            <p className="text-3xl font-bold text-primary-light dark:text-primary-dark">{user.xp}</p>
                        </div>
                        <div className="bg-background-light dark:bg-background-dark p-4 rounded-lg text-center">
                            <p className="text-lg font-semibold">Conquistas</p>
                            <p className="text-3xl font-bold text-primary-light dark:text-primary-dark">{user.achievements.length}</p>
                        </div>
                    </div>
                    <div className="mt-8">
                        <h3 className="text-xl font-semibold mb-4">Progresso para o próximo Nível</h3>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 mb-2">
                            <div className="bg-secondary-light dark:bg-secondary-dark h-4 rounded-full" style={{ width: `${(user.xp % 100)}%` }}></div>
                        </div>
                        <p className="text-right text-sm text-gray-500">{user.xp % 100} / 100 XP</p>
                    </div>
                    <div className="mt-8">
                        <h3 className="text-xl font-semibold mb-4">Conquistas</h3>
                        <div className="flex flex-wrap gap-4">
                            {Array.isArray(user.achievements) && user.achievements.length > 0 ? (
                                ((user.achievements as unknown as string[]).slice().sort().map((ach: string) => (
                                    <div key={ach} className="bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200 text-sm font-semibold px-3 py-1 rounded-full">
                                        {ach}
                                    </div>
                                )))
                            ) : (
                                <p className="text-gray-500">Nenhuma conquista desbloqueada ainda.</p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-card-light dark:bg-card-dark p-6 rounded-lg shadow-md border border-border-light dark:border-border-dark">
                        <h3 className="text-xl font-bold mb-4">Desempenho Geral</h3>
                        <p className="text-center text-lg mb-4">{questionsAnswered} questões respondidas com <span className="font-bold">{overallAccuracy.toFixed(1)}%</span> de acerto.</p>
                        <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                                    {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                </Pie>
                                <Tooltip />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="bg-card-light dark:bg-card-dark p-6 rounded-lg shadow-md border border-border-light dark:border-border-dark">
                        <h3 className="text-xl font-bold mb-4">Desempenho por Tópico (%)</h3>
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={barData} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" domain={[0, 100]} />
                                <YAxis dataKey="name" type="category" width={80} />
                                <Tooltip />
                                <Bar dataKey="Acerto" fill="#8884d8" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-card-light dark:bg-card-dark p-6 rounded-lg shadow-md border border-border-light dark:border-border-dark">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold">Seus Cadernos de Questões Criados</h3>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">Ordenar por:</span>
                            <button onClick={() => setNotebookSort('time')} title="Data" className={`p-1 rounded-md ${notebookSort === 'time' ? 'bg-primary-light/20' : ''}`}><span className="text-xl">🕐</span></button>
                            <button onClick={() => setNotebookSort('temp')} title="Temperatura" className={`p-1 rounded-md ${notebookSort === 'temp' ? 'bg-primary-light/20' : ''}`}><span className="text-xl">🌡️</span></button>
                        </div>
                    </div>
                    <div className="space-y-4 max-h-96 overflow-y-auto">
                        {userNotebooks.length > 0 ? userNotebooks.map(notebook => (
                            <div key={notebook.id} className="bg-background-light dark:bg-background-dark p-4 rounded-lg">
                                <div>
                                    <h4 className="font-semibold">{notebook.name}</h4>
                                    <p className="text-xs text-gray-500">{notebook.question_ids.length} questões - {new Date(notebook.created_at).toLocaleDateString()}</p>
                                </div>
                                <ContentActions
                                    item={notebook}
                                    contentType={'question_notebook'}
                                    currentUser={user}
                                    interactions={appData.userNotebookInteractions.filter(i => i.user_id === user.id)}
                                    onVote={handleNotebookVote}
                                    onToggleRead={(id, state) => handleNotebookInteractionUpdate(id, { is_read: !state })}
                                    onToggleFavorite={(id, state) => handleNotebookInteractionUpdate(id, { is_favorite: !state })}
                                    onComment={() => setCommentingOnNotebook(notebook)}
                                />
                            </div>
                        )) : <p className="text-gray-500">Você ainda não criou nenhum caderno de questões.</p>}
                    </div>
                </div>
            </div>
        </div>
    );
};