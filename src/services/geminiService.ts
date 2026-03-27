
import { GoogleGenerativeAI } from "@google/generative-ai";

// Analyze incident using Gemini API to determine severity and suggested conduct
export async function analyzeIncident(description: string) {
  const apiKey = import.meta.env.VITE_API_KEY;
  if (!apiKey) return null;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  
  try {
    const prompt = `Analise a seguinte ocorrência escolar e forneça uma classificação de gravidade (Baixa, Média, Alta, Crítica) e uma breve sugestão de conduta: "${description}". Responda APENAS em formato JSON com as chaves "severity" e "recommendation".`;
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    if (text) {
      return JSON.parse(text);
    }
  } catch (error) {
    console.error("Erro ao analisar com Gemini:", error);
  }
  return null;
}
