import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { GraduationCap, Eye, EyeOff, CheckCircle } from 'lucide-react';
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
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    // Força da senha
    const getStrength = (pwd: string) => {
        if (pwd.length === 0) return 0;
        let score = 0;
        if (pwd.length >= 6) score++;
        if (pwd.length >= 10) score++;
        if (/[A-Z]/.test(pwd)) score++;
        if (/[0-9]/.test(pwd)) score++;
        if (/[^A-Za-z0-9]/.test(pwd)) score++;
        return score;
    };

    const strength = getStrength(newPassword);
    const strengthLabel = ['', 'Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte'][strength];
    const strengthColor = ['', 'bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-teal-400', 'bg-green-500'][strength];

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            if (newPassword !== confirmPassword) {
                throw new Error('AS SENHAS NÃO CONFEREM.');
            }
            if (newPassword.length < 6) {
                throw new Error('A SENHA DEVE TER NO MÍNIMO 6 CARACTERES.');
            }

            const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

            if (updateError) {
                if (updateError.message.includes('expired')) {
                    throw new Error('ESTE LINK JÁ EXPIROU. SOLICITE UM NOVO E-MAIL DE REDEFINIÇÃO.');
                }
                if (updateError.message.includes('same as old')) {
                    throw new Error('A NOVA SENHA NÃO PODE SER IGUAL À ANTERIOR.');
                }
                throw new Error(updateError.message.toUpperCase());
            }

            setSuccess(true);
            setTimeout(() => onComplete(), 3000);

        } catch (err: any) {
            setError(err.message.toUpperCase());
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="h-screen w-full flex items-center justify-center bg-[#000d1a] p-4 font-sans relative overflow-hidden fixed inset-0">
            <div className="absolute inset-0 bg-gradient-to-br from-[#000d1a] via-[#001a35] to-[#002b5c] opacity-100"></div>

            <div className="w-full max-w-[440px] bg-white rounded-[60px] shadow-[0_40px_80px_rgba(0,0,0,0.7)] flex flex-col items-center z-10 relative py-10 px-10 border border-white/10 animate-fade-in overflow-y-auto max-h-[95vh] custom-scrollbar">

                {/* Logo */}
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

                {/* Título */}
                <div className="text-center mb-6">
                    <h1 className="text-[#002b5c] text-lg font-black uppercase tracking-tight">
                        {school.fullName} 2026
                    </h1>
                    <div className="h-1.5 w-10 bg-teal-500 mx-auto mt-2 rounded-full"></div>
                    <p className="text-gray-400 text-[8px] font-black uppercase tracking-[0.4em] mt-3">
                        REDEFINIR MINHA SENHA
                    </p>
                </div>

                {/* Instrução */}
                <div className="w-full bg-blue-50 border border-blue-100 rounded-2xl p-3 mb-4 text-center">
                    <p className="text-[9px] font-black text-blue-700 uppercase leading-relaxed">
                        🔐 Crie uma senha segura para acessar a plataforma.<br />
                        Use letras maiúsculas, números e símbolos.
                    </p>
                </div>

                <form onSubmit={handleResetPassword} className="w-full space-y-4 flex flex-col items-center animate-fade-in">

                    {/* Nova senha */}
                    <div className="space-y-1 w-full text-left">
                        <label className="text-[9px] font-black text-[#002b5c] uppercase ml-6 tracking-widest opacity-70">Nova Senha</label>
                        <div className="relative">
                            <input
                                required
                                type={showNew ? 'text' : 'password'}
                                placeholder="Mínimo 6 caracteres"
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                className="w-full h-12 px-6 pr-12 bg-gray-50 border border-gray-100 rounded-full text-xs font-bold text-[#002b5c] outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                            />
                            <button type="button" onClick={() => setShowNew(!showNew)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#002b5c]">
                                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        {/* Barra de força */}
                        {newPassword.length > 0 && (
                            <div className="px-4 space-y-1">
                                <div className="flex gap-1 mt-1">
                                    {[1,2,3,4,5].map(i => (
                                        <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= strength ? strengthColor : 'bg-gray-100'}`} />
                                    ))}
                                </div>
                                <p className={`text-[8px] font-black uppercase ml-1 ${['','text-red-400','text-orange-400','text-yellow-500','text-teal-500','text-green-500'][strength]}`}>
                                    Força: {strengthLabel}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Confirmar senha */}
                    <div className="space-y-1 w-full text-left">
                        <label className="text-[9px] font-black text-[#002b5c] uppercase ml-6 tracking-widest opacity-70">Confirmar Nova Senha</label>
                        <div className="relative">
                            <input
                                required
                                type={showConfirm ? 'text' : 'password'}
                                placeholder="Digite a senha novamente"
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                className={`w-full h-12 px-6 pr-12 bg-gray-50 border rounded-full text-xs font-bold text-[#002b5c] outline-none focus:ring-2 transition-all ${
                                    confirmPassword.length > 0
                                        ? newPassword === confirmPassword
                                            ? 'border-green-300 focus:ring-green-400'
                                            : 'border-red-200 focus:ring-red-300'
                                        : 'border-gray-100 focus:ring-orange-500'
                                }`}
                            />
                            <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#002b5c]">
                                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        {confirmPassword.length > 0 && newPassword === confirmPassword && (
                            <p className="text-[8px] font-black text-green-500 uppercase ml-6">✓ Senhas conferem</p>
                        )}
                        {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                            <p className="text-[8px] font-black text-red-400 uppercase ml-6">✗ Senhas não conferem</p>
                        )}
                    </div>

                    {error && (
                        <div className="p-3 w-full bg-red-50 text-red-600 rounded-[24px] text-[8.5px] font-black text-center uppercase border border-red-100 animate-shake leading-tight">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading || newPassword !== confirmPassword || newPassword.length < 6}
                        className="w-full h-14 bg-gradient-to-r from-orange-400 to-orange-700 hover:scale-[1.02] text-white rounded-full font-black text-[10px] uppercase tracking-[0.25em] shadow-xl transition-all active:scale-95 disabled:opacity-40 mt-2"
                    >
                        {isLoading ? 'ATUALIZANDO...' : 'ATUALIZAR SENHA'}
                    </button>

                    <button type="button" onClick={onCancel}
                        className="mt-2 text-[9px] font-black text-gray-400 uppercase tracking-widest hover:text-[#002b5c] transition-colors">
                        Cancelar
                    </button>
                </form>

                <div className="mt-6 pt-4 border-t border-gray-50 w-full text-center">
                    <p className="text-[7px] font-bold text-gray-300 uppercase tracking-widest">SECRETARIA DA EDUCAÇÃO DO ESTADO DE SÃO PAULO</p>
                </div>
            </div>

            {/* Modal de sucesso */}
            {success && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
                    <div className="w-full max-w-sm bg-white rounded-[40px] shadow-2xl flex flex-col items-center p-8 gap-5">
                        
                        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-green-400 to-teal-500 flex items-center justify-center shadow-lg animate-bounce-once">
                            <CheckCircle className="w-12 h-12 text-white" />
                        </div>

                        <div className="text-center">
                            <h2 className="text-[#002b5c] text-lg font-black uppercase">Senha Atualizada!</h2>
                            <div className="h-1 w-8 bg-teal-500 mx-auto mt-2 rounded-full"></div>
                        </div>

                        <div className="w-full bg-green-50 border border-green-100 rounded-2xl p-4 text-center">
                            <p className="text-[10px] font-black text-green-700 uppercase leading-relaxed">
                                ✅ Sua senha foi redefinida com sucesso!<br />
                                Você será redirecionado para o login em instantes.
                            </p>
                        </div>

                        <div className="flex gap-1">
                            {[0,1,2].map(i => (
                                <div key={i} className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                .animate-fade-in { animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1); }
                @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
                .animate-shake { animation: shake 0.2s ease-in-out 0s 2; }
                @keyframes bounceOnce { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
                .animate-bounce-once { animation: bounceOnce 0.5s ease-in-out; }
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
            `}</style>
        </div>
    );
};

export default ResetPassword;
