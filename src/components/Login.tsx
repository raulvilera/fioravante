import React, { useState, useEffect, useMemo } from 'react';
import { GraduationCap } from 'lucide-react';
import type { User } from '../types';
import { supabase } from '../services/supabaseClient';
import { getSchoolConfig } from '../data/schoolsData';
import { 
  isProfessorRegistered, 
  getProfessorNameFromEmail, 
  FIXED_GESTAO_EMAILS, 
  DUAL_ACCESS_EMAILS, 
  isGestaoEmail, 
  isInstitutionalEmail, 
  normalizeEmail 
} from '../data/professorsData';

interface LoginProps {
  onLogin: (user: User) => void;
}

type AuthMode = 'login' | 'register' | 'forgot' | 'admin_register';

const ESCOLA_ID = 'fioravante';

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // ── Estados do cadastro pela gestão ──────────────────────────────────────
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminStep, setAdminStep] = useState<'auth' | 'form'>('auth');
  const [newProfEmail, setNewProfEmail] = useState('');
  const [newProfNome, setNewProfNome] = useState('');
  const [tempPassword, setTempPassword] = useState('');

  const generateTempPassword = () => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  };

  const resetAdminForm = () => {
    setAdminEmail(''); setAdminPassword(''); setAdminStep('auth');
    setNewProfEmail(''); setNewProfNome(''); setTempPassword('');
    setError(''); setMessage('');
  };

  useEffect(() => {
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = 'auto';
      document.body.style.overflow = 'auto';
    };
  }, []);

  // Mapeamento de aliases de e-mail para contas reais
  const EMAIL_ALIASES: Record<string, string> = {};


  const sanitizeEmail = (email: string): string => {
    return email.toLowerCase().trim().replace(/[!#$%^&*(),?":{}|<>]/g, '');
  };

  const resolveEmailAlias = (email: string): string => {
    const cleanEmail = sanitizeEmail(email);
    return EMAIL_ALIASES[cleanEmail] || cleanEmail;
  };

  const validateInstitutionalEmail = (email: string) => {
    const lowerEmail = email.toLowerCase().trim();
    // E-mails permitidos: institucionais ou os de gestão específicos que não são @prof (como o do gmail)
    const SPECIAL_MANAGEMENT = FIXED_GESTAO_EMAILS;

    if (SPECIAL_MANAGEMENT.includes(lowerEmail)) {
      return true;
    }

    // Outros e-mails devem ser institucionais
    return lowerEmail.endsWith('@prof.educacao.sp.gov.br') ||
      lowerEmail.endsWith('@professor.educacao.sp.gov.br') ||
      lowerEmail.endsWith('@servidor.educacao.sp.gov.br') ||
      lowerEmail.endsWith('@educacao.sp.gov.br');
  };

  const registeredName = useMemo(() => {
    if (authMode === 'register' && email.includes('@')) {
      return getProfessorNameFromEmail(email);
    }
    return '';
  }, [email, authMode]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);

    const loginTimeout = setTimeout(() => {
      setIsLoading(false);
      setError('TEMPO LIMITE EXCEDIDO. VERIFIQUE SUA CONEXÃO OU TENTE NOVAMENTE.');
    }, 15000); // 15 segundos de timeout

    try {
      const lowerEmail = sanitizeEmail(email);
      const displayEmail = lowerEmail; // Email que o usuário digitou (limpo)
      const authEmail = resolveEmailAlias(lowerEmail); // Email real para autenticação

      console.log('🔐 [LOGIN] Tentando login com:', displayEmail);
      if (displayEmail !== authEmail) {
        console.log('🔄 [LOGIN] Usando alias: ' + displayEmail + ' → ' + authEmail);
      }

      if (!validateInstitutionalEmail(lowerEmail)) {
        throw new Error('ACESSO NEGADO: UTILIZE SEU E-MAIL INSTITUCIONAL (@prof, @professor, @servidor ou @educacao.sp.gov.br).');
      }

      console.log('✅ [LOGIN] E-mail validado como institucional');
      console.log('🔗 [LOGIN] Conectando ao Supabase Auth...');

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: authEmail, // Usa o email real para autenticação
        password
      });

      if (authError) {
        console.error('❌ [LOGIN] Erro de autenticação Supabase:', authError);
        if (authError.message.includes('Invalid login credentials')) {
          throw new Error('CREDENCIAIS INVÁLIDAS. VERIFIQUE SEUS DADOS OU SE JÁ CONFIRMOU SEU E-MAIL NO LINK ENVIADO.');
        }
        throw new Error(authError.message.toUpperCase());
      }

      if (data.user) {
        console.log('✅ [LOGIN] Autenticado! Buscando autorização para:', displayEmail);

        // E-mails de gestão com perfil fixo (não precisam de consulta ao banco)
        if (isGestaoEmail(displayEmail)) {
          console.log('✅ [LOGIN] E-mail de gestão. Role: gestor');
          onLogin({ email: displayEmail, role: 'gestor' });
          return;
        }
        // Acesso duplo (gestor + professor)
        if (DUAL_ACCESS_EMAILS.some(e => normalizeEmail(e) === normalizeEmail(displayEmail))) {
          console.log('✅ [LOGIN] Acesso duplo. Role: gestor');
          onLogin({ email: displayEmail, role: 'gestor' });
          return;
        }

        // Função para buscar cargo no banco com timeout — FILTRADO POR ESCOLA
        const fetchRoleWithTimeout = async () => {
          const eBase = displayEmail.split('@')[0];
          const query = supabase
            .from('authorized_professors')
            .select('role')
            .eq('escola', 'fioravante')
            .or(`email.eq.${displayEmail},email.eq.${eBase}@prof.educacao.sp.gov.br,email.eq.${eBase}@professor.educacao.sp.gov.br,email.eq.${eBase}@servidor.educacao.sp.gov.br`)
            .maybeSingle();

          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('TIMEOUT_DB')), 4000)
          );

          try {
            const result: any = await Promise.race([query, timeoutPromise]);
            return result.data?.role || null;
          } catch (e) {
            console.warn('⚠️ [LOGIN] Consulta ao banco falhou ou deu timeout, usando fallback local.');
            return null;
          }
        };

        const dbRole = await fetchRoleWithTimeout();
        let userRole: 'gestor' | 'professor' | null = dbRole as any;

        // Fallback para lista local se não encontrou no banco
        if (!userRole && isProfessorRegistered(displayEmail)) {
          console.log('✅ [LOGIN] Autorizado via Lista Local! (Fallback)');
          userRole = 'professor';
        }

        if (userRole) {
          console.log('🚀 [LOGIN] Entrando com role:', userRole);
          onLogin({ email: displayEmail, role: userRole });
        } else {
          console.error('❌ [LOGIN] Acesso negado para:', displayEmail);
          await supabase.auth.signOut();
          throw new Error('ACESSO NEGADO: SEU E-MAIL NÃO CONSTA NA LISTA DE AUTORIZADOS.');
        }
      }

    } catch (err: any) {
      clearTimeout(loginTimeout);
      console.error('❌ [LOGIN] Erro capturado:', err);

      const message = err.message === 'TIMEOUT_DB'
        ? 'A CONEXÃO COM O BANCO ESTÁ LENTA. TENTE NOVAMENTE EM ALGUNS INSTANTES.'
        : (err.message.toUpperCase() || 'ERRO DESCONHECIDO AO TENTAR ENTRAR.');

      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      const lowerEmail = sanitizeEmail(email);

      if (!validateInstitutionalEmail(lowerEmail)) {
        throw new Error('APENAS E-MAILS INSTITUCIONAIS (@prof, @professor, @servidor ou @educacao.sp.gov.br) SÃO PERMITIDOS.');
      }

      if (password !== confirmPassword) {
        throw new Error('AS SENHAS NÃO CONFEREM.');
      }

      if (password.length < 6) {
        throw new Error('A SENHA DEVE TER NO MÍNIMO 6 CARACTERES.');
      }

      const schoolConfig = getSchoolConfig(ESCOLA_ID);
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: lowerEmail,
        password,
        options: {
          data: {
            school_name: schoolConfig.fullName
          }
        }
      });

      if (signUpError) {
        if (signUpError.message.includes('User already registered')) {
          throw new Error('ESTE E-MAIL JÁ POSSUI CADASTRO NO SISTEMA.');
        }
        throw signUpError;
      }

      if (data.user) {
        // E-mails de gestão com perfil fixo
        let userRole: 'gestor' | 'professor' | null = null;

        if (isGestaoEmail(lowerEmail)) {
          userRole = 'gestor';
          console.log('✅ [CADASTRO] E-mail de gestão. Role: gestor');
        } else {
          // Busca o role e autorização no banco — FILTRADO POR ESCOLA
          const eBase = lowerEmail.split('@')[0];
          const { data: authData } = await supabase
            .from('authorized_professors')
            .select('role')
            .eq('escola', 'fioravante')
            .or(`email.eq.${lowerEmail},email.eq.${eBase}@prof.educacao.sp.gov.br,email.eq.${eBase}@professor.educacao.sp.gov.br,email.eq.${eBase}@servidor.educacao.sp.gov.br`)
            .maybeSingle();

          if (authData) {
            userRole = authData.role as 'gestor' | 'professor';
          } else if (isProfessorRegistered(lowerEmail)) {
            userRole = 'professor';
          }
        }

        if (!userRole) {
          console.error('❌ [CADASTRO] E-mail não autorizado:', lowerEmail);
          await supabase.auth.signOut();
          throw new Error('ACESSO NEGADO: SEU E-MAIL NÃO ESTÁ AUTORIZADO. CONTATE A GESTÃO.');
        }

        // Com confirmação de e-mail desabilitada, o login é automático
        console.log('✅ [CADASTRO] Usuário criado e autenticado automaticamente. Role:', userRole);
        setMessage('CADASTRO REALIZADO! ENTRANDO NO SISTEMA...');
        setTimeout(() => onLogin({ email: data.user!.email!, role: userRole! }), 1000);
      }

    } catch (err: any) {
      setError(err.message.toUpperCase());
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      const lowerEmail = sanitizeEmail(email);
      const authEmail = resolveEmailAlias(lowerEmail); // Resolve para o email real

      if (!validateInstitutionalEmail(lowerEmail)) {
        throw new Error('E-MAIL INVÁLIDO OU NÃO INSTITUCIONAL.');
      }

      // Verifica se o professor está cadastrado antes de enviar reset — FILTRADO POR ESCOLA
      if (!isProfessorRegistered(lowerEmail)) {
        const eBase = lowerEmail.split('@')[0];
        const { data: authorized } = await supabase
          .from('authorized_professors')
          .select('email')
          .eq('escola', 'fioravante')
          .or(`email.eq.${lowerEmail},email.eq.${eBase}@prof.educacao.sp.gov.br,email.eq.${eBase}@professor.educacao.sp.gov.br,email.eq.${eBase}@servidor.educacao.sp.gov.br`)
          .maybeSingle();

        if (!authorized) {
          throw new Error('E-MAIL NÃO CADASTRADO NO SISTEMA. CONTATE A GESTÃO.');
        }
      }

      console.log('🔄 [RESET] Enviando redefinição de senha para:', authEmail);
      if (lowerEmail !== authEmail) {
        console.log('📧 [RESET] Alias detectado: ' + lowerEmail + ' → ' + authEmail);
      }

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(authEmail, {
        redirectTo: `${window.location.origin}/?school=${ESCOLA_ID}`,
      });

      if (resetError) {
        console.error('❌ [RESET] Erro ao enviar e-mail:', resetError);

        // Verifica se é erro de SMTP do Resend (Test Mode)
        if (resetError.message.includes('450') || resetError.message.includes('testing emails')) {
          throw new Error('O SERVIÇO DE E-MAIL ESTÁ EM MODO DE TESTE. O DOMÍNIO PRECISA SER VERIFICADO NO RESEND.');
        }

        throw new Error('ERRO AO PROCESSAR SOLICITAÇÃO. VERIFIQUE A CONFIGURAÇÃO SMTP NO SUPABASE OU TENTE NOVAMENTE.');
      }

      setMessage('✨ SOLICITAÇÃO ENVIADA! VERIFIQUE SUA CAIXA DE ENTRADA (E SPAM) PARA AS INSTRUÇÕES.');
      console.log('✅ [RESET] Solicitação processada para:', lowerEmail);

    } catch (err: any) {
      setError(err.message.toUpperCase());
    } finally {
      setIsLoading(false);
    }
  };

  // ── PASSO 1: Confirmar identidade do gestor ──────────────────────────────
  const handleAdminAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setIsLoading(true);
    try {
      const lowerEmail = adminEmail.toLowerCase().trim();
      if (!isGestaoEmail(lowerEmail) && !DUAL_ACCESS_EMAILS.some(x => normalizeEmail(x) === normalizeEmail(lowerEmail))) {
        throw new Error('APENAS GESTORES PODEM USAR ESTA FUNÇÃO.');
      }
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: lowerEmail, password: adminPassword,
      });
      if (authError || !data.user) throw new Error('CREDENCIAIS INVÁLIDAS. CONFIRME SEU E-MAIL E SENHA DE GESTOR.');
      await supabase.auth.signOut();
      setTempPassword(generateTempPassword());
      setAdminStep('form'); setError('');
    } catch (err: any) {
      setError(err.message.toUpperCase());
    } finally { setIsLoading(false); }
  };

  // ── PASSO 2: Cadastrar o professor com senha temporária ───────────────────
  const handleAdminRegisterProfessor = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setMessage(''); setIsLoading(true);
    try {
      const lowerEmail = newProfEmail.toLowerCase().trim();
      const nome = newProfNome.toUpperCase().trim();
      if (!lowerEmail || !nome) throw new Error('PREENCHA O E-MAIL E O NOME DO PROFESSOR.');
      if (!validateInstitutionalEmail(lowerEmail)) throw new Error('UTILIZE UM E-MAIL INSTITUCIONAL (@PROF OU @PROFESSOR).');
      if (!tempPassword || tempPassword.length < 6) throw new Error('ERRO NA GERAÇÃO DA SENHA. VOLTE E TENTE NOVAMENTE.');

      const { data, error: signUpError } = await supabase.auth.signUp({ email: lowerEmail, password: tempPassword });
      if (signUpError) {
        if (signUpError.message.includes('User already registered')) throw new Error('ESTE E-MAIL JÁ POSSUI CADASTRO NO SISTEMA.');
        throw new Error(signUpError.message.toUpperCase());
      }
      await supabase.from('authorized_professors').upsert([
        { email: lowerEmail, nome, escola: 'fioravante', role: 'professor' }
      ], { onConflict: 'email' });
      await supabase.auth.resetPasswordForEmail(lowerEmail, { redirectTo: `${window.location.origin}/?school=${ESCOLA_ID}` });
      setMessage(`✅ CONTA CRIADA!\n\nPROFESSOR: ${nome}\nE-MAIL: ${lowerEmail}\nSENHA TEMPORÁRIA: ${tempPassword}\n\nAnote e repasse ao professor.\nUm link de redefinição foi enviado ao e-mail dele.`);
      setNewProfEmail(''); setNewProfNome(''); setTempPassword(generateTempPassword());
    } catch (err: any) {
      setError(err.message.toUpperCase());
    } finally { setIsLoading(false); }
  };

  return (
    <div className="flex items-center justify-center bg-black p-4 font-sans overflow-hidden fixed inset-0">
      <div className="absolute inset-0 bg-gradient-to-br from-black via-[#000d1a] to-[#002b5c] opacity-100"></div>

      <div className="w-full max-w-[440px] bg-white rounded-[60px] shadow-[0_40px_80px_rgba(0,0,0,0.7)] flex flex-col items-center z-10 relative py-10 px-10 border border-white/10 animate-fade-in overflow-y-auto max-h-[95vh] custom-scrollbar">

        <div className="mb-4 mt-2 relative">
          <div className="absolute inset-0 bg-blue-500/20 blur-2xl rounded-full"></div>
          <div className="relative z-10 w-20 h-20 bg-gradient-to-tr from-blue-700 to-teal-400 rounded-2xl flex items-center justify-center shadow-lg transform rotate-3 drop-shadow-2xl border border-white/20">
            <GraduationCap className="text-white w-12 h-12 -rotate-3" />
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-[#002b5c] text-lg font-black uppercase tracking-tight">
            {authMode === 'login' ? 'GESTÃO FIORAVANTE IERVOLINO 2026' : authMode === 'register' ? 'CRIAR NOVA CONTA' : authMode === 'forgot' ? 'RECUPERAR ACESSO' : 'CADASTRO PELA GESTÃO'}
          </h1>
          <div className="h-1.5 w-10 bg-teal-500 mx-auto mt-2 rounded-full"></div>
          <p className="text-gray-400 text-[8px] font-black uppercase tracking-[0.4em] mt-3">
            SISTEMA DE GESTÃO 2026
          </p>
        </div>

        {authMode === 'login' && (
          <form onSubmit={handleLogin} className="w-full space-y-4 flex flex-col items-center animate-fade-in">
            <div className="space-y-1 w-full text-left">
              <label className="text-[9px] font-black text-[#002b5c] uppercase ml-6 tracking-widest opacity-70">E-mail Institucional</label>
              <input
                required
                type="email"
                placeholder="nome@prof.educacao.sp.gov.br"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full h-12 px-6 bg-gray-50 border border-gray-100 rounded-full text-xs font-bold text-[#002b5c] outline-none focus:ring-2 focus:ring-teal-500 transition-all lowercase"
              />
            </div>

            <div className="space-y-1 w-full text-left">
              <div className="flex justify-between items-center px-6">
                <label className="text-[9px] font-black text-[#002b5c] uppercase tracking-widest opacity-70">Senha</label>
                <button type="button" onClick={() => setAuthMode('forgot')} className="text-[8px] font-black text-teal-600 uppercase hover:underline">Esqueci a senha</button>
              </div>
              <input
                required
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full h-12 px-6 bg-gray-50 border border-gray-100 rounded-full text-xs font-bold text-[#002b5c] outline-none focus:ring-2 focus:ring-teal-500 transition-all"
              />
            </div>

            {error && <div className="p-3 w-full bg-red-50 text-red-600 rounded-[24px] text-[8.5px] font-black text-center uppercase border border-red-100 animate-shake leading-tight">{error}</div>}
            {message && <div className="p-3 w-full bg-teal-50 text-teal-600 rounded-[24px] text-[8.5px] font-black text-center uppercase border border-teal-100 leading-tight">{message}</div>}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-14 bg-gradient-to-r from-blue-400 to-blue-900 hover:scale-[1.02] text-white rounded-full font-black text-[10px] uppercase tracking-[0.25em] shadow-xl transition-all active:scale-95 disabled:opacity-50 mt-4"
            >
              {isLoading ? 'VERIFICANDO...' : 'ENTRAR NO PORTAL'}
            </button>

            <button
              type="button"
              onClick={() => { setAuthMode('register'); setError(''); setMessage(''); }}
              className="mt-4 text-[9px] font-black text-gray-400 uppercase tracking-widest hover:text-[#002b5c] transition-colors"
            >
              Primeiro acesso? <span className="text-teal-600">Cadastre-se aqui</span>
            </button>

            <button type="button" onClick={() => { resetAdminForm(); setAuthMode('admin_register'); }}
              className="mt-1 text-[8px] font-bold text-gray-300 uppercase tracking-widest hover:text-teal-500 transition-colors">
              🔑 Cadastro pela gestão
            </button>
          </form>
        )}

        {authMode === 'register' && (
          <form onSubmit={handleRegister} className="w-full space-y-3 flex flex-col items-center animate-fade-in">
            <div className="space-y-1 w-full text-left">
              <label className="text-[9px] font-black text-[#002b5c] uppercase ml-6 tracking-widest opacity-70">E-mail Institucional</label>
              <input required type="email" placeholder="nome@prof.educacao.sp.gov.br" value={email} onChange={e => setEmail(e.target.value)} className="w-full h-11 px-6 bg-gray-50 border border-gray-100 rounded-full text-xs font-bold text-[#002b5c] outline-none focus:ring-2 focus:ring-teal-500 transition-all lowercase" />
            </div>
            <div className="space-y-1 w-full text-left">
              <label className="text-[9px] font-black text-[#002b5c] uppercase ml-6 tracking-widest opacity-70">Criar Senha</label>
              <input required type="password" placeholder="Mínimo 6 caracteres" value={password} onChange={e => setPassword(e.target.value)} className="w-full h-11 px-6 bg-gray-50 border border-gray-100 rounded-full text-xs font-bold text-[#002b5c] outline-none focus:ring-2 focus:ring-teal-500 transition-all" />
            </div>
            <div className="space-y-1 w-full text-left">
              <label className="text-[9px] font-black text-[#002b5c] uppercase ml-6 tracking-widest opacity-70">Confirmar Senha</label>
              <input required type="password" placeholder="••••••••" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full h-11 px-6 bg-gray-50 border border-gray-100 rounded-full text-xs font-bold text-[#002b5c] outline-none focus:ring-2 focus:ring-teal-500 transition-all" />
            </div>

            {error && <div className="p-3 w-full bg-red-50 text-red-600 rounded-[24px] text-[8.5px] font-black text-center uppercase border border-red-100 leading-tight">{error}</div>}
            {message && <div className="p-3 w-full bg-teal-50 text-teal-600 rounded-[24px] text-[8.5px] font-black text-center uppercase border border-teal-100 leading-tight">{message}</div>}

            <button type="submit" disabled={isLoading} className="w-full h-14 bg-gradient-to-r from-teal-400 to-teal-700 hover:scale-[1.02] text-white rounded-full font-black text-[10px] uppercase tracking-[0.25em] shadow-xl transition-all active:scale-95 disabled:opacity-50 mt-4">
              {isLoading ? 'CRIANDO CONTA...' : 'CRIAR MINHA CONTA'}
            </button>

            <button type="button" onClick={() => { setAuthMode('login'); setError(''); setMessage(''); }} className="mt-4 text-[9px] font-black text-gray-400 uppercase tracking-widest hover:text-[#002b5c] transition-colors">
              Já tem conta? <span className="text-teal-600">Voltar para o Login</span>
            </button>
          </form>
        )}

        {authMode === 'forgot' && (
          <form onSubmit={handleResetPassword} className="w-full space-y-6 flex flex-col items-center animate-fade-in">
            <div className="text-center px-4">
              <p className="text-[9px] font-bold text-gray-400 uppercase leading-relaxed">Insira seu e-mail institucional abaixo para receber as instruções de redefinição.</p>
            </div>
            <div className="space-y-1 w-full text-left">
              <label className="text-[9px] font-black text-[#002b5c] uppercase ml-6 tracking-widest opacity-70">E-mail Institucional</label>
              <input required type="email" placeholder="nome@prof.educacao.sp.gov.br" value={email} onChange={e => setEmail(e.target.value)} className="w-full h-12 px-6 bg-gray-50 border border-gray-100 rounded-full text-xs font-bold text-[#002b5c] outline-none focus:ring-2 focus:ring-teal-500 transition-all lowercase" />
            </div>

            {error && <div className="p-3 w-full bg-red-50 text-red-600 rounded-[24px] text-[8.5px] font-black text-center uppercase border border-red-100 leading-tight">{error}</div>}
            {message && <div className="p-3 w-full bg-teal-50 text-teal-600 rounded-[24px] text-[8.5px] font-black text-center uppercase border border-teal-100 leading-tight">{message}</div>}

            <button type="submit" disabled={isLoading} className="w-full h-14 bg-gradient-to-r from-orange-400 to-orange-700 hover:scale-[1.02] text-white rounded-full font-black text-[10px] uppercase tracking-[0.25em] shadow-xl transition-all active:scale-95 disabled:opacity-50 mt-4">
              {isLoading ? 'ENVIANDO...' : 'ENVIAR INSTRUÇÕES'}
            </button>

            <button type="button" onClick={() => { setAuthMode('login'); setError(''); setMessage(''); }} className="mt-4 text-[9px] font-black text-gray-400 uppercase tracking-widest hover:text-[#002b5c] transition-colors">
              Lembrei a senha! <span className="text-teal-600">Voltar</span>
            </button>
          </form>
        )}

        {/* ── CADASTRO PELA GESTÃO ──────────────────────────────────────── */}
        {authMode === 'admin_register' && (
          <div className="w-full animate-fade-in">
            {adminStep === 'auth' && (
              <form onSubmit={handleAdminAuth} className="w-full space-y-4 flex flex-col items-center">
                <div className="w-full p-4 bg-blue-50 border border-blue-100 rounded-2xl text-center">
                  <p className="text-[9px] font-black text-blue-700 uppercase tracking-wide">🔐 Confirme sua identidade de gestor para continuar</p>
                </div>
                <div className="space-y-1 w-full text-left">
                  <label className="text-[9px] font-black text-[#002b5c] uppercase ml-6 tracking-widest opacity-70">Seu e-mail de Gestor</label>
                  <input required type="email" placeholder="seu@prof.educacao.sp.gov.br" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} className="w-full h-11 px-6 bg-gray-50 border border-gray-100 rounded-full text-xs font-bold text-[#002b5c] outline-none focus:ring-2 focus:ring-blue-500 transition-all lowercase" />
                </div>
                <div className="space-y-1 w-full text-left">
                  <label className="text-[9px] font-black text-[#002b5c] uppercase ml-6 tracking-widest opacity-70">Sua Senha</label>
                  <input required type="password" placeholder="••••••••" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} className="w-full h-11 px-6 bg-gray-50 border border-gray-100 rounded-full text-xs font-bold text-[#002b5c] outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
                </div>
                {error && <div className="p-3 w-full bg-red-50 text-red-600 rounded-[24px] text-[8.5px] font-black text-center uppercase border border-red-100 leading-tight">{error}</div>}
                <button type="submit" disabled={isLoading} className="w-full h-12 bg-gradient-to-r from-blue-700 to-blue-900 text-white rounded-full font-black text-[10px] uppercase tracking-widest shadow-lg transition-all active:scale-95 disabled:opacity-50 mt-2">
                  {isLoading ? 'VERIFICANDO...' : 'CONFIRMAR IDENTIDADE'}
                </button>
                <button type="button" onClick={() => { resetAdminForm(); setAuthMode('login'); }} className="mt-2 text-[9px] font-black text-gray-400 uppercase tracking-widest hover:text-[#002b5c] transition-colors">← Voltar para o Login</button>
              </form>
            )}
            {adminStep === 'form' && (
              <form onSubmit={handleAdminRegisterProfessor} className="w-full space-y-4 flex flex-col items-center">
                <div className="w-full p-4 bg-teal-50 border border-teal-100 rounded-2xl text-center">
                  <p className="text-[9px] font-black text-teal-700 uppercase tracking-wide">✅ Identidade confirmada — cadastre o professor abaixo</p>
                </div>
                <div className="space-y-1 w-full text-left">
                  <label className="text-[9px] font-black text-[#002b5c] uppercase ml-6 tracking-widest opacity-70">E-mail do Professor</label>
                  <input required type="email" placeholder="professor@prof.educacao.sp.gov.br" value={newProfEmail} onChange={e => setNewProfEmail(e.target.value)} className="w-full h-11 px-6 bg-gray-50 border border-gray-100 rounded-full text-xs font-bold text-[#002b5c] outline-none focus:ring-2 focus:ring-teal-500 transition-all lowercase" />
                </div>
                <div className="space-y-1 w-full text-left">
                  <label className="text-[9px] font-black text-[#002b5c] uppercase ml-6 tracking-widest opacity-70">Nome Completo do Professor</label>
                  <input required type="text" placeholder="NOME COMPLETO" value={newProfNome} onChange={e => setNewProfNome(e.target.value.toUpperCase())} className="w-full h-11 px-6 bg-gray-50 border border-gray-100 rounded-full text-xs font-bold text-[#002b5c] outline-none focus:ring-2 focus:ring-teal-500 transition-all uppercase" />
                </div>
                <div className="w-full p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl">
                  <p className="text-[8px] font-black text-amber-600 uppercase tracking-widest mb-1">Senha temporária:</p>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xl font-black text-amber-800 tracking-widest">{tempPassword}</span>
                    <button type="button" onClick={() => setTempPassword(generateTempPassword())} className="text-[8px] font-black text-amber-600 uppercase hover:text-amber-800 underline whitespace-nowrap">Nova senha</button>
                  </div>
                  <p className="text-[8px] font-bold text-amber-500 uppercase mt-2 leading-relaxed">⚠️ Anote e repasse ao professor para o primeiro acesso.</p>
                </div>
                {error && <div className="p-3 w-full bg-red-50 text-red-600 rounded-[24px] text-[8.5px] font-black text-center uppercase border border-red-100 leading-tight">{error}</div>}
                {message && <div className="p-4 w-full bg-teal-50 border border-teal-200 rounded-2xl"><pre className="text-[9px] font-black text-teal-700 uppercase leading-relaxed whitespace-pre-wrap text-center">{message}</pre></div>}
                <button type="submit" disabled={isLoading} className="w-full h-12 bg-gradient-to-r from-teal-500 to-teal-700 text-white rounded-full font-black text-[10px] uppercase tracking-widest shadow-lg transition-all active:scale-95 disabled:opacity-50 mt-2">
                  {isLoading ? 'CADASTRANDO...' : 'CADASTRAR PROFESSOR'}
                </button>
                <button type="button" onClick={() => { resetAdminForm(); setAuthMode('login'); }} className="mt-2 text-[9px] font-black text-gray-400 uppercase tracking-widest hover:text-[#002b5c] transition-colors">← Voltar para o Login</button>
              </form>
            )}
          </div>
        )}

        <div className="mt-8 text-center w-full">
          <p className="text-[8px] font-bold text-gray-300 uppercase tracking-widest leading-relaxed">
            ESTE PORTAL É DE USO EXCLUSIVO DOS<br />PROFISSIONAIS DA EE FIORAVANTE IERVOLINO
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

export default Login;
