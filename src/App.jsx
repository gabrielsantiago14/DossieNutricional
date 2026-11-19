import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import AuthScreen from './AuthScreen';
import { INITIAL_STATE, ANATOMY_LANDMARKS } from './defaultData';
import {
  LayoutDashboard,
  Syringe,
  Utensils,
  Ruler,
  Cloud,
  CloudOff,
  CheckCircle2,
  LogOut,
  RotateCcw,
  Droplets,
  Flame,
  HeartPulse,
  Scale,
  AlertTriangle,
} from 'lucide-react';

const STORAGE_KEY = 'dossie_recomposicao_v2_data';

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [state, setState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : INITIAL_STATE;
    } catch {
      return INITIAL_STATE;
    }
  });
  const [activeTab, setActiveTab] = useState('resumo');
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const [selectedLandmark, setSelectedLandmark] = useState(ANATOMY_LANDMARKS[4]); // Cintura default
  const isInitialLoad = useRef(true);

  // 1. Auth session listener
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2. Load data from Supabase when user logs in
  useEffect(() => {
    if (!isSupabaseConfigured || !session?.user) return;

    async function fetchUserData() {
      setSyncStatus('saving');
      const { data, error } = await supabase
        .from('user_protocols')
        .select('data')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (!error && data?.data && Object.keys(data.data).length > 0) {
        setState(data.data);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data.data));
      } else if (!error && !data) {
        // First login: seed cloud with initial state
        await supabase.from('user_protocols').upsert({
          user_id: session.user.id,
          data: state,
          updated_at: new Date().toISOString(),
        });
      }
      setSyncStatus('saved');
      isInitialLoad.current = false;
    }

    fetchUserData();
  }, [session?.user?.id]);

  // 3. Auto-save locally & debounce sync to Supabase
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    if (!isSupabaseConfigured || !session?.user) return;
    if (isInitialLoad.current) return;

    setSyncStatus('saving');
    const timer = setTimeout(async () => {
      const { error } = await supabase.from('user_protocols').upsert({
        user_id: session.user.id,
        data: state,
        updated_at: new Date().toISOString(),
      });
      setSyncStatus(error ? 'error' : 'saved');
    }, 800);

    return () => clearTimeout(timer);
  }, [state, session?.user?.id]);

  // Derived calculations
  const metrics = useMemo(() => {
    const baseW = parseFloat(state.profile.baseWeight) || 80.0;
    const heightM = parseFloat(state.profile.height) || 1.74;
    const validWeights = state.weeks
      .map((w) => parseFloat(w.weight))
      .filter((v) => !isNaN(v) && v > 0);
    const currentW = validWeights.length > 0 ? validWeights[validWeights.length - 1] : baseW;
    const weightDelta = currentW - baseW;

    const totalPlanned = state.weeks.reduce((acc, w) => acc + w.dose, 0);
    const totalApplied = state.weeks
      .filter((w) => w.applied)
      .reduce((acc, w) => acc + w.dose, 0);
    const remainingVial = Math.max(0, totalPlanned - totalApplied);
    const appliedCount = state.weeks.filter((w) => w.applied).length;

    const validFcr = state.weeks
      .map((w) => parseFloat(w.fcr))
      .filter((v) => !isNaN(v) && v > 0);
    const avgFcr = validFcr.length > 0
      ? validFcr.reduce((a, b) => a + b, 0) / validFcr.length
      : 0;

    // Nutrition totals
    const macroTotals = state.foods.reduce(
      (acc, f) => {
        const q = parseFloat(f.qty) || 0;
        const prot = q * f.p;
        const carb = q * f.c;
        const fat = q * f.f;
        const kcal = prot * 4 + carb * 4 + fat * 9;
        return {
          prot: acc.prot + prot,
          carb: acc.carb + carb,
          fat: acc.fat + fat,
          kcal: acc.kcal + kcal,
        };
      },
      { prot: 0, carb: 0, fat: 0, kcal: 0 }
    );

    const targets =
      state.profile.dayMode === 'treino'
        ? { kcal: 2350, prot: 190, carb: 270, fat: 60 }
        : state.profile.dayMode === 'descanso'
        ? { kcal: 1750, prot: 190, carb: 120, fat: 65 }
        : { kcal: 2750, prot: 190, carb: 380, fat: 60 };

    // Biweekly weights synced from weeks 2, 4, 6, 8, 10
    const biweeklyWeights = {
      s0: baseW,
      s2: parseFloat(state.weeks[1]?.weight) || null,
      s4: parseFloat(state.weeks[3]?.weight) || null,
      s6: parseFloat(state.weeks[5]?.weight) || null,
      s8: parseFloat(state.weeks[7]?.weight) || null,
      s10: parseFloat(state.weeks[9]?.weight) || null,
    };

    const getLatestMeasure = (obj, fallback = null) => {
      const keys = ['s10', 's8', 's6', 's4', 's2', 's0'];
      for (const k of keys) {
        const val = parseFloat(obj?.[k]);
        if (!isNaN(val) && val > 0) return val;
      }
      return fallback;
    };

    const bf0 = parseFloat(state.measures.bodyFat?.s0) || 18.0;
    const bfNow = getLatestMeasure(state.measures.bodyFat, bf0);
    const fatMass0 = baseW * (bf0 / 100);
    const leanMass0 = baseW - fatMass0;
    const fatMassNow = currentW * (bfNow / 100);
    const leanMassNow = currentW - fatMassNow;

    const waist0 = parseFloat(state.measures.cintura?.s0) || null;
    const waistNow = getLatestMeasure(state.measures.cintura, waist0);
    const hipNow = getLatestMeasure(state.measures.quadril, null);
    const rcqNow = waistNow && hipNow ? waistNow / hipNow : null;

    return {
      baseW,
      heightM,
      imc0: baseW / (heightM * heightM),
      currentW,
      weightDelta,
      totalPlanned,
      totalApplied,
      remainingVial,
      appliedCount,
      avgFcr,
      macroTotals,
      targets,
      biweeklyWeights,
      bf0,
      bfNow,
      fatMass0,
      fatMassNow,
      leanMass0,
      leanMassNow,
      waist0,
      waistNow,
      rcqNow,
    };
  }, [state]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-petrol-900 flex items-center justify-center text-white text-sm">
        Carregando protocolo...
      </div>
    );
  }

  if (isSupabaseConfigured && !session) {
    return <AuthScreen />;
  }

  const updateWeek = (id, field, value) => {
    setState((prev) => ({
      ...prev,
      weeks: prev.weeks.map((w) => (w.id === id ? { ...w, [field]: value } : w)),
    }));
  };

  const updateFoodQty = (id, qty) => {
    setState((prev) => ({
      ...prev,
      foods: prev.foods.map((f) => (f.id === id ? { ...f, qty } : f)),
    }));
  };

  const updateMeasure = (key, period, value) => {
    setState((prev) => ({
      ...prev,
      measures: {
        ...prev.measures,
        [key]: {
          ...prev.measures[key],
          [period]: value,
        },
      },
    }));
  };

  const handleReset = () => {
    if (window.confirm('Deseja restaurar todos os valores padrão do protocolo?')) {
      setState(INITIAL_STATE);
    }
  };

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen bg-slate-100 pb-20">
      {/* Top Executive Banner */}
      <header className="bg-petrol-900 text-white shadow-lg sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emeraldBrand-600 rounded">
                Dossiê Técnico 2.0
              </span>
              <span className="text-[11px] text-slate-300">25,0 mg • 10 Semanas</span>
            </div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight mt-0.5">
              Recomposição Corporal & Farmacocinética
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {/* Cloud Sync Indicator */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-petrol-800 text-[11px]">
              {isSupabaseConfigured ? (
                <>
                  <Cloud className="w-3.5 h-3.5 text-emerald-300" />
                  <span className="text-slate-200">
                    {syncStatus === 'saving'
                      ? 'Salvando...'
                      : syncStatus === 'error'
                      ? 'Erro sync'
                      : 'Nuvem ativa'}
                  </span>
                </>
              ) : (
                <>
                  <CloudOff className="w-3.5 h-3.5 text-amber-300" />
                  <span className="text-slate-200">Modo Local</span>
                </>
              )}
            </div>

            <button
              onClick={handleReset}
              title="Restaurar padrão"
              className="p-2 rounded-lg bg-petrol-800 hover:bg-petrol-700 text-slate-200 transition"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {isSupabaseConfigured && (
              <button
                onClick={handleLogout}
                title="Sair da conta"
                className="p-2 rounded-lg bg-petrol-800 hover:bg-red-900/60 text-slate-200 transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="bg-petrol-800/90 border-t border-white/10">
          <div className="max-w-6xl mx-auto px-2 flex overflow-x-auto no-scrollbar">
            {[
              { id: 'resumo', label: 'Resumo Executivo', icon: LayoutDashboard },
              { id: 'peptideo', label: 'Controle Peptídeo', icon: Syringe },
              { id: 'nutricao', label: 'Nutrição & Ciclagem', icon: Utensils },
              { id: 'medidas', label: 'Medidas & Mapa', icon: Ruler },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold whitespace-nowrap border-b-2 transition ${
                    active
                      ? 'border-emerald-400 text-white bg-white/5'
                      : 'border-transparent text-slate-300 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 pt-5 space-y-6">
        {/* ================================================================= */}
        {/* TAB 1: RESUMO EXECUTIVO                                           */}
        {/* ================================================================= */}
        {activeTab === 'resumo' && (
          <div className="space-y-6">
            {/* 6 KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-petrol-800">
                <p className="text-[11px] font-bold uppercase text-slate-500">Evolução do Peso</p>
                <p className="text-xl sm:text-2xl font-bold text-petrol-900 mt-1">
                  {metrics.weightDelta > 0 ? `+${metrics.weightDelta.toFixed(1)}` : metrics.weightDelta.toFixed(1)} kg
                </p>
                <p className="text-[11px] text-emeraldBrand-600 font-medium mt-1">
                  Atual: {metrics.currentW.toFixed(1)} kg (Meta: -8,5 a -11,5 kg)
                </p>
              </div>

              <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-emeraldBrand-600">
                <p className="text-[11px] font-bold uppercase text-slate-500">Massa Magra Estimada</p>
                <p className="text-xl sm:text-2xl font-bold text-petrol-900 mt-1">
                  {metrics.leanMassNow.toFixed(1)} kg
                </p>
                <p className="text-[11px] text-emeraldBrand-600 font-medium mt-1">
                  Var: {(metrics.leanMassNow - metrics.leanMass0 >= 0 ? '+' : '')}
                  {(metrics.leanMassNow - metrics.leanMass0).toFixed(2)} kg (Alvo &gt;90%)
                </p>
              </div>

              <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-petrol-800">
                <p className="text-[11px] font-bold uppercase text-slate-500">Massa Gorda Estimada</p>
                <p className="text-xl sm:text-2xl font-bold text-petrol-900 mt-1">
                  {metrics.fatMassNow.toFixed(1)} kg ({metrics.bfNow.toFixed(1)}%)
                </p>
                <p className="text-[11px] text-emeraldBrand-600 font-medium mt-1">
                  Var: {(metrics.fatMassNow - metrics.fatMass0 >= 0 ? '+' : '')}
                  {(metrics.fatMassNow - metrics.fatMass0).toFixed(2)} kg
                </p>
              </div>

              <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-emeraldBrand-600">
                <p className="text-[11px] font-bold uppercase text-slate-500">Cintura & RCQ</p>
                <p className="text-xl sm:text-2xl font-bold text-petrol-900 mt-1">
                  {metrics.waistNow ? `${metrics.waistNow.toFixed(1)} cm` : '—'}
                </p>
                <p className="text-[11px] text-emeraldBrand-600 font-medium mt-1">
                  {metrics.rcqNow ? `RCQ Atual: ${metrics.rcqNow.toFixed(2)}` : 'Preencha na aba Medidas'}
                </p>
              </div>

              <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-petrol-800">
                <p className="text-[11px] font-bold uppercase text-slate-500">Progresso do Frasco (25 mg)</p>
                <p className="text-xl sm:text-2xl font-bold text-petrol-900 mt-1">
                  {metrics.appliedCount}/10 sem ({Math.round((metrics.appliedCount / 10) * 100)}%)
                </p>
                <p className="text-[11px] text-emeraldBrand-600 font-medium mt-1">
                  Aplicado: {metrics.totalApplied.toFixed(1)} mg • Saldo: {metrics.remainingVial.toFixed(1)} mg
                </p>
              </div>

              <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-emeraldBrand-600">
                <p className="text-[11px] font-bold uppercase text-slate-500">FCR Média & Proteína</p>
                <p className="text-xl sm:text-2xl font-bold text-petrol-900 mt-1">
                  {metrics.avgFcr > 0 ? `${metrics.avgFcr.toFixed(0)} bpm` : '— bpm'}
                </p>
                <p className="text-[11px] text-emeraldBrand-600 font-medium mt-1">
                  Cardápio: {(metrics.macroTotals.prot / metrics.baseW).toFixed(2)} g/kg ({metrics.macroTotals.prot.toFixed(0)}g)
                </p>
              </div>
            </div>

            {/* Visual Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Pharmacokinetic Curve Bar Chart */}
              <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
                <h2 className="text-sm font-bold text-petrol-900 mb-1">
                  Curva Farmacocinética: Titulação & Desmame (25,0 mg)
                </h2>
                <p className="text-xs text-slate-500 mb-4">
                  Barras em verde indicam doses já aplicadas • Pico plasmático: Quinta a Domingo
                </p>
                <div className="h-44 flex items-end gap-2 pt-4 px-1 border-b border-slate-200">
                  {state.weeks.map((w) => {
                    const heightPct = (w.dose / 4.0) * 100;
                    return (
                      <div key={w.id} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-[10px] font-bold text-slate-700">{w.dose.toFixed(1)}</span>
                        <div
                          style={{ height: `${heightPct}%` }}
                          className={`w-full rounded-t-md transition-all ${
                            w.applied ? 'bg-emeraldBrand-600' : 'bg-petrol-800/80'
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-2 px-1 pt-1.5">
                  {state.weeks.map((w) => (
                    <div key={w.id} className="flex-1 text-center text-[10px] font-semibold text-slate-500">
                      S{w.id}
                    </div>
                  ))}
                </div>
              </div>

              {/* Nutrition & Clinical Alerts Card */}
              <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 flex flex-col justify-between">
                <div>
                  <h2 className="text-sm font-bold text-petrol-900 mb-1">
                    Balanço do Cardápio Ativo ({Math.round(metrics.macroTotals.kcal)} kcal)
                  </h2>
                  <p className="text-xs text-slate-500 mb-4">
                    Comparativo contra meta do modo:{' '}
                    <span className="font-semibold text-petrol-800 uppercase">{state.profile.dayMode}</span>
                  </p>

                  <div className="space-y-3">
                    {[
                      { label: 'Proteínas (Anticatabólico)', val: metrics.macroTotals.prot, target: metrics.targets.prot, color: 'bg-emeraldBrand-600' },
                      { label: 'Carboidratos (Glicogênio)', val: metrics.macroTotals.carb, target: metrics.targets.carb, color: 'bg-petrol-800' },
                      { label: 'Gorduras (Suporte Hormonal)', val: metrics.macroTotals.fat, target: metrics.targets.fat, color: 'bg-amber-500' },
                    ].map((m) => {
                      const pct = Math.min(100, Math.round((m.val / m.target) * 100));
                      return (
                        <div key={m.label}>
                          <div className="flex justify-between text-xs font-semibold mb-1">
                            <span className="text-slate-700">{m.label}</span>
                            <span className="text-petrol-900">
                              {m.val.toFixed(0)}g / {m.target}g ({pct}%)
                            </span>
                          </div>
                          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full ${m.color} rounded-full`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 p-3 rounded-lg bg-emeraldBrand-50 border border-emerald-200 text-xs text-petrol-900 space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <Droplets className="w-4 h-4 text-emeraldBrand-600" />
                    Pilares Críticos de Execução:
                  </p>
                  <p>• Aplicação às <strong>Quartas-feiras</strong> → Pico Cmax de Quinta a Domingo.</p>
                  <p>• <strong>3,5L a 4,5L água + 3–4g sal integral</strong> para prevenir cãibras no futevôlei.</p>
                </div>
              </div>
            </div>

            {/* Integrated Timeline Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-5 py-3.5 bg-petrol-800 text-white flex items-center justify-between">
                <h2 className="text-sm font-bold">Linha do Tempo Consolidada (10 Semanas)</h2>
                <button
                  onClick={() => setActiveTab('peptideo')}
                  className="text-xs bg-white/15 hover:bg-white/25 px-3 py-1 rounded font-semibold transition"
                >
                  Editar Registros →
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Semana</th>
                      <th className="py-2.5 px-3">Fase</th>
                      <th className="py-2.5 px-3 text-center">Dose</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-center">Peso (kg)</th>
                      <th className="py-2.5 px-3 text-center">Var. Total</th>
                      <th className="py-2.5 px-3 text-center">FCR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {state.weeks.map((w) => {
                      const pw = parseFloat(w.weight);
                      const diff = !isNaN(pw) && pw > 0 ? pw - metrics.baseW : null;
                      return (
                        <tr key={w.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-bold text-petrol-900">{w.fullLabel}</td>
                          <td className="py-2.5 px-3 text-slate-600">{w.phase}</td>
                          <td className="py-2.5 px-3 text-center font-bold">{w.dose.toFixed(1)} mg</td>
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                w.applied
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {w.applied ? 'Aplicada' : 'Pendente'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center font-semibold">
                            {!isNaN(pw) && pw > 0 ? `${pw.toFixed(1)} kg` : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold text-emeraldBrand-600">
                            {diff !== null ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)} kg` : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {w.fcr ? `${w.fcr} bpm` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: CONTROLE PEPTÍDEO                                          */}
        {/* ================================================================= */}
        {activeTab === 'peptideo' && (
          <div className="space-y-5">
            {/* Baseline Config Card */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase">Peso Base Inicial (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={state.profile.baseWeight}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      profile: { ...prev.profile, baseWeight: e.target.value },
                    }))
                  }
                  className="mt-1 w-full px-3 py-2 text-sm font-bold bg-amber-50/70 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase">Altura (m)</label>
                <input
                  type="number"
                  step="0.01"
                  value={state.profile.height}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      profile: { ...prev.profile, height: e.target.value },
                    }))
                  }
                  className="mt-1 w-full px-3 py-2 text-sm font-bold bg-amber-50/70 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="bg-emeraldBrand-50 rounded-lg p-2.5 flex flex-col justify-center">
                <span className="text-[11px] font-bold text-slate-500 uppercase">IMC Inicial</span>
                <span className="text-lg font-bold text-petrol-900">{metrics.imc0.toFixed(1)} kg/m²</span>
              </div>
              <div className="bg-emeraldBrand-50 rounded-lg p-2.5 flex flex-col justify-center">
                <span className="text-[11px] font-bold text-slate-500 uppercase">Saldo do Frasco</span>
                <span className="text-lg font-bold text-emeraldBrand-600">{metrics.remainingVial.toFixed(1)} mg</span>
              </div>
            </div>

            {/* Weekly Interactive Cards */}
            <div className="space-y-3">
              {state.weeks.map((w, idx) => {
                const acum = state.weeks.slice(0, idx + 1).reduce((s, item) => s + item.dose, 0);
                return (
                  <div
                    key={w.id}
                    className={`bg-white rounded-xl p-4 shadow-sm border transition ${
                      w.applied ? 'border-emerald-400 bg-emerald-50/20' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2.5">
                        <button
                          onClick={() => updateWeek(w.id, 'applied', !w.applied)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                            w.applied
                              ? 'bg-emeraldBrand-600 text-white'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          {w.applied ? 'Aplicada' : 'Marcar Aplicação'}
                        </button>
                        <div>
                          <span className="font-bold text-sm text-petrol-900">{w.fullLabel}</span>
                          <span className="mx-2 text-slate-300">|</span>
                          <span className="text-xs font-medium text-slate-600">{w.phase}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="px-2.5 py-1 rounded bg-petrol-900 text-white font-bold">
                          Dose: {w.dose.toFixed(1)} mg
                        </span>
                        <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 font-semibold">
                          Acum: {acum.toFixed(1)} mg
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase">Data (Quarta)</label>
                        <input
                          type="date"
                          value={w.date}
                          onChange={(e) => updateWeek(w.id, 'date', e.target.value)}
                          className="mt-1 w-full px-2.5 py-1.5 text-xs bg-amber-50/60 border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase">Hora</label>
                        <input
                          type="time"
                          value={w.time}
                          onChange={(e) => updateWeek(w.id, 'time', e.target.value)}
                          className="mt-1 w-full px-2.5 py-1.5 text-xs bg-amber-50/60 border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase">Peso Jejum (kg)</label>
                        <input
                          type="number"
                          step="0.1"
                          placeholder="Ex: 78.5"
                          value={w.weight}
                          onChange={(e) => updateWeek(w.id, 'weight', e.target.value)}
                          className="mt-1 w-full px-2.5 py-1.5 text-xs font-bold bg-amber-50/60 border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase">FCR Repouso (bpm)</label>
                        <input
                          type="number"
                          placeholder="Ex: 64"
                          value={w.fcr}
                          onChange={(e) => updateWeek(w.id, 'fcr', e.target.value)}
                          className="mt-1 w-full px-2.5 py-1.5 text-xs font-bold bg-amber-50/60 border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="mt-3">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase">
                        Sintomas, Treino & Observações
                      </label>
                      <textarea
                        rows={2}
                        value={w.notes}
                        onChange={(e) => updateWeek(w.id, 'notes', e.target.value)}
                        className="mt-1 w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-petrol-800"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: NUTRIÇÃO & CICLAGEM                                        */}
        {/* ================================================================= */}
        {activeTab === 'nutricao' && (
          <div className="space-y-5">
            {/* Day Mode Selector & Live Totals */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase text-petrol-900">Selecione o Modo do Dia:</span>
                <div className="flex gap-2">
                  {[
                    { id: 'treino', label: 'Treino Pesado (5x)' },
                    { id: 'descanso', label: 'Descanso (2x)' },
                    { id: 'refeed', label: 'Refeed (21 dias)' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() =>
                        setState((prev) => ({
                          ...prev,
                          profile: { ...prev.profile, dayMode: m.id },
                        }))
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                        state.profile.dayMode === m.id
                          ? 'bg-petrol-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
                <div className="p-3 rounded-lg bg-slate-50">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Calorias</span>
                  <p className="text-lg font-bold text-petrol-900">
                    {Math.round(metrics.macroTotals.kcal)} <span className="text-xs font-normal text-slate-500">/ {metrics.targets.kcal}</span>
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-emeraldBrand-50">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Proteínas</span>
                  <p className="text-lg font-bold text-emeraldBrand-600">
                    {metrics.macroTotals.prot.toFixed(1)}g <span className="text-xs font-normal text-slate-500">/ {metrics.targets.prot}g</span>
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Carboidratos</span>
                  <p className="text-lg font-bold text-petrol-800">
                    {metrics.macroTotals.carb.toFixed(1)}g <span className="text-xs font-normal text-slate-500">/ {metrics.targets.carb}g</span>
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Gorduras</span>
                  <p className="text-lg font-bold text-amber-600">
                    {metrics.macroTotals.fat.toFixed(1)}g <span className="text-xs font-normal text-slate-500">/ {metrics.targets.fat}g</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Editable Food Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-petrol-800 text-white">
                <h2 className="text-sm font-bold">Cardápio Econômico Editável & Conjugações GI</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Refeição</th>
                      <th className="py-2.5 px-3">Alimento</th>
                      <th className="py-2.5 px-3 text-center">Qtd</th>
                      <th className="py-2.5 px-3 text-center">Prot</th>
                      <th className="py-2.5 px-3 text-center">Carb</th>
                      <th className="py-2.5 px-3 text-center">Gord</th>
                      <th className="py-2.5 px-3 text-center">Kcal</th>
                      <th className="py-2.5 px-3">Ajuste Descanso / Conjugação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {state.foods.map((f) => {
                      const q = parseFloat(f.qty) || 0;
                      const p = q * f.p;
                      const c = q * f.c;
                      const g = q * f.f;
                      const k = p * 4 + c * 4 + g * 9;
                      return (
                        <tr key={f.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-semibold text-petrol-900 whitespace-nowrap">{f.meal}</td>
                          <td className="py-2.5 px-3 font-medium">{f.name}</td>
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="number"
                              value={f.qty}
                              onChange={(e) => updateFoodQty(f.id, e.target.value)}
                              className="w-16 px-2 py-1 text-center font-bold bg-amber-50 border border-slate-300 rounded"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold text-emeraldBrand-600">{p.toFixed(1)}g</td>
                          <td className="py-2.5 px-3 text-center">{c.toFixed(1)}g</td>
                          <td className="py-2.5 px-3 text-center">{g.toFixed(1)}g</td>
                          <td className="py-2.5 px-3 text-center font-bold">{Math.round(k)}</td>
                          <td className="py-2.5 px-3 text-slate-600">
                            <span className="font-semibold text-petrol-800">{f.restTip}:</span> {f.subTip}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 4: MEDIDAS CORPORAIS & MAPA ANATÔMICO                         */}
        {/* ================================================================= */}
        {activeTab === 'medidas' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Interactive Anatomical Landmark Map */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 flex flex-col items-center">
              <h2 className="text-sm font-bold text-petrol-900 self-start">
                Mapa Anatômico de Medição
              </h2>
              <p className="text-xs text-slate-500 self-start mb-3">
                Toque nos pontos para ver a instrução exata de fita métrica
              </p>

              <svg viewBox="0 0 300 470" className="w-full max-w-[260px] h-auto">
                {/* Clean Athletic Male Silhouette */}
                <g fill="#E2E8F0" stroke="#13313D" strokeWidth="2">
                  {/* Head & Neck */}
                  <circle cx="150" cy="48" r="24" />
                  <rect x="139" y="70" width="22" height="18" rx="6" />
                  {/* Torso */}
                  <path d="M104 94 Q150 84 196 94 L186 196 L184 262 L116 262 L114 196 Z" />
                  {/* Left & Right Arms */}
                  <path d="M104 94 L76 165 L68 238 L84 242 L98 175 L114 132 Z" />
                  <path d="M196 94 L224 165 L232 238 L216 242 L202 175 L186 132 Z" />
                  {/* Legs */}
                  <path d="M116 262 L118 355 L122 442 L142 442 L146 355 L148 272 L152 272 L154 355 L158 442 L178 442 L182 355 L184 262 Z" />
                </g>

                {/* Interactive Measurement Lines */}
                {ANATOMY_LANDMARKS.map((lm) => {
                  const isSelected = selectedLandmark.id === lm.id;
                  return (
                    <g
                      key={lm.id}
                      onClick={() => setSelectedLandmark(lm)}
                      className="cursor-pointer"
                    >
                      <line
                        x1={lm.x1 - 12}
                        y1={lm.y}
                        x2={lm.x2 + 12}
                        y2={lm.y}
                        stroke={isSelected ? '#1B7A5E' : '#1E4E5F'}
                        strokeWidth={isSelected ? '3.5' : '2'}
                        strokeDasharray="5,3"
                      />
                      <circle
                        cx={lm.x2 + 16}
                        cy={lm.y}
                        r={isSelected ? '7' : '5'}
                        fill={isSelected ? '#1B7A5E' : '#13313D'}
                      />
                    </g>
                  );
                })}
              </svg>

              {/* Landmark Chips */}
              <div className="flex flex-wrap gap-1.5 justify-center mt-2">
                {ANATOMY_LANDMARKS.map((lm) => (
                  <button
                    key={lm.id}
                    onClick={() => setSelectedLandmark(lm)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition ${
                      selectedLandmark.id === lm.id
                        ? 'bg-emeraldBrand-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {lm.name}
                  </button>
                ))}
              </div>

              <div className="mt-4 w-full p-3 rounded-lg bg-emeraldBrand-50 border border-emerald-200 text-xs">
                <p className="font-bold text-petrol-900">{selectedLandmark.name}</p>
                <p className="text-slate-700 mt-1">{selectedLandmark.desc}</p>
              </div>
            </div>

            {/* Biweekly Measurements Table */}
            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-petrol-800 text-white">
                <h2 className="text-sm font-bold">Ficha Antropométrica Quinzenal (cm / %)</h2>
                <p className="text-[11px] text-slate-300">
                  Os pesos das semanas 2, 4, 6, 8 e 10 são sincronizados automaticamente da aba Controle Peptídeo
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Medida</th>
                      <th className="py-2.5 px-2 text-center">Sem 0</th>
                      <th className="py-2.5 px-2 text-center">Sem 2</th>
                      <th className="py-2.5 px-2 text-center">Sem 4</th>
                      <th className="py-2.5 px-2 text-center">Sem 6</th>
                      <th className="py-2.5 px-2 text-center">Sem 8</th>
                      <th className="py-2.5 px-2 text-center">Sem 10</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {/* Synced Weight Row */}
                    <tr className="bg-emeraldBrand-50/60 font-bold text-petrol-900">
                      <td className="py-2.5 px-3">Peso Jejum (kg) [Auto]</td>
                      {['s0', 's2', 's4', 's6', 's8', 's10'].map((k) => (
                        <td key={k} className="py-2.5 px-2 text-center">
                          {metrics.biweeklyWeights[k] ? metrics.biweeklyWeights[k].toFixed(1) : '—'}
                        </td>
                      ))}
                    </tr>

                    {[
                      { key: 'bodyFat', label: '% Gordura Corporal' },
                      { key: 'ombros', label: 'Ombros (cm)' },
                      { key: 'torax', label: 'Tórax / Peitoral (cm)' },
                      { key: 'cintura', label: 'Cintura (cm)' },
                      { key: 'abdomen', label: 'Abdômen Umbilical (cm)' },
                      { key: 'quadril', label: 'Quadril (cm)' },
                      { key: 'bracoD', label: 'Braço Direito (cm)' },
                      { key: 'bracoE', label: 'Braço Esquerdo (cm)' },
                      { key: 'antebracoD', label: 'Antebraço Direito (cm)' },
                      { key: 'antebracoE', label: 'Antebraço Esquerdo (cm)' },
                      { key: 'coxaD', label: 'Coxa Medial Dir. (cm)' },
                      { key: 'coxaE', label: 'Coxa Medial Esq. (cm)' },
                      { key: 'panturrilhaD', label: 'Panturrilha Dir. (cm)' },
                      { key: 'panturrilhaE', label: 'Panturrilha Esq. (cm)' },
                    ].map((row) => (
                      <tr key={row.key} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-medium text-slate-700 whitespace-nowrap">{row.label}</td>
                        {['s0', 's2', 's4', 's6', 's8', 's10'].map((period) => (
                          <td key={period} className="py-1.5 px-1.5 text-center">
                            <input
                              type="number"
                              step="0.1"
                              value={state.measures[row.key]?.[period] ?? ''}
                              onChange={(e) => updateMeasure(row.key, period, e.target.value)}
                              className="w-14 px-1.5 py-1 text-center font-semibold bg-amber-50/70 border border-slate-200 rounded"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
