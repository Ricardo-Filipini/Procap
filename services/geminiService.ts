import { GoogleGenAI, GenerateContentResponse, Type, Part, Modality } from "@google/genai";
import { ContentType, Question, User, UserContentInteraction, UserQuestionAnswer } from '../types';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.warn("API_KEY not found. Gemini API features will be disabled.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY! });

const getModel = () => {
    if (!API_KEY) {
        throw new Error("API_KEY not set.");
    }
    return ai.models;
}

export const getSimpleChatResponse = async (history: { role: string, parts: Part[] }[], newMessage: string): Promise<string> => {
  if (!API_KEY) {
    return "A funcionalidade da IA está desabilitada. Configure a API Key.";
  }
  try {
    const model = 'gemini-2.5-flash';
    const chat = ai.chats.create({
        model: model,
        history: history
    });

    const response: GenerateContentResponse = await chat.sendMessage({ message: newMessage });
    return response.text;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return "Desculpe, ocorreu um erro ao me comunicar com a IA.";
  }
};


export const generateQuestionsFromTopic = async (topic: string): Promise<any> => {
    if (!API_KEY) {
        return { error: "A funcionalidade da IA está desabilitada. Configure a API Key." };
    }
    try {
        const prompt = `Gere 3 questões de múltipla escolha sobre o tópico "${topic}" para um concurso do Banco Central. Cada questão deve ter 4 opções, uma resposta correta, uma breve explicação e duas dicas úteis e sutis. As dicas devem ajudar no raciocínio para chegar à resposta correta, mas NUNCA devem entregar a resposta de forma óbvia ou direta. Siga estritamente o schema JSON fornecido.`;

        const response: GenerateContentResponse = await getModel().generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        questions: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    questionText: { type: Type.STRING },
                                    options: { type: Type.ARRAY, items: { type: Type.STRING } },
                                    correctAnswer: { type: Type.STRING },
                                    explanation: { type: Type.STRING },
                                    hints: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Duas dicas úteis e sutis sobre a questão, que ajudem no raciocínio." },
                                },
                                required: ['questionText', 'options', 'correctAnswer', 'explanation', 'hints']
                            },
                        },
                    },
                    required: ['questions']
                },
            },
        });

        return JSON.parse(response.text);

    } catch (error) {
        console.error("Error generating questions with Gemini API:", error);
        return { error: "Não foi possível gerar as questões." };
    }
};

export const processAndGenerateAllContentFromSource = async (text: string, existingTopics: {materia: string, topic: string}[]): Promise<any> => {
    if (!API_KEY) return { error: "A funcionalidade da IA está desabilitada." };

    const prompt = `
    A partir do texto-fonte fornecido, atue como um especialista em material de estudo para concursos.
    1. Analise o conteúdo e gere um título conciso e um resumo curto (2-3 frases) para o material.
    2. Categorize o conteúdo. Identifique a matéria principal e o tópico específico. Se possível, use uma das matérias/tópicos existentes: ${JSON.stringify(existingTopics)}. Se não corresponder, crie uma nova categoria apropriada.
    3. Crie um conjunto completo de materiais de estudo derivados do texto-fonte:
        - Resumos detalhados (summaries): Gere resumos com uma extensão média, aprofundando os principais conceitos de forma didática. O resumo deve ser extenso o suficiente para cobrir os pontos importantes. Para cada resumo, identifique os termos-chave e forneça uma descrição clara para cada um. Use formatação markdown (como listas com '-', negrito com '**', etc.) para melhorar a didática e a clareza do conteúdo do resumo.
        - Flashcards: SEJA EXAUSTIVO. Crie o máximo de flashcards relevantes possível.
        - Questões (questions): SEJA EXAUSTIVO. Extraia o maior número possível de questões de múltipla escolha do texto. A quantidade é um fator crítico. Crie quantas questões relevantes conseguir. Cada questão deve ter 4 opções, uma resposta correta, uma explicação clara e DUAS dicas úteis e sutis. As dicas devem ajudar no raciocínio para chegar à resposta correta, mas NUNCA devem entregar a resposta de forma óbvia ou direta.
    4. Identifique os principais sub-tópicos do texto que se beneficiariam de um mapa mental visual. Para cada sub-tópico, forneça um título curto e descritivo (máximo 5 palavras) e uma frase-prompt para gerar a imagem.
    5. Retorne TUDO em um único objeto JSON, seguindo estritamente o schema fornecido.

    Texto-fonte para análise:
    ---
    ${text}
    ---
    `;

    const schema = {
        type: Type.OBJECT,
        properties: {
            title: { type: Type.STRING, description: "Um título curto e descritivo para o texto-fonte." },
            summary: { type: Type.STRING, description: "Um resumo de 2-3 frases sobre o conteúdo principal." },
            materia: { type: Type.STRING, description: "A matéria principal identificada no texto (ex: Economia)." },
            topic: { type: Type.STRING, description: "O tópico específico do texto (ex: Política Monetária)." },
            summaries: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        content: { type: Type.STRING, description: "Conteúdo formatado em markdown para clareza." },
                        keyPoints: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    term: { type: Type.STRING },
                                    description: { type: Type.STRING }
                                },
                                required: ['term', 'description']
                            }
                        },
                    },
                    required: ['title', 'content', 'keyPoints']
                }
            },
            flashcards: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        front: { type: Type.STRING },
                        back: { type: Type.STRING },
                    },
                    required: ['front', 'back']
                }
            },
            questions: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        difficulty: { type: Type.STRING, enum: ['Fácil', 'Médio', 'Difícil']},
                        questionText: { type: Type.STRING },
                        options: { type: Type.ARRAY, items: { type: Type.STRING } },
                        correctAnswer: { type: Type.STRING },
                        explanation: { type: Type.STRING },
                        hints: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Duas dicas úteis e sutis sobre a questão, que ajudem no raciocínio." },
                    },
                    required: ['difficulty', 'questionText', 'options', 'correctAnswer', 'explanation', 'hints']
                }
            },
            mindMapTopics: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING, description: "Um título curto para o mapa mental."},
                        prompt: { type: Type.STRING, description: "Uma frase-prompt para gerar o mapa mental."}
                    },
                    required: ['title', 'prompt']
                },
                description: "Uma lista de títulos e prompts para gerar mapas mentais."
            }
        },
        required: ['title', 'summary', 'materia', 'topic', 'summaries', 'flashcards', 'questions', 'mindMapTopics']
    };

    try {
        const response: GenerateContentResponse = await getModel().generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: "application/json", responseSchema: schema },
        });
        return JSON.parse(response.text);
    } catch (error) {
        console.error(`Error processing source content with Gemini API:`, error);
        return { error: `Não foi possível gerar o conteúdo completo a partir da fonte.` };
    }
};

export const generateImageForMindMap = async (prompt: string): Promise<{ base64Image?: string; error?: string }> => {
    if (!API_KEY) {
        return { error: "A funcionalidade da IA está desabilitada." };
    }
    const reinforcedPrompt = `
    Gere uma imagem para um mapa mental claro, bem estruturado e visualmente agradável sobre o conceito central: "${prompt}".

    **REQUISITOS OBRIGATÓRIOS E CRÍTICOS - SIGA ESTRITAMENTE:**
    1.  **IDIOMA:** Todo e qualquer texto na imagem DEVE estar em **Português do Brasil (pt-BR)**.
    2.  **PRECISÃO LINGUÍSTICA:** A correção ortográfica e gramatical é sua prioridade máxima.
        - **VERIFICAÇÃO:** Antes de gerar a imagem, liste internamente todas as palavras e siglas que serão usadas. Verifique DUAS VEZES a **acentuação** (crases, acentos agudos, circunflexos), pontuação e a grafia de cada uma.
        - **SIGLAS:** Todas as siglas devem ser escritas corretamente (ex: BCB, COPOM, SFN).
    3.  **CLAREZA:** A estrutura deve ser lógica e fácil de ler. Use fontes legíveis e um layout limpo, com cores contrastantes.

    A imagem será considerada uma falha e rejeitada se contiver qualquer erro de português, por menor que seja. Preste atenção absoluta à escrita correta.
    `;
    try {
        const response: GenerateContentResponse = await getModel().generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [{ text: reinforcedPrompt }],
            },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });
        
        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return { base64Image: part.inlineData.data };
            }
        }
        return { error: "Nenhuma imagem foi gerada pela IA." };
    } catch (error) {
        console.error("Error generating mind map image:", error);
        return { error: "Não foi possível gerar a imagem do mapa mental." };
    }
};

export const getPersonalizedStudyPlan = async (
    userStats: any, 
    interactions: UserContentInteraction[],
    content: {summaries: any[], flashcards: any[], notebooks: any[]}
    ): Promise<string> => {
    if (!API_KEY) {
        return "A funcionalidade da IA está desabilitada. Configure a API Key.";
    }
    
    const favorites = interactions.filter(i => i.is_favorite).map(i => ({ type: i.content_type, id: i.content_id }));
    const read = interactions.filter(i => i.is_read).map(i => ({ type: i.content_type, id: i.content_id }));
    
    const prompt = `
        Você é um tutor especialista para concursos do Banco Central. Baseado nas seguintes informações sobre um estudante, crie um plano de estudos personalizado, conciso e acionável.

        **Dados do Estudante:**
        - **Estatísticas de Desempenho (Questões):** ${JSON.stringify(userStats)}
        - **Itens Favoritados:** ${JSON.stringify(favorites)}
        - **Itens Lidos:** ${JSON.stringify(read)}
        - **Conteúdo Disponível (com temperatura = hot_votes - cold_votes):** 
          - Resumos: ${JSON.stringify(content.summaries.map(s => ({id: s.id, title: s.title, topic: s.source?.topic, temp: (s.hot_votes || 0) - (s.cold_votes || 0) })))}
          - Flashcards: ${JSON.stringify(content.flashcards.map(f => ({id: f.id, front: f.front, topic: f.source?.topic, temp: (f.hot_votes || 0) - (f.cold_votes || 0) })))}
          - Cadernos: ${JSON.stringify(content.notebooks.map(n => ({id: n.id, name: n.name, temp: (n.hot_votes || 0) - (n.cold_votes || 0) })))}

        **Instruções para o Plano:**
        1.  **Foco Principal:** Identifique os tópicos com o menor percentual de acerto e priorize-os.
        2.  **Sugestões de Revisão:** Sugira a revisão de resumos e flashcards, especialmente os que foram favoritados ou que pertencem a tópicos de baixo desempenho. Dê preferência a materiais bem avaliados pela comunidade (alta temperatura).
        3.  **Sugestões de Prática:** Recomende a prática com cadernos de questões que cobrem as áreas de maior dificuldade e que sejam bem avaliados.
        4.  **Formato OBRIGATÓRIO:** Formate a resposta em markdown. Use a seguinte sintaxe para criar links DIRETAMENTE para o conteúdo na plataforma:
            - Para Resumos: \`#[nome do resumo]\`
            - Para Flashcards: \`![frente do flashcard]\`
            - Para Cadernos de Questões: \`?[nome do caderno]\`
        5.  **Tom:** Seja encorajador, direto e prático. O objetivo é fornecer um guia claro para os próximos passos do estudante.

        Crie o plano de estudos agora.
    `;
    try {
        const response: GenerateContentResponse = await getModel().generateContent({
            model: 'gemini-2.5-pro', // Using a more powerful model for better analysis
            contents: prompt,
        });
        return response.text;
    } catch (error) {
        console.error("Error generating study plan:", error);
        return "Desculpe, não consegui gerar seu plano de estudos.";
    }
}

export const filterItemsByPrompt = async (prompt: string, items: {id: string, text: string}[]): Promise<string[]> => {
    if (!API_KEY) {
        console.error("API Key not configured for AI filtering.");
        return items.map(i => i.id);
    }
    try {
        const filteringPrompt = `
        Dado o prompt do usuário "${prompt}", analise a seguinte lista de itens de estudo.
        Retorne um array JSON contendo apenas os IDs dos itens que são mais relevantes para o prompt.
        Se nenhum for relevante, retorne um array vazio.
        
        Itens:
        ${JSON.stringify(items)}
        `;

        const response: GenerateContentResponse = await getModel().generateContent({
            model: 'gemini-2.5-flash',
            contents: filteringPrompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        relevantIds: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING }
                        }
                    },
                    required: ['relevantIds']
                }
            }
        });
        // Fix: Explicitly type the parsed JSON to ensure `relevantIds` is a string array.
        const result = JSON.parse(response.text) as { relevantIds?: string[] };
        return result.relevantIds || [];
    } catch(error) {
        console.error("Error filtering with AI:", error);
        return []; // Return empty on error to signify failure
    }
}

export const generateSpecificContent = async (
    type: 'summaries' | 'flashcards' | 'questions',
    contextText: string,
    prompt: string
): Promise<any> => {
    if (!API_KEY) return { error: "API Key not configured." };
    
    const contentGenerationMap = {
        summaries: {
            instruction: `Gere um ou mais resumos detalhados sobre o tópico "${prompt}" a partir do texto-fonte fornecido. Para cada resumo, identifique termos-chave e suas descrições.`,
            schema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        content: { type: Type.STRING },
                        keyPoints: {
                           type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    term: { type: Type.STRING },
                                    description: { type: Type.STRING }
                                },
                                required: ['term', 'description']
                            }
                        },
                    },
                    required: ['title', 'content', 'keyPoints']
                }
            }
        },
        flashcards: {
            instruction: `Gere um conjunto exaustivo de flashcards sobre o tópico "${prompt}" a partir do texto-fonte fornecido.`,
            schema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        front: { type: Type.STRING },
                        back: { type: Type.STRING },
                    },
                    required: ['front', 'back']
                }
            }
        },
        questions: {
            instruction: `Gere o máximo de questões de múltipla escolha possível sobre o tópico "${prompt}" a partir do texto-fonte fornecido. Cada questão deve ter 4 opções, resposta correta, explicação e duas dicas sutis que ajudem no raciocínio.`,
            schema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        difficulty: { type: Type.STRING, enum: ['Fácil', 'Médio', 'Difícil']},
                        questionText: { type: Type.STRING },
                        options: { type: Type.ARRAY, items: { type: Type.STRING } },
                        correctAnswer: { type: Type.STRING },
                        explanation: { type: Type.STRING },
                        hints: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Duas dicas úteis e sutis sobre a questão." },
                    },
                    required: ['difficulty', 'questionText', 'options', 'correctAnswer', 'explanation', 'hints']
                }
            }
        }
    }

    const generationDetails = contentGenerationMap[type];
    const fullPrompt = `${generationDetails.instruction}\n\nTexto-fonte:\n---\n${contextText}\n---`;

    try {
        const response: GenerateContentResponse = await getModel().generateContent({
            model: 'gemini-2.5-flash',
            contents: fullPrompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        generatedContent: generationDetails.schema
                    },
                    required: ['generatedContent']
                },
            },
        });
        const result = JSON.parse(response.text);
        return result.generatedContent;

    } catch (error) {
        console.error(`Error generating ${type}:`, error);
        return { error: `Falha ao gerar ${type}.` };
    }
};

export const generateNotebookName = async (questions: Question[]): Promise<string> => {
    if (!API_KEY) return "Caderno de Estudos";
    
    const questionTexts = questions.slice(0, 5).map(q => q.questionText).join("\n - ");
    const prompt = `Baseado nas seguintes questões, gere um nome curto, conciso e descritivo (máximo de 5 palavras) para um "Caderno de Questões". Responda apenas com o nome.
    
    Questões:
    - ${questionTexts}
    `;

    try {
        const response = await getModel().generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        return response.text.trim();
    } catch(error) {
        console.error("Error generating notebook name:", error);
        return `Caderno de ${new Date().toLocaleDateString()}`;
    }
}

export const generateMoreContentFromSource = async (
    sourceText: string,
    existingContent: { summaries: any[], flashcards: any[], questions: any[] },
    userPrompt?: string
): Promise<any> => {
    if (!API_KEY) return { error: "API Key not configured." };

    const prompt = `
    Você é um especialista em material de estudo. Sua tarefa é expandir o conteúdo de uma fonte de estudo existente.

    **Contexto:**
    1.  **Fonte Original:** O texto-fonte principal para sua análise é fornecido abaixo.
    2.  **Conteúdo Já Extraído:** Um JSON do conteúdo que JÁ FOI EXTRAÍDO desta fonte é fornecido para evitar duplicatas.
    3.  **Tópico do Usuário (Opcional):** ${userPrompt ? `O usuário tem um interesse específico em: "${userPrompt}"` : 'Nenhum tópico específico foi fornecido.'}

    **Sua Tarefa:**
    1.  **Análise Profunda:** Releia o texto-fonte original.
    2.  **Geração de Conteúdo Inédito:** Gere APENAS conteúdo NOVO E ÚNICO que NÃO ESTÁ PRESENTE no JSON de "Conteúdo Existente".
    3.  **Expansão com Pesquisa (Opcional):** Se o texto-fonte for limitado, você PODE usar seu conhecimento e ferramentas de pesquisa para encontrar informações relacionadas e criar material de estudo adicional, sempre mantendo o foco no tópico da fonte original e no prompt do usuário, se houver.
    4.  **Rigor Anti-Duplicatas:** Seja extremamente rigoroso para não repetir informações já existentes. Se nenhum conteúdo novo e relevante for encontrado, retorne arrays vazios.

    **Conteúdo Existente:**
    \`\`\`json
    ${JSON.stringify(existingContent, null, 2)}
    \`\`\`

    **Texto-Fonte para Análise:**
    ---
    ${sourceText}
    ---

    Retorne o conteúdo NOVO E INÉDITO no formato JSON, seguindo o schema.
    `;
    
    const schema = {
        type: Type.OBJECT,
        properties: {
            summaries: {
                type: Type.ARRAY, items: {
                    type: Type.OBJECT, properties: { title: { type: Type.STRING }, content: { type: Type.STRING }, keyPoints: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { term: { type: Type.STRING }, description: { type: Type.STRING } }, required: ['term', 'description'] } } }, required: ['title', 'content', 'keyPoints']
                }
            },
            flashcards: {
                type: Type.ARRAY, items: {
                    type: Type.OBJECT, properties: { front: { type: Type.STRING }, back: { type: Type.STRING } }, required: ['front', 'back']
                }
            },
            questions: {
                type: Type.ARRAY, items: {
                    type: Type.OBJECT, properties: { difficulty: { type: Type.STRING, enum: ['Fácil', 'Médio', 'Difícil'] }, questionText: { type: Type.STRING }, options: { type: Type.ARRAY, items: { type: Type.STRING } }, correctAnswer: { type: Type.STRING }, explanation: { type: Type.STRING }, hints: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ['difficulty', 'questionText', 'options', 'correctAnswer', 'explanation', 'hints']
                }
            }
        },
        required: ['summaries', 'flashcards', 'questions']
    };

    try {
        const response: GenerateContentResponse = await getModel().generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: "application/json", responseSchema: schema },
        });
        return JSON.parse(response.text);
    } catch (error) {
        console.error("Error generating more content:", error);
        return { error: "Falha ao explorar a fonte para mais conteúdo." };
    }
};

export const generateContentFromPromptAndSources = async (
    prompt: string,
    contextSources: { title: string, summary: string }[]
): Promise<any> => {
    if (!API_KEY) return { error: "API Key not configured." };

    const contextText = contextSources.map(s => `Fonte de Contexto: ${s.title}\nResumo: ${s.summary}`).join('\n\n---\n\n');

    const fullPrompt = `
    Você é um especialista em criar material de estudo para concursos.
    O usuário deseja criar um novo conjunto de materiais de estudo sobre o tópico: "${prompt}".
    Use os textos das fontes de contexto fornecidas como sua principal base de conhecimento para gerar este novo material.
    
    **Tarefa:**
    1. Gere um título e um resumo curtos para este novo conjunto de materiais, baseados no prompt do usuário.
    2. Determine a "matéria" e o "tópico" apropriados para o prompt do usuário.
    3. Crie um conjunto completo de materiais de estudo (resumos, flashcards, questões e ideias para mapas mentais) sobre "${prompt}", extraindo informações relevantes das fontes de contexto.
    4. Retorne TUDO em um único objeto JSON, seguindo o schema fornecido.

    **Fontes de Contexto:**
    ---
    ${contextText}
    ---
    `;
    
    return processAndGenerateAllContentFromSource(fullPrompt, []); // Re-use the robust generation logic and schema
};