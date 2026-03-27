import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { GraduationCap } from 'lucide-react';
import { getSchoolConfig } from '../data/schoolsData';

interface ResetPasswordProps {
    onComplete: () => void;
    onCancel: () => void;
    schoolId?: string | null;
}

const ResetPassword: React.FC<ResetPasswordProps> = ({ onComplete, onCancel, schoolId }) => {
    const school = getSchoolConfig(schoolId);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setIsLoading(true);

        try {
            if (newPassword !== confirmPassword) {
                throw new Error('AS SENHAS NÃO CONFEREM.');
            }

            if (newPassword.length < 6) {
                throw new Error('A SENHA DEVE TER NO MÍNIMO 6 CARACTERES.');
            }

            console.log('🔐 [RESET] Atualizando senha...');

            const { error: updateError } = await supabase.auth.updateUser({
                password: newPassword
            });

            if (updateError) {
                console.error('❌ [RESET] Erro ao atualizar senha:', updateError);

                // Melhorar mensagens para o usuário
                if (updateError.message.includes('expired')) {
                    throw new Error('ESTE LINK JÁ EXPIROU. POR FAVOR, SOLICITE UM NOVO E-MAIL DE REDEFINIÇÃO.');
                }
                if (updateError.message.includes('same as old')) {
                    throw new Error('A NOVA SENHA NÃO PODE SER IGUAL À ANTERIOR.');
                }

                throw new Error(updateError.message.toUpperCase());
            }

            console.log('✅ [RESET] Senha atualizada com sucesso!');
            setMessage('✅ SENHA ATUALIZADA COM SUCESSO! VOCÊ JÁ PODE ACESSAR O PORTAL.');

            setTimeout(() => {
                onComplete();
            }, 2000);

        } catch (err: any) {
            console.error('❌ [RESET] Erro:', err);
            setError(err.message.toUpperCase());
        } finally {
            setIsLoading(false);
        }
    };

    // Nova Logo Estilizada

    return (
        <div className="h-screen w-full flex items-center justify-center bg-[#000d1a] p-4 font-sans relative overflow-hidden fixed inset-0">
            <div className="absolute inset-0 bg-gradient-to-br from-[#000d1a] via-[#001a35] to-[#002b5c] opacity-100"></div>

            <div className="w-full max-w-[440px] bg-white rounded-[60px] shadow-[0_40px_80px_rgba(0,0,0,0.7)] flex flex-col items-center z-10 relative py-10 px-10 border border-white/10 animate-fade-in overflow-y-auto max-h-[95vh] custom-scrollbar">

                <div className="mb-4 mt-2 relative">
                    <div className="absolute inset-0 bg-blue-500/20 blur-2xl rounded-full"></div>
                    <div className="relative z-10 w-20 h-20 bg-gradient-to-tr from-blue-700 to-teal-400 rounded-2xl flex items-center justify-center shadow-lg transform rotate-3 drop-shadow-2xl border border-white/20 overflow-hidden">
                      {school.logoType === 'image' ? (
                        <img src={school.logoUrl} alt={school.name} className="w-full h-full object-contain p-2" />
                      ) : (
                        <GraduationCap className="text-white w-12 h-12 -rotate-3" />
                      )}
                    </div>
                </div>

                <div className="text-center mb-8">
                    <h1 className="text-[#002b5c] text-lg font-black uppercase tracking-tight">
                        {school.fullName} 2026
                    </h1>
                    <div className="h-1.5 w-10 bg-teal-500 mx-auto mt-2 rounded-full"></div>
                    <p className="text-gray-400 text-[8px] font-black uppercase tracking-[0.4em] mt-3">
                        REDEFINIR MINHA SENHA
                    </p>
                </div>

                <form onSubmit={handleResetPassword} className="w-full space-y-4 flex flex-col items-center animate-fade-in">
                    <div className="space-y-1 w-full text-left">
                        <label className="text-[9px] font-black text-[#002b5c] uppercase ml-6 tracking-widest opacity-70">Nova Senha</label>
                        <input
                            required
                            type="password"
                            placeholder="Mínimo 6 caracteres"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            className="w-full h-12 px-6 bg-gray-50 border border-gray-100 rounded-full text-xs font-bold text-[#002b5c] outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                        />
                    </div>

                    <div className="space-y-1 w-full text-left">
                        <label className="text-[9px] font-black text-[#002b5c] uppercase ml-6 tracking-widest opacity-70">Confirmar Nova Senha</label>
                        <input
                            required
                            type="password"
                            placeholder="Digite a senha novamente"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            className="w-full h-12 px-6 bg-gray-50 border border-gray-100 rounded-full text-xs font-bold text-[#002b5c] outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                        />
                    </div>

                    {error && <div className="p-3 w-full bg-red-50 text-red-600 rounded-[24px] text-[8.5px] font-black text-center uppercase border border-red-100 animate-shake leading-tight">{error}</div>}
                    {message && <div className="p-3 w-full bg-green-50 text-green-600 rounded-[24px] text-[8.5px] font-black text-center uppercase border border-green-100 leading-tight">{message}</div>}

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full h-14 bg-gradient-to-r from-orange-400 to-orange-700 hover:scale-[1.02] text-white rounded-full font-black text-[10px] uppercase tracking-[0.25em] shadow-xl transition-all active:scale-95 disabled:opacity-50 mt-4"
                    >
                        {isLoading ? 'ATUALIZANDO...' : 'ATUALIZAR SENHA'}
                    </button>

                    <button
                        type="button"
                        onClick={onCancel}
                        className="mt-4 text-[9px] font-black text-gray-400 uppercase tracking-widest hover:text-[#002b5c] transition-colors"
                    >
                        Cancelar
                    </button>
                </form>

                <div className="mt-8 text-center w-full">
                    <p className="text-[8px] font-bold text-gray-300 uppercase tracking-widest leading-relaxed">
                        APÓS ATUALIZAR, ENTRE COM SUA NOVA SENHA
                    </p>
                </div>

                <div className="mt-10 pt-6 border-t border-gray-50 w-full text-center">
                    <p className="text-[9px] font-bold text-gray-200 uppercase tracking-widest">SECRETARIA DA EDUCAÇÃO DO ESTADO DE SÃO PAULO</p>
                </div>
            </div>

            <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
        .animate-shake { animation: shake 0.2s ease-in-out 0s 2; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
      `}</style>
        </div>
    );
};

export default ResetPassword;
