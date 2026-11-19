import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import { Activity, Lock, Mail, UserPlus, LogIn, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function AuthScreen() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setInfoMsg('');

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data?.user && !data?.session) {
          setInfoMsg('Conta criada! Verifique seu e-mail para confirmar o cadastro ou faça login se a confirmação estiver desativada.');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setErrorMsg(err.message || 'Erro ao autenticar. Verifique e-mail e senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-petrol-900 via-petrol-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
        <div className="bg-petrol-900 px-6 py-7 text-white text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emeraldBrand-600/20 border border-emeraldBrand-600/40 mb-3">
            <Activity className="w-6 h-6 text-emerald-300" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Dossiê Técnico 10 Semanas</h1>
          <p className="text-xs text-slate-300 mt-1">
            Controle Farmacocinético, Nutrição & Antropometria na Nuvem
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {infoMsg && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{infoMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
              E-mail
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seuemail@exemplo.com"
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-petrol-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
              Senha (mín. 6 caracteres)
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-petrol-800"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-emeraldBrand-600 hover:bg-emerald-800 text-white font-semibold text-sm flex items-center justify-center gap-2 transition disabled:opacity-60"
          >
            {isSignUp ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
            {loading ? 'Processando...' : isSignUp ? 'Criar Conta Gratuita' : 'Entrar no Protocolo'}
          </button>

          <div className="pt-2 text-center border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setErrorMsg('');
                setInfoMsg('');
              }}
              className="text-xs font-medium text-petrol-800 hover:underline"
            >
              {isSignUp
                ? 'Já possui conta? Clique aqui para entrar'
                : 'Primeiro acesso? Criar conta para salvar na nuvem'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
