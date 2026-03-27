import React, { useState } from 'react';
import { analyzeIncident } from '../services/geminiService';
import type { Incident } from '../types';

interface IncidentFormProps {
  onSave: (incident: Incident) => void;
  onCancel: () => void;
}

const IncidentForm: React.FC<IncidentFormProps> = ({ onSave, onCancel }) => {
  const [studentName, setStudentName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAnalyzing(true);

    const aiResult = await analyzeIncident(description);

    // Added the required 'source' property to match the Incident interface definition.
    const newIncident: Incident = {
      id: Date.now().toString(),
      studentName,
      category,
      date: new Date().toLocaleDateString('pt-BR'),
      description,
      severity: aiResult?.severity || 'Baixa',
      aiAnalysis: aiResult?.recommendation || 'Aguardando revisão manual.',
      status: 'Pendente',
      source: 'professor'
    };

    onSave(newIncident);
    setIsAnalyzing(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-blue-900 text-white">
          <h2 className="text-xl font-bold">Nova Ocorrência</h2>
          <button onClick={onCancel} className="text-blue-200 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700">Nome do Aluno</label>
              <input
                required
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Ex: João da Silva"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700">Categoria</label>
              <select
                required
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">Selecione...</option>
                <option value="Indisciplina">Indisciplina</option>
                <option value="Conflito">Conflito entre alunos</option>
                <option value="Acadêmico">Rendimento Acadêmico</option>
                <option value="Frequência">Problemas de Frequência</option>
                <option value="Saúde">Saúde/Bem-estar</option>
                <option value="Outros">Outros</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">Descrição Detalhada</label>
            <textarea
              required
              rows={4}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Descreva detalhadamente o ocorrido..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
            <div className="flex items-start gap-3">
              <div className="bg-blue-600 text-white p-1 rounded-md">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-bold text-blue-900">Análise Inteligente Ativada</h4>
                <p className="text-xs text-blue-700 mt-0.5">
                  Ao salvar, nosso sistema analisará o texto para sugerir automaticamente a gravidade e as próximas etapas.
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-2 text-gray-600 font-semibold hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isAnalyzing}
              className={`px-6 py-2 bg-blue-600 text-white font-bold rounded-lg transition-all shadow-md ${
                isAnalyzing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700 active:scale-95'
              }`}
            >
              {isAnalyzing ? 'Analisando...' : 'Salvar Ocorrência'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default IncidentForm;
