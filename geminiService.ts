
import { GoogleGenAI } from "@google/genai";

let aiInstance: InstanceType<typeof GoogleGenAI> | null = null;

function getAI(): InstanceType<typeof GoogleGenAI> | null {
  if (aiInstance !== null) return aiInstance;
  const key = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY || "";
  if (!key || typeof key !== "string" || key.length === 0) return null;
  try {
    aiInstance = new GoogleGenAI({ apiKey: key });
    return aiInstance;
  } catch {
    return null;
  }
}

export async function generateShopDescription(name: string, type: string): Promise<string> {
  const ai = getAI();
  if (!ai) return "Um espaço dedicado ao seu bem-estar e estilo.";
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Escreva uma descrição atraente, curta e profissional para ${
        type === 'BARBER'
          ? 'uma Barbearia'
          : type === 'MANICURE'
            ? 'um estúdio de Manicure e cuidados com as unhas'
            : 'um Salão de Beleza'
      } chamado(a) "${name}". A descrição deve ser convidativa e passar uma sensação de exclusividade. No máximo 2 parágrafos.`,
    });
    return response.text || "Bem-vindo ao nosso espaço de beleza e cuidado.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Um espaço dedicado ao seu bem-estar e estilo.";
  }
}

export async function generateDailyBriefing(shopName: string, appointmentsCount: number, busyTime: string): Promise<string> {
  const ai = getAI();
  if (!ai) return "Prepare-se para mais um dia de sucesso e ótimos cortes!";
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Você é um assistente de gestão para a barbearia/salão "${shopName}". 
      Hoje há ${appointmentsCount} agendamentos. O horário de pico é ${busyTime}. 
      Crie um briefing motivacional e prático de 2 frases para o dono começar o dia. 
      Use emojis e tom amigável.`,
    });
    return response.text || "Dia movimentado! Organize sua bancada e prepare-se para brilhar.";
  } catch (error) {
    return "Prepare-se para mais um dia de sucesso e ótimos cortes!";
  }
}
